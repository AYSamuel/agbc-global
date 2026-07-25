import { assertEquals } from 'jsr:@std/assert@1';

import { probeLive } from './live.ts';

// probeLive orchestrates the fetch; parseLivePage (the scrape parser) is covered in
// windows_test.ts. Here we drive both branches (API key vs keyless scrape) and every
// failure mode with an injected fetch, so no network is touched. The load-bearing
// rule (docs/spec/08): a non-ok response or a thrown fetch is INCONCLUSIVE and must
// never clear a possibly-genuine live flag.

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.test('API mode: a live result yields the video id and title, conclusive', async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      jsonResponse({
        items: [
          { id: { videoId: 'LIVEvid123' }, snippet: { title: 'Sunday Service' } },
        ],
      }),
    )) as typeof fetch;
  assertEquals(await probeLive('UCchannel', 'api-key', fetchImpl), {
    liveVideoId: 'LIVEvid123',
    liveTitle: 'Sunday Service',
    conclusive: true,
  });
});

Deno.test('API mode: no items means conclusively not live now', async () => {
  const fetchImpl = (() =>
    Promise.resolve(jsonResponse({ items: [] }))) as typeof fetch;
  assertEquals(await probeLive('UCchannel', 'api-key', fetchImpl), {
    liveVideoId: null,
    liveTitle: null,
    conclusive: true,
  });
});

Deno.test('API mode: a non-ok response is inconclusive (never clears a live flag)', async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response('quota exceeded', { status: 403 }))) as typeof fetch;
  assertEquals(await probeLive('UCchannel', 'api-key', fetchImpl), {
    liveVideoId: null,
    liveTitle: null,
    conclusive: false,
  });
});

Deno.test('keyless mode: scrapes the /live page and delegates to the parser', async () => {
  const html = '"isLive":true "videoId":"SCRAPEvid99"';
  const fetchImpl = (() =>
    Promise.resolve(new Response(html, { status: 200 }))) as typeof fetch;
  assertEquals(await probeLive('UCchannel', null, fetchImpl), {
    liveVideoId: 'SCRAPEvid99',
    liveTitle: null,
    conclusive: true,
  });
});

Deno.test('keyless mode: a non-ok scrape response is inconclusive', async () => {
  const fetchImpl = (() =>
    Promise.resolve(new Response('nope', { status: 500 }))) as typeof fetch;
  assertEquals(await probeLive('UCchannel', null, fetchImpl), {
    liveVideoId: null,
    liveTitle: null,
    conclusive: false,
  });
});

Deno.test('keyless mode: a thrown fetch (timeout) is inconclusive, never clears a live flag', async () => {
  const fetchImpl = (() =>
    Promise.reject(new Error('AbortError'))) as typeof fetch;
  assertEquals(await probeLive('UCchannel', null, fetchImpl), {
    liveVideoId: null,
    liveTitle: null,
    conclusive: false,
  });
});
