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
  /** A currently running broadcast (API mode only; RSS cannot tell). */
  isLive: boolean;
}

export interface ExistingSermonRow {
  youtube_id: string;
  status: SermonStatus;
  is_live: boolean;
  live_checked_at: string | null;
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

export const STALE_LIVE_MINUTES = 15;

export function planSync(
  existing: ExistingSermonRow[],
  fetched: FetchedVideo[],
  mode: SyncMode,
): SyncPlan {
  const fetchedIds = new Set(fetched.map((v) => v.youtubeId));

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
          .filter((r) => r.status === 'available' && !fetchedIds.has(r.youtube_id))
          .map((r) => r.youtube_id)
      : [];

  const restoredCount = existing.filter(
    (r) => r.status === 'unavailable' && fetchedIds.has(r.youtube_id),
  ).length;

  return { upserts, unavailableIds, restoredCount };
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
      isLive: false,
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
