// Pure sync planning (docs/spec/08, 21 §5): given the source listing and the
// existing rows, decide what to upsert, what rotted, and what restores. No I/O
// here; deno tests cover every branch.

export type SyncMode = 'api' | 'rss';
export type SermonStatus = 'available' | 'unavailable';
export type SermonKind = 'video' | 'live_replay';

export interface FetchedVideo {
  youtubeId: string;
  title: string;
  /** ISO 8601 instant from the source, passed through untouched. */
  publishedAt: string;
  thumbnailUrl: string;
  durationSec: number | null;
  /** Which channel tab (API mode); null in RSS mode (kept server-side). */
  kind: SermonKind | null;
}

export interface ExistingSermonRow {
  youtube_id: string;
  status: SermonStatus;
}

export interface UpsertRow {
  youtube_id: string;
  title: string;
  published_at: string;
  thumbnail_url: string;
  duration_sec: number | null;
  kind: SermonKind | null;
}

export interface SyncPlan {
  upserts: UpsertRow[];
  /** API mode only: ids that vanished from the uploads playlist. */
  unavailableIds: string[];
  /** Rows the upsert will flip back to available (restore is symmetric, 08). */
  restoredCount: number;
}

/**
 * @param listedIds every id the channel still lists (the census). SEPARATE from
 *   `fetched` since W4.21, and the separation is the whole point: `fetched` is
 *   the bounded slice this run pulled details for, while rot is a question
 *   about what the CHANNEL holds. Judging rot against `fetched` was safe only
 *   while the two were the same list; the moment details are budgeted, it would
 *   mark every row this run did not happen to read as gone from YouTube.
 */
export function planSync(
  existing: ExistingSermonRow[],
  listedIds: ReadonlySet<string>,
  fetched: FetchedVideo[],
  mode: SyncMode,
): SyncPlan {
  const upserts = fetched.map((v) => ({
    youtube_id: v.youtubeId,
    title: v.title,
    published_at: v.publishedAt,
    thumbnail_url: v.thumbnailUrl,
    duration_sec: v.durationSec,
    kind: v.kind,
  }));

  // RSS caps at 15 entries (docs/spec/08): absence from the feed proves
  // nothing, so rot detection runs ONLY against the full uploads playlist.
  const unavailableIds =
    mode === 'api'
      ? existing
          .filter(
            (r) => r.status === 'available' && !listedIds.has(r.youtube_id),
          )
          .map((r) => r.youtube_id)
      : [];

  // Counted against what this run will actually WRITE, not against the census:
  // a row only returns to 'available' through the upsert, which needs details.
  const restoredIds = new Set(upserts.map((r) => r.youtube_id));
  const restoredCount = existing.filter(
    (r) => r.status === 'unavailable' && restoredIds.has(r.youtube_id),
  ).length;

  return { upserts, unavailableIds, restoredCount };
}

export interface DetailPlan {
  /** Ids to call videos.list for this run, newest-first, budget applied. */
  ids: string[];
  /** Ids that need a write and did not fit; 0 means the archive has caught up. */
  pending: number;
}

/**
 * Which ids this run pays to read (W4.21).
 *
 * The census is cheap and complete; details are the cost, so they are budgeted
 * and the run converges over several ticks instead of doing everything at once.
 * The resume point is live state, exactly as `broadcast-fanout` resumes from
 * its pending rows: "ids the channel lists that we hold no usable row for" is
 * recomputed from scratch every run, so nothing has to remember where the last
 * one stopped and a crash costs only the details it had not written yet.
 *
 * Two kinds of id qualify:
 *   - no row at all: the whole archive, on the first runs after this ships;
 *   - a row marked `unavailable`: only a write returns it to `available`, so a
 *     video that came back needs its details read again.
 *
 * Plus a refresh of the head of the census, which is the Videos tab's newest.
 * Before this change every run re-read all ~100 ids it knew, so a re-titled or
 * re-thumbnailed message corrected itself within six hours. At 2,000+ videos
 * that is no longer affordable for the whole archive, so it is kept for the
 * front, where edits actually happen. A message re-titled deep in the archive
 * now keeps its old title until something else writes the row: a deliberate
 * trade, recorded here rather than discovered later.
 */
export function planDetailFetch(
  listedIds: readonly string[],
  existing: readonly ExistingSermonRow[],
  options: { budget: number; refreshNewest: number },
): DetailPlan {
  const usable = new Set(
    existing.filter((r) => r.status === 'available').map((r) => r.youtube_id),
  );

  // The refresh rides first because it is fixed-size and must never be the
  // part a large backfill squeezes out.
  const refresh = listedIds.slice(0, Math.max(0, options.refreshNewest));
  const refreshed = new Set(refresh);

  const needWrite = listedIds.filter(
    (id) => !usable.has(id) && !refreshed.has(id),
  );
  const room = Math.max(0, options.budget - refresh.length);
  const taken = needWrite.slice(0, room);

  return {
    ids: [...refresh, ...taken],
    pending: needWrite.length - taken.length,
  };
}

// ISO 8601 duration (YouTube contentDetails.duration, e.g. PT1H2M3S) → seconds.
// Unparseable OR non-positive input yields null: running broadcasts report P0D,
// and duration is display-only (never fail the sync; website rule).
export function parseIsoDuration(iso: string): number | null {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match || match.slice(1).every((part) => part === undefined)) return null;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return total > 0 ? total : null;
}

// Minimal Atom parsing for the keyless RSS fallback (docs/spec/01 §5). The feed
// shape is stable; the parser tolerates unknown elements and skips malformed
// entries rather than failing the run.
export function parseRssFeed(xml: string): FetchedVideo[] {
  const videos: FetchedVideo[] = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  for (const entry of entries) {
    const youtubeId = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1];
    const rawTitle = /<title>([^<]*)<\/title>/.exec(entry)?.[1];
    const publishedAt = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
    if (!youtubeId || rawTitle === undefined || !publishedAt) continue;
    videos.push({
      youtubeId,
      title: decodeXmlEntities(rawTitle),
      publishedAt,
      thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      durationSec: null,
      kind: null,
    });
  }
  return videos;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}
