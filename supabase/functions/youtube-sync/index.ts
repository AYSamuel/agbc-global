// The YouTube sync (docs/spec/08, 21 §5): pulls the HQ uploads playlist
// (Data API when a key is configured, keyless RSS fallback otherwise), upserts
// idempotently on youtube_id, marks vanished videos unavailable (API mode only),
// restores reappeared ones, clears stale live flags, and ends with its
// dead-man ping. Thin handler: all decisions live in core.ts (deno-tested).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { retryTransient } from '../_shared/retry.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import {
  planDetailFetch,
  planSync,
  type ExistingSermonRow,
  type FetchedVideo,
  type SyncMode,
} from './core.ts';
import {
  fetchChannelIds,
  fetchRssVideos,
  fetchVideoDetails,
} from './youtube.ts';

const JOB = 'youtube-sync';

/**
 * Ids this run will call videos.list for, at 50 an id-batch: 20 requests, a
 * couple of seconds at the concurrency `youtube.ts` uses. An archive of 2,000+
 * therefore lands over a couple of days of six-hourly ticks rather than in one
 * long run, which is `broadcast-fanout`'s `MAX_PAGES_PER_RUN` reasoning: bound
 * the run, let live state say what is still owed. Raising it buys a faster
 * first backfill and a longer worst-case run; nothing else here depends on it.
 */
const DETAIL_BUDGET = 1_000;

/**
 * The front of the census, re-read every run so an edited title or thumbnail
 * still corrects itself within six hours (see `planDetailFetch`). One request.
 */
const REFRESH_NEWEST = 50;

/** Rows per upsert call; see the call site for why the payload is split. */
const UPSERT_CHUNK = 500;

/** PostgREST's `max_rows` (1000 locally, and a limit we do not own on the platform). */
const READ_PAGE = 1_000;
/**
 * Comfortably longer than a run (seconds) and shorter than the gap between ticks
 * (six hours), which is the shape every job in `21` §5 uses: the expiry is the
 * net under a run that died, never the thing that ends a healthy one.
 */
const LEASE = '10 minutes';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_YOUTUBE_SYNC');
  try {
    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    );

    // THE LEASE ARRIVES WITH THE SCHEDULE, and the two belong to one change.
    // This was the only one of fourteen jobs without it, which is exactly what
    // you would expect of the only one that nothing ever invoked: it predates
    // ADR 0016 (W1.3) and was never brought into the fold. Overlap could not
    // happen while a human ran it by hand; a cron entry is what makes it
    // possible, so the guard lands in the same breath as the trigger.
    //
    // Overlap would not corrupt anything, since the upsert is idempotent on
    // `youtube_id`. It would waste quota and, worse, let a run holding a STALE
    // playlist snapshot mark a video unavailable that the other run has just
    // restored, which is a visible wrong answer on a member's Watch tab.
    if (!(await claimJobLease(supabase, JOB, LEASE))) {
      await pingDeadMan(healthcheckUrl, true);
      return Response.json({ skipped: 'lease held' });
    }

    try {
      return await run(supabase, healthcheckUrl);
    } finally {
      await releaseJobLease(supabase, JOB);
    }
  } catch (error) {
    console.error('youtube-sync failed:', error);
    await captureEdgeError('youtube-sync', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'sync run failed' }, { status: 500 });
  }
});

/**
 * Every sermon row that came from YouTube, read in pages.
 *
 * PostgREST caps a response at `max_rows` and says nothing when it does, so a
 * single select would silently hand back the first thousand once the archive
 * passes that. That truncation is not a cosmetic one: this list is what rot
 * detection subtracts from the census, so a short read makes the job blind to
 * everything past the cap, and `planDetailFetch` would re-request details for
 * rows it already holds, every run, for ever.
 */
async function readExistingSermons(
  supabase: SupabaseClient,
): Promise<ExistingSermonRow[]> {
  const rows: ExistingSermonRow[] = [];
  // Advance by what the server RETURNED, not by what was asked for, and stop
  // only on an empty page. `max_rows` is 1000 in our config.toml but it is the
  // platform's setting hosted, so treating the requested size as the page size
  // would quietly drop every row past the real cap if it were ever lower. The
  // cost of not assuming is one extra request per run.
  for (let from = 0; ; ) {
    const { data, error } = await retryTransient(
      () =>
        supabase
          .from('sermons')
          .select('youtube_id, status')
          .not('youtube_id', 'is', null)
          // Ordered, because a page is only a page of something stable.
          .order('youtube_id', { ascending: true })
          .range(from, from + READ_PAGE - 1),
      { label: 'youtube-sync: sermons read' },
    );
    if (error) throw new Error(`sermons read failed: ${error.message}`);
    const page = (data ?? []) as ExistingSermonRow[];
    if (page.length === 0) return rows;
    rows.push(...page);
    from += page.length;
  }
}

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  {
    const { data: hq, error: hqError } = await retryTransient(
      () =>
        supabase
          .from('branches')
          .select('youtube_channel_id')
          .eq('is_hq', true)
          .not('youtube_channel_id', 'is', null)
          .limit(1)
          .maybeSingle(),
      { label: 'youtube-sync: branch read' },
    );
    if (hqError) throw new Error(`branches read failed: ${hqError.message}`);
    const channelId = hq?.youtube_channel_id as string | undefined;
    if (!channelId) {
      throw new Error('no HQ branch with a youtube_channel_id is configured');
    }

    const apiKey = optionalEnv('YOUTUBE_API_KEY');
    const mode: SyncMode = apiKey ? 'api' : 'rss';

    // The existing rows come first in API mode now, because they decide how
    // much of the channel this run pays to read.
    const existing = await readExistingSermons(supabase);

    // In API mode the census and the details are two questions (W4.21); the
    // keyless fallback has neither concept and keeps returning its 15 entries,
    // which rot detection ignores anyway.
    let listedIds: Set<string>;
    let fetched: FetchedVideo[];
    let census: { ids: string[]; pages: number };
    let pending = 0;

    if (apiKey) {
      const listing = await fetchChannelIds(channelId, apiKey);
      census = { ids: listing.ids, pages: listing.pages };
      listedIds = new Set(listing.ids);
      const detail = planDetailFetch(listing.ids, existing, {
        budget: DETAIL_BUDGET,
        refreshNewest: REFRESH_NEWEST,
      });
      pending = detail.pending;
      fetched = await fetchVideoDetails(
        detail.ids,
        listing.liveIds,
        apiKey,
      );
    } else {
      fetched = await fetchRssVideos(channelId);
      census = { ids: fetched.map((v) => v.youtubeId), pages: 0 };
      listedIds = new Set(census.ids);
    }

    const plan = planSync(existing, listedIds, fetched, mode);

    let upserted = 0;
    // Chunked: one jsonb argument carrying the whole archive would be a
    // multi-megabyte request body on the first backfill. The call is
    // idempotent per row, so splitting it costs nothing and a chunk that
    // fails throws before the rot marking below ever runs.
    for (let i = 0; i < plan.upserts.length; i += UPSERT_CHUNK) {
      const { data, error: upsertError } = await supabase.rpc(
        'sync_upsert_sermons',
        { rows: plan.upserts.slice(i, i + UPSERT_CHUNK) },
      );
      if (upsertError) throw new Error(`upsert failed: ${upsertError.message}`);
      upserted += (data as number | null) ?? 0;
    }

    if (plan.unavailableIds.length > 0) {
      const { error } = await supabase
        .from('sermons')
        .update({ status: 'unavailable' })
        .in('youtube_id', plan.unavailableIds);
      if (error) throw new Error(`unavailable update failed: ${error.message}`);
    }

    // No live stamping and no stale-flag clearing: the app carries no live state at all
    // (ADR 0021). A currently-running broadcast is simply a row like any other, and it
    // becomes watchable here the same way every other message does, once it ends and
    // lands in the channel's Live tab as a replay.

    const summary = {
      mode,
      channelId,
      /** The census: what the channel holds. The number this item existed for. */
      listed: census.ids.length,
      playlistPages: census.pages,
      /** The slice this run read details for; `pending` is what it still owes. */
      fetched: fetched.length,
      pending,
      upserted,
      markedUnavailable: plan.unavailableIds.length,
      restored: plan.restoredCount,
    };
    // One line, because the summary only reaches whoever invoked by hand: cron
    // fires this through pg_net, which never reads the body (20260819100000).
    console.log(`youtube-sync: ${JSON.stringify(summary)}`);

    await pingDeadMan(healthcheckUrl, true);
    return Response.json(summary);
  }
}
