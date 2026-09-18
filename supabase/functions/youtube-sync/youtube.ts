// YouTube source fetchers, mirroring the website's watch page (agbc
// src/lib/server/youtube-api.ts; decision 2026-07-20): the Videos tab is the
// UULF playlist (long-form only), the Live tab is UULV (stream recordings), a
// running broadcast is caught via a small all-uploads (UU) peek, and scheduled
// premieres (liveBroadcastContent 'upcoming') are dropped: they have no
// watchable content and their thumbnails are placeholders. playlistItems.list
// and videos.list cost 1 unit each; search.list is never called. The keyless
// RSS fallback serves dev/outage modes: mixed tabs, no premiere signal,
// degraded by design.
//
// THE WALK IS COMPLETE OR IT THROWS (W4.21, 2026-09-18). Until this the whole
// job asked each playlist for ONE page and never read `nextPageToken`, so the
// channel was the newest 50 of the Videos tab plus the newest 50 of the Live
// tab: about a hundred of an archive past two thousand, and nothing older had
// ever existed in `sermons` for search to find. Paging it is four lines. The
// reason this file is shaped the way it is, is what paging MEANS downstream:
// `planSync` reads "not in the listing" as "gone from the channel", so a walk
// that stopped early and returned what it had would mark the entire archive
// unavailable. Every page therefore either arrives or the whole call throws,
// and a caller can never be handed a short list that looks complete.
//
// The two legs are split for the same reason they are budgeted differently.
// `fetchChannelIds` is the CENSUS: cheap (1 unit per 50), strictly serial
// because each page needs the previous page's token, and it must be whole
// because rot detection judges against it. `fetchVideoDetails` is the READING:
// it costs the same per 50 but it is only ever needed for rows we are about to
// write, so the caller passes a bounded slice and successive runs converge.
// That is `broadcast-fanout`'s rule in a different domain: the run holds
// nothing it could lose, and the resume point is live state (the ids with no
// row yet) rather than a cursor somebody has to keep honest.

import { parseIsoDuration, parseRssFeed, type FetchedVideo } from './core.ts';

const FETCH_TIMEOUT_MS = 10_000;
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 50;

/**
 * A stop against an unbounded walk: 400 pages is 20,000 videos, which is also
 * where YouTube's own uploads-playlist ceiling sits. Reaching it means the
 * channel outgrew an assumption, so it throws rather than silently truncating,
 * because a truncated census is the one thing this file must never return.
 */
const MAX_PLAYLIST_PAGES = 400;

/**
 * Detail requests in flight at once. The census cannot be parallelised (tokens
 * are serial), so this is the only leg with a dial; five keeps the first
 * backfill's detail leg to a couple of seconds without leaning on the API.
 */
const DETAIL_CONCURRENCY = 5;

type FetchLike = typeof fetch;

/** The channel's full listing: complete, newest first, or the call threw. */
export interface ChannelListing {
  /**
   * Every id the channel's tabs hold, in order: Videos tab, then Live tab,
   * then anything the running-broadcast peek turned up. This is the census
   * rot detection is judged against, so it is complete by construction.
   */
  ids: string[];
  /** The subset sourced from the Live tab, which decides each row's `kind`. */
  liveIds: Set<string>;
  /** Pages walked, for the run summary: the cost of the census in one number. */
  pages: number;
}

interface PlaylistItemsPage {
  items?: { contentDetails?: { videoId?: string } }[];
  nextPageToken?: string;
}

interface ApiVideoItem {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    /** 'none' | 'live' | 'upcoming' */
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string } | undefined>;
  };
  contentDetails?: { duration?: string };
}

interface VideosPage {
  items?: ApiVideoItem[];
}

class YoutubeApiError extends Error {
  constructor(readonly status: number, resource: string) {
    // Status + resource only: the request URL carries the API key.
    super(`YouTube API ${resource} responded ${status}`);
    this.name = 'YoutubeApiError';
  }
}

// Keyless mode mirrors the website's RSS fallback (agbc src/lib/youtube.ts):
// the TAB PLAYLIST feeds, not the mixed channel feed. Scheduled premieres do
// not enter the UULF playlist until they premiere, so they are excluded
// structurally, and kinds are known per feed. The mixed channel feed is only
// the last-resort fallback (kind unknown => null, server keeps stored values).
export async function fetchRssVideos(
  channelId: string,
  fetchImpl: FetchLike = fetch,
): Promise<FetchedVideo[]> {
  const suffix = channelId.startsWith('UC') ? channelId.slice(2) : null;

  const videos: FetchedVideo[] = [];
  let videosTabWorked = false;

  if (suffix) {
    try {
      const tab = await rssFeed(
        `https://www.youtube.com/feeds/videos.xml?playlist_id=UULF${suffix}`,
        fetchImpl,
      );
      if (tab !== null && tab.length > 0) {
        videosTabWorked = true;
        videos.push(...tab.map((v) => ({ ...v, kind: 'video' as const })));
      }
    } catch (error) {
      console.error('videos-tab feed failed, falling back:', error);
    }

    try {
      const live = await rssFeed(
        `https://www.youtube.com/feeds/videos.xml?playlist_id=UULV${suffix}`,
        fetchImpl,
      );
      if (live !== null) {
        videos.push(
          ...live.map((v) => ({ ...v, kind: 'live_replay' as const })),
        );
      }
    } catch (error) {
      // The live section degrades alone; the videos rail is unaffected.
      console.error('live-tab feed failed (continuing):', error);
    }
  }

  if (!videosTabWorked) {
    const channel = await rssFeed(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      fetchImpl,
    );
    if (channel === null) {
      throw new Error('RSS channel feed request failed');
    }
    const known = new Set(videos.map((v) => v.youtubeId));
    videos.push(...channel.filter((v) => !known.has(v.youtubeId)));
  }

  return videos;
}

/** One RSS feed parsed; null on 404 (playlist absent = no such content yet). */
async function rssFeed(
  url: string,
  fetchImpl: FetchLike,
): Promise<FetchedVideo[] | null> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`RSS feed request failed: ${response.status}`);
  }
  return parseRssFeed(await response.text());
}

/**
 * The census: every id the channel holds, walked to the end of both tabs.
 *
 * Throws rather than returning what it managed to collect. See this file's
 * header: a short listing that looks complete is how the archive would be
 * marked unavailable in one run.
 */
export async function fetchChannelIds(
  channelId: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<ChannelListing> {
  const suffix = channelId.startsWith('UC') ? channelId.slice(2) : null;
  if (!suffix) throw new Error('channel id must start with UC');

  let pages = 0;
  const count = (walk: PlaylistWalk): string[] => {
    pages += walk.pages;
    return walk.ids;
  };

  // Videos tab (UULF), falling back to all uploads when the convention does
  // not resolve for the channel. Both are walked whole.
  const videosTab = await walkPlaylist(`UULF${suffix}`, apiKey, fetchImpl, true);
  let videoIds = videosTab === null ? null : count(videosTab);
  if (videoIds === null || videoIds.length === 0) {
    const uploads = await walkPlaylist(`UU${suffix}`, apiKey, fetchImpl, false);
    videoIds = uploads === null ? [] : count(uploads);
  }

  // Live tab (UULV): missing simply means the channel has never streamed.
  const liveTab = await walkPlaylist(`UULV${suffix}`, apiKey, fetchImpl, true);
  const liveIds = liveTab === null ? [] : count(liveTab);

  // A RUNNING broadcast appears in neither tab playlist reliably: peek the
  // newest all-uploads entries (website's live check). ONE page on purpose:
  // it is a peek at the front, not a second census, and walking all of UU
  // would double the cost of every run to learn nothing new.
  const peek = await walkPlaylist(`UU${suffix}`, apiKey, fetchImpl, true, {
    maxResults: 5,
    maxPages: 1,
  });
  const peekIds = peek === null ? [] : count(peek);

  // DEDUPED, and it has to be. A stream can sit in the Videos tab AND the Live
  // tab, and the same id twice in one upsert payload is not a harmless repeat:
  // Postgres refuses it outright ("ON CONFLICT DO UPDATE command cannot affect
  // row a second time"), which would fail the whole run. Nothing caught this
  // before because the job only ever read the newest 50 of each tab, where this
  // channel happens not to overlap; walking 2,000+ makes a collision likely.
  // First sighting wins the position, and Live-tab membership still decides
  // `kind` wherever the id landed.
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of [...videoIds, ...liveIds, ...peekIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return { ids, liveIds: new Set(liveIds), pages };
}

/**
 * The reading: title, date, thumbnail, duration and kind for the ids asked for.
 *
 * The caller decides WHICH ids, and therefore how much this run costs; see
 * `index.ts` for the rule (rows we are about to write, plus a refresh of the
 * front of the archive). Scheduled premieres are dropped here rather than in
 * the census, because being scheduled is a fact about the video and not about
 * whether the channel still lists it.
 */
export async function fetchVideoDetails(
  ids: readonly string[],
  liveIds: ReadonlySet<string>,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<FetchedVideo[]> {
  if (ids.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    batches.push(ids.slice(i, i + PAGE_SIZE));
  }

  const pages = await mapWithConcurrency(
    batches,
    DETAIL_CONCURRENCY,
    (batch) =>
      apiGet(
        'videos',
        { part: 'snippet,contentDetails', id: batch.join(',') },
        apiKey,
        fetchImpl,
      ) as Promise<VideosPage>,
  );

  const byId = new Map<string, ApiVideoItem>();
  for (const page of pages) {
    for (const item of page.items ?? []) {
      if (item.id) byId.set(item.id, item);
    }
  }

  const videos: FetchedVideo[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    const snippet = item?.snippet;
    if (!snippet?.title) continue;
    // Scheduled premieres/broadcasts: nothing watchable yet (website rule).
    if (snippet.liveBroadcastContent === 'upcoming') continue;
    videos.push({
      youtubeId: id,
      title: snippet.title,
      publishedAt: snippet.publishedAt ?? new Date(0).toISOString(),
      thumbnailUrl: bestThumbnail(snippet.thumbnails, id),
      durationSec: item?.contentDetails?.duration
        ? parseIsoDuration(item.contentDetails.duration)
        : null,
      // `live_replay` is the channel TAB this row came from, not a live state: those
      // are recorded messages and they feed Watch's "Recent live streams" rail. The app
      // carries no live state at all (ADR 0021), so `liveBroadcastContent` is read only
      // to DROP scheduled premieres above, never to mark anything as playing now.
      kind: liveIds.has(id) ? 'live_replay' : 'video',
    });
  }
  return videos;
}

interface PlaylistWalk {
  ids: string[];
  pages: number;
}

interface WalkLimits {
  maxResults?: number;
  maxPages?: number;
}

/**
 * Every id in one playlist, following `nextPageToken` to the end; null when
 * `tolerate404` and the playlist does not exist.
 *
 * Serial by necessity: a page's token is only knowable once the page before it
 * has answered. A page that fails throws and takes the whole walk with it.
 */
async function walkPlaylist(
  playlistId: string,
  apiKey: string,
  fetchImpl: FetchLike,
  tolerate404: boolean,
  limits: WalkLimits = {},
): Promise<PlaylistWalk | null> {
  const maxResults = limits.maxResults ?? PAGE_SIZE;
  const maxPages = limits.maxPages ?? MAX_PLAYLIST_PAGES;

  const ids: string[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    let page: PlaylistItemsPage;
    try {
      page = (await apiGet(
        'playlistItems',
        {
          part: 'contentDetails',
          playlistId,
          maxResults: String(maxResults),
          ...(pageToken === undefined ? {} : { pageToken }),
        },
        apiKey,
        fetchImpl,
      )) as PlaylistItemsPage;
    } catch (error) {
      // Only the FIRST page may be forgiven: a 404 there means the playlist
      // does not exist. A failure deeper in means an incomplete walk, and an
      // incomplete walk is never returned, whatever the status.
      if (
        pages === 0 &&
        tolerate404 &&
        error instanceof YoutubeApiError &&
        error.status === 404
      ) {
        return null;
      }
      throw error;
    }

    for (const item of page.items ?? []) {
      const id = item.contentDetails?.videoId ?? '';
      if (id.length > 0) ids.push(id);
    }
    pages += 1;
    pageToken = page.nextPageToken;

    if (pageToken !== undefined && pages >= maxPages) {
      if (limits.maxPages !== undefined) break; // A deliberate peek, not a truncation.
      throw new Error(
        `playlist ${playlistId} exceeds ${String(MAX_PLAYLIST_PAGES)} pages; ` +
          'refusing to return a truncated listing',
      );
    }
  } while (pageToken !== undefined);

  return { ids, pages };
}

/** Bounded parallelism, in order, so one slow batch cannot stall the rest. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (let i = next++; i < items.length; i = next++) {
        results[i] = await run(items[i] as T);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function bestThumbnail(
  thumbnails: Record<string, { url?: string } | undefined> | undefined,
  id: string,
): string {
  for (const size of ['maxres', 'high', 'medium', 'default']) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

async function apiGet(
  resource: string,
  params: Record<string, string>,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const url = new URL(`${API_BASE}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('key', apiKey);
  const response = await fetchImpl(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new YoutubeApiError(response.status, resource);
  return response.json();
}
