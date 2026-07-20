// YouTube source fetchers (docs/spec/08 sync spec): the Data API path uses the
// uploads playlist via playlistItems.list (1 quota unit/page) + videos.list for
// durations (1 unit/50 ids); search.list is never called. The keyless RSS
// fallback serves dev and outage modes and caps at 15 entries.

import {
  parseIsoDuration,
  parseRssFeed,
  type FetchedVideo,
} from './core.ts';

const FETCH_TIMEOUT_MS = 10_000;
// Bounds the job (docs/spec/21 §5 quota discipline): 10 pages = 500 videos.
const MAX_PLAYLIST_PAGES = 10;
const API_BASE = 'https://www.googleapis.com/youtube/v3';

type FetchLike = typeof fetch;

async function boundedJson(
  url: string,
  fetchImpl: FetchLike,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`YouTube request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchRssVideos(
  channelId: string,
  fetchImpl: FetchLike = fetch,
): Promise<FetchedVideo[]> {
  const response = await fetchImpl(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
  );
  if (!response.ok) {
    throw new Error(`RSS feed request failed: ${response.status}`);
  }
  return parseRssFeed(await response.text());
}

interface PlaylistItemsPage {
  nextPageToken?: string;
  items?: {
    snippet?: {
      title?: string;
      publishedAt?: string;
      resourceId?: { videoId?: string };
      thumbnails?: Record<string, { url?: string }>;
    };
  }[];
}

interface VideosPage {
  items?: { id?: string; contentDetails?: { duration?: string } }[];
}

export async function fetchApiVideos(
  channelId: string,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<FetchedVideo[]> {
  // The uploads playlist id is the channel id with its UC prefix swapped for UU:
  // free to derive, saves the channels.list call.
  const uploadsPlaylistId = `UU${channelId.slice(2)}`;
  const videos: FetchedVideo[] = [];
  let pageToken = '';

  for (let page = 0; page < MAX_PLAYLIST_PAGES; page += 1) {
    const url =
      `${API_BASE}/playlistItems?part=snippet&maxResults=50` +
      `&playlistId=${uploadsPlaylistId}&key=${apiKey}` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const data = (await boundedJson(url, fetchImpl)) as PlaylistItemsPage;

    for (const item of data.items ?? []) {
      const snippet = item.snippet;
      const videoId = snippet?.resourceId?.videoId;
      if (!snippet || !videoId) continue;
      const thumbs = snippet.thumbnails ?? {};
      videos.push({
        youtubeId: videoId,
        // Shown unmodified per the Data API branding rules (docs/spec/08).
        title: snippet.title ?? '',
        publishedAt: snippet.publishedAt ?? new Date(0).toISOString(),
        thumbnailUrl:
          thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? '',
        durationSec: null,
      });
    }

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  // Durations ride videos.list in batches of 50 (1 unit per call).
  for (let i = 0; i < videos.length; i += 50) {
    const batch = videos.slice(i, i + 50);
    const url =
      `${API_BASE}/videos?part=contentDetails` +
      `&id=${batch.map((v) => v.youtubeId).join(',')}&key=${apiKey}`;
    const data = (await boundedJson(url, fetchImpl)) as VideosPage;
    const durations = new Map(
      (data.items ?? []).map((item) => [
        item.id ?? '',
        item.contentDetails?.duration ?? '',
      ]),
    );
    for (const video of batch) {
      const iso = durations.get(video.youtubeId);
      video.durationSec = iso ? parseIsoDuration(iso) : null;
    }
  }

  return videos;
}
