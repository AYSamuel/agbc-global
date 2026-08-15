// Nightly YouTube sync (docs/spec/08, 21 §5): pulls the HQ uploads playlist
// (Data API when a key is configured, keyless RSS fallback otherwise), upserts
// idempotently on youtube_id, marks vanished videos unavailable (API mode only),
// restores reappeared ones, clears stale live flags, and ends with its
// dead-man ping. Thin handler: all decisions live in core.ts (deno-tested).

import { createClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import {
  planSync,
  type ExistingSermonRow,
  type SyncMode,
} from './core.ts';
import { fetchApiVideos, fetchRssVideos } from './youtube.ts';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_YOUTUBE_SYNC');
  try {
    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { data: hq, error: hqError } = await supabase
      .from('branches')
      .select('youtube_channel_id')
      .eq('is_hq', true)
      .not('youtube_channel_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (hqError) throw new Error(`branches read failed: ${hqError.message}`);
    const channelId = hq?.youtube_channel_id as string | undefined;
    if (!channelId) {
      throw new Error('no HQ branch with a youtube_channel_id is configured');
    }

    const apiKey = optionalEnv('YOUTUBE_API_KEY');
    const mode: SyncMode = apiKey ? 'api' : 'rss';
    const fetched = apiKey
      ? await fetchApiVideos(channelId, apiKey)
      : await fetchRssVideos(channelId);

    const { data: existingRows, error: existingError } = await supabase
      .from('sermons')
      .select('youtube_id, status')
      .not('youtube_id', 'is', null);
    if (existingError) {
      throw new Error(`sermons read failed: ${existingError.message}`);
    }
    const existing = (existingRows ?? []) as ExistingSermonRow[];

    const plan = planSync(existing, fetched, mode);

    const { data: upserted, error: upsertError } = await supabase.rpc(
      'sync_upsert_sermons',
      { rows: plan.upserts },
    );
    if (upsertError) throw new Error(`upsert failed: ${upsertError.message}`);

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
      fetched: fetched.length,
      upserted: (upserted as number | null) ?? 0,
      markedUnavailable: plan.unavailableIds.length,
      restored: plan.restoredCount,
    };

    await pingDeadMan(healthcheckUrl, true);
    return Response.json(summary);
  } catch (error) {
    console.error('youtube-sync failed:', error);
    await captureEdgeError('youtube-sync', error);
    await pingDeadMan(healthcheckUrl, false);
    // Generic outward error; detail stays in the function logs (no PII here).
    return Response.json({ error: 'sync run failed' }, { status: 500 });
  }
});
