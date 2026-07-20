// YouTube source fetchers, mirroring the website's watch page (agbc
// src/lib/server/youtube-api.ts; decision 2026-07-20): the Videos tab is the
// UULF playlist (long-form only), the Live tab is UULV (stream recordings), a
// running broadcast is caught via a small all-uploads (UU) peek, and scheduled
// premieres (liveBroadcastContent 'upcoming') are dropped: they have no
// watchable content and their thumbnails are placeholders. playlistItems.list
// and videos.list cost 1 unit each; search.list is never called. The keyless
// RSS fallback serves dev/outage modes: mixed tabs, no premiere signal,
// degraded by design.

import { parseIsoDuration, parseRssFeed, type FetchedVideo } from './core.ts';

const FETCH_TIMEOUT_MS = 10_000;
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 50;

type FetchLike = typeof fetch;

interface PlaylistItemsPage {
  items?: { contentDetails?: { videoId?: string } }[];
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

export async function fetchApiVideos(
  channelId: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<FetchedVideo[]> {
  const suffix = channelId.startsWith('UC') ? channelId.slice(2) : null;
  if (!suffix) throw new Error('channel id must start with UC');

  // Videos tab (UULF), falling back to all uploads when the convention does
  // not resolve for the channel.
  let videoIds = await playlistIds(`UULF${suffix}`, apiKey, fetchImpl, true);
  if (videoIds === null || videoIds.length === 0) {
    videoIds = (await playlistIds(`UU${suffix}`, apiKey, fetchImpl, false)) ?? [];
  }

  // Live tab (UULV): missing simply means the channel has never streamed.
  const liveIds =
    (await playlistIds(`UULV${suffix}`, apiKey, fetchImpl, true)) ?? [];

  // A RUNNING broadcast appears in neither tab playlist reliably: peek the
  // newest all-uploads entries (website's live check).
  const peekIds =
    (await playlistIds(`UU${suffix}`, apiKey, fetchImpl, true, 5)) ?? [];

  const known = new Set([...videoIds, ...liveIds]);
  const extraIds = peekIds.filter((id) => !known.has(id));

  const ids = [...videoIds, ...liveIds, ...extraIds];
  if (ids.length === 0) return [];

  const byId = new Map<string, ApiVideoItem>();
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const batch = ids.slice(i, i + PAGE_SIZE);
    const page = (await apiGet(
      'videos',
      { part: 'snippet,contentDetails', id: batch.join(',') },
      apiKey,
      fetchImpl,
    )) as VideosPage;
    for (const item of page.items ?? []) {
      if (item.id) byId.set(item.id, item);
    }
  }

  const liveSet = new Set(liveIds);
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
      kind: liveSet.has(id) ? 'live_replay' : 'video',
      isLive: snippet.liveBroadcastContent === 'live',
    });
  }
  return videos;
}

/** Ordered ids from one playlist page; null when tolerate404 and it 404s. */
async function playlistIds(
  playlistId: string,
  apiKey: string,
  fetchImpl: FetchLike,
  tolerate404: boolean,
  maxResults = PAGE_SIZE,
): Promise<string[] | null> {
  let page: PlaylistItemsPage;
  try {
    page = (await apiGet(
      'playlistItems',
      {
        part: 'contentDetails',
        playlistId,
        maxResults: String(maxResults),
      },
      apiKey,
      fetchImpl,
    )) as PlaylistItemsPage;
  } catch (error) {
    if (tolerate404 && error instanceof YoutubeApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
  return (page.items ?? [])
    .map((item) => item.contentDetails?.videoId ?? '')
    .filter((id) => id.length > 0);
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
