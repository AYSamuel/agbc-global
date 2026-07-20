import { assertEquals } from 'jsr:@std/assert@1';

import { fetchApiVideos } from './youtube.ts';

// Fake Data API: UULF holds a normal video + a scheduled premiere, UULV holds
// one recording, the UU peek reveals a running broadcast.
function fakeFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  const json = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  if (u.includes('playlistItems') && u.includes('UULFtest')) {
    return json({
      items: [
        { contentDetails: { videoId: 'vid-normal' } },
        { contentDetails: { videoId: 'vid-premiere' } },
      ],
    });
  }
  if (u.includes('playlistItems') && u.includes('UULVtest')) {
    return json({ items: [{ contentDetails: { videoId: 'live-vod' } }] });
  }
  if (u.includes('playlistItems') && u.includes('UUtest')) {
    return json({ items: [{ contentDetails: { videoId: 'running-now' } }] });
  }
  if (u.includes('/videos')) {
    return json({
      items: [
        {
          id: 'vid-normal',
          snippet: {
            title: 'Normal upload',
            publishedAt: '2026-07-18T10:00:00Z',
            liveBroadcastContent: 'none',
            thumbnails: { high: { url: 'https://img/high.jpg' } },
          },
          contentDetails: { duration: 'PT40M' },
        },
        {
          id: 'vid-premiere',
          snippet: {
            title: 'Scheduled premiere',
            publishedAt: '2026-07-21T05:00:00Z',
            liveBroadcastContent: 'upcoming',
          },
        },
        {
          id: 'live-vod',
          snippet: {
            title: 'Last Sunday stream',
            publishedAt: '2026-07-13T11:00:00Z',
            liveBroadcastContent: 'none',
          },
          contentDetails: { duration: 'PT2H' },
        },
        {
          id: 'running-now',
          snippet: {
            title: 'Sunday Service',
            publishedAt: '2026-07-19T11:00:00Z',
            liveBroadcastContent: 'live',
          },
          contentDetails: { duration: 'P0D' },
        },
      ],
    });
  }
  return Promise.resolve(new Response('not found', { status: 404 }));
}

function rssEntry(id: string, title: string): string {
  return `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><published>2026-07-19T05:00:00+00:00</published></entry>`;
}

function fakeRssFetch(url: RequestInfo | URL): Promise<Response> {
  const u = String(url);
  const feed = (entries: string) =>
    Promise.resolve(new Response(`<feed>${entries}</feed>`, { status: 200 }));
  if (u.includes('playlist_id=UULFtest')) {
    return feed(rssEntry('vid-1', 'Premiered upload'));
  }
  if (u.includes('playlist_id=UULVtest')) {
    return feed(rssEntry('stream-1', 'Sunday stream'));
  }
  // The mixed channel feed (with the premiere) must never be needed here.
  return Promise.resolve(new Response('unexpected', { status: 500 }));
}

Deno.test('RSS mode reads the tab playlist feeds: kinds known, premieres absent', async () => {
  const { fetchRssVideos } = await import('./youtube.ts');
  const videos = await fetchRssVideos('UCtest', fakeRssFetch as typeof fetch);
  assertEquals(videos.length, 2);
  const byId = new Map(videos.map((v) => [v.youtubeId, v]));
  assertEquals(byId.get('vid-1')?.kind, 'video');
  assertEquals(byId.get('stream-1')?.kind, 'live_replay');
});

Deno.test('API mode mirrors the website: tabs, premiere drop, running broadcast', async () => {
  const videos = await fetchApiVideos('UCtest', 'key', fakeFetch as typeof fetch);
  const byId = new Map(videos.map((v) => [v.youtubeId, v]));

  // The scheduled premiere is dropped entirely (nothing watchable yet).
  assertEquals(byId.has('vid-premiere'), false);
  assertEquals(videos.length, 3);

  assertEquals(byId.get('vid-normal')?.kind, 'video');
  assertEquals(byId.get('vid-normal')?.durationSec, 2400);
  assertEquals(byId.get('vid-normal')?.thumbnailUrl, 'https://img/high.jpg');

  assertEquals(byId.get('live-vod')?.kind, 'live_replay');
  assertEquals(byId.get('live-vod')?.isLive, false);

  // The running broadcast came from the UU peek: watchable, flagged live.
  assertEquals(byId.get('running-now')?.isLive, true);
  assertEquals(byId.get('running-now')?.durationSec, null);
});
