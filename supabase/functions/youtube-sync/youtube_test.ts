import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { fetchChannelIds, fetchVideoDetails } from './youtube.ts';

/** The two legs together, the way `index.ts` runs them, for the old assertions. */
async function fetchApiVideos(
  channelId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
) {
  const listing = await fetchChannelIds(channelId, apiKey, fetchImpl);
  return await fetchVideoDetails(
    listing.ids,
    listing.liveIds,
    apiKey,
    fetchImpl,
  );
}

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

  // `live_replay` is the TAB it was synced from, and it survives ADR 0021: those rows
  // are recorded messages feeding Watch's "Recent live streams" rail.
  assertEquals(byId.get('live-vod')?.kind, 'live_replay');

  // A broadcast that is running right now still syncs as an ordinary row. Nothing marks
  // it as playing, because the app carries no live state (ADR 0021); it simply becomes
  // watchable like everything else once it has ended.
  assertEquals(byId.get('running-now')?.durationSec, null);
});

// ---------------------------------------------------------------------------
// The walk (W4.21). These are the tests the archive depends on.
// ---------------------------------------------------------------------------

interface PagedChannel {
  /** Pages of ids per playlist prefix, in order. */
  pages: Record<string, string[][]>;
  /** Playlist prefix -> the page index that fails, and with what status. */
  failAt?: { playlist: string; page: number; status: number };
}

/**
 * A Data API that actually paginates: page N answers with `nextPageToken` set
 * to `p<N+1>` until the last one. `pageToken` absent means page 0.
 */
function pagedFetch(channel: PagedChannel): typeof fetch {
  return ((url: RequestInfo | URL) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/playlistItems')) {
      const playlist = u.searchParams.get('playlistId') ?? '';
      const token = u.searchParams.get('pageToken');
      const index = token === null ? 0 : Number(token.slice(1));
      const fail = channel.failAt;
      if (fail && playlist.startsWith(fail.playlist) && index === fail.page) {
        return Promise.resolve(
          new Response('nope', { status: fail.status }),
        );
      }
      const key = Object.keys(channel.pages).find((k) => playlist.startsWith(k));
      if (key === undefined) {
        return Promise.resolve(new Response('no such playlist', { status: 404 }));
      }
      const all = channel.pages[key] as string[][];
      const page = all[index] ?? [];
      const maxResults = Number(u.searchParams.get('maxResults') ?? '50');
      const body: Record<string, unknown> = {
        items: page
          .slice(0, maxResults)
          .map((id) => ({ contentDetails: { videoId: id } })),
      };
      if (index + 1 < all.length) body.nextPageToken = `p${String(index + 1)}`;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }
    if (u.pathname.endsWith('/videos')) {
      const ids = (u.searchParams.get('id') ?? '').split(',').filter(Boolean);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: ids.map((id) => ({
              id,
              snippet: {
                title: `Message ${id}`,
                publishedAt: '2026-01-01T10:00:00Z',
                liveBroadcastContent: 'none',
              },
              contentDetails: { duration: 'PT30M' },
            })),
          }),
          { status: 200 },
        ),
      );
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  }) as typeof fetch;
}

Deno.test('the census follows nextPageToken to the end of both tabs', async () => {
  const listing = await fetchChannelIds(
    'UCtest',
    'key',
    pagedFetch({
      pages: {
        UULF: [['a1', 'a2'], ['b1', 'b2'], ['c1']],
        UULV: [['L1', 'L2']],
        UU: [['a1']],
      },
    }),
  );

  // Every page, not just the first: this is the whole item in one assertion.
  assertEquals(listing.ids, ['a1', 'a2', 'b1', 'b2', 'c1', 'L1', 'L2']);
  // Three UULF pages + one UULV + one UU peek.
  assertEquals(listing.pages, 5);
  assertEquals(listing.liveIds.has('L1'), true);
  assertEquals(listing.liveIds.has('a1'), false);
});

Deno.test('a page that fails mid-walk throws instead of returning a short census', async () => {
  // THE test of this item. `planSync` reads "not in the census" as "gone from
  // YouTube", so a walk that swallowed this failure and returned page one would
  // mark every video behind it unavailable: the archive would vanish from the
  // app in a single run. Mutation check: make walkPlaylist return the ids it
  // has instead of rethrowing and this goes red.
  await assertRejects(
    () =>
      fetchChannelIds(
        'UCtest',
        'key',
        pagedFetch({
          pages: { UULF: [['a1'], ['b1'], ['c1']], UULV: [[]], UU: [[]] },
          failAt: { playlist: 'UULF', page: 1, status: 500 },
        }),
      ),
    Error,
  );
});

Deno.test('a 404 is forgiven on the first page only, never mid-walk', async () => {
  // A playlist that does not exist 404s on page one and means "this channel has
  // never streamed". The same status on page two means a walk that cannot be
  // completed, and completeness is not negotiable, whatever the status says.
  const absent = await fetchChannelIds(
    'UCtest',
    'key',
    pagedFetch({ pages: { UULF: [['a1']], UU: [[]] } }),
  );
  assertEquals(absent.liveIds.size, 0);

  await assertRejects(
    () =>
      fetchChannelIds(
        'UCtest',
        'key',
        pagedFetch({
          pages: { UULF: [['a1'], ['b1']], UULV: [[]], UU: [[]] },
          failAt: { playlist: 'UULF', page: 1, status: 404 },
        }),
      ),
    Error,
  );
});

Deno.test('a stream in both tabs is listed once, as a live replay', async () => {
  // Postgres refuses the same conflict target twice in one statement, so a
  // duplicate here fails the entire upsert. Invisible while the job read the
  // newest 50 of each tab; likely across a full archive.
  const listing = await fetchChannelIds(
    'UCtest',
    'key',
    pagedFetch({
      pages: { UULF: [['a1', 'both']], UULV: [['both', 'L1']], UU: [['a1']] },
    }),
  );

  assertEquals(listing.ids, ['a1', 'both', 'L1']);
  assertEquals(listing.ids.filter((id) => id === 'both').length, 1);

  const videos = await fetchVideoDetails(
    listing.ids,
    listing.liveIds,
    'key',
    pagedFetch({ pages: {} }),
  );
  assertEquals(videos.find((v) => v.youtubeId === 'both')?.kind, 'live_replay');
});

Deno.test('the running-broadcast peek reads one page and stops', async () => {
  // It is a look at the front, not a second census: walking all of UU would
  // double every run's cost to learn what the tabs already said.
  const listing = await fetchChannelIds(
    'UCtest',
    'key',
    pagedFetch({
      pages: {
        UULF: [['a1']],
        UULV: [[]],
        UU: [['peek1'], ['peek2'], ['peek3']],
      },
    }),
  );

  assertEquals(listing.ids.includes('peek1'), true);
  assertEquals(listing.ids.includes('peek2'), false);
});

Deno.test('details are read in batches of fifty, in order, across concurrent requests', async () => {
  const ids = Array.from({ length: 120 }, (_, i) => `v${String(i)}`);
  let requests = 0;
  const counting = ((url: RequestInfo | URL) => {
    if (String(url).includes('/videos')) requests += 1;
    return pagedFetch({ pages: {} })(url);
  }) as typeof fetch;

  const videos = await fetchVideoDetails(ids, new Set(), 'key', counting);

  assertEquals(requests, 3);
  assertEquals(videos.length, 120);
  // Concurrency must not reorder the archive: rails and search read by date,
  // but the upsert payload order is what the census asked for.
  assertEquals(videos[0]?.youtubeId, 'v0');
  assertEquals(videos[119]?.youtubeId, 'v119');
});
