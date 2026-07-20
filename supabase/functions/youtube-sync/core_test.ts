import { assertEquals } from 'jsr:@std/assert@1';

import { youtubeSyncSummarySchema } from '../../../packages/shared/src/contracts/watch-jobs.ts';
import {
  parseIsoDuration,
  parseRssFeed,
  planSync,
  type ExistingSermonRow,
  type FetchedVideo,
} from './core.ts';

function video(id: string, title = `Video ${id}`): FetchedVideo {
  return {
    youtubeId: id,
    title,
    publishedAt: '2026-07-19T10:00:00Z',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSec: 1800,
    kind: 'video',
    isLive: false,
  };
}

function existing(
  id: string,
  status: ExistingSermonRow['status'] = 'available',
): ExistingSermonRow {
  return { youtube_id: id, status, is_live: false, live_checked_at: null };
}

Deno.test('planSync upserts every fetched video with its kind', () => {
  const live = { ...video('b'), kind: 'live_replay' as const };
  const plan = planSync([], [video('a'), live], 'api');
  assertEquals(plan.upserts.length, 2);
  assertEquals(plan.upserts[0].youtube_id, 'a');
  assertEquals(plan.upserts[0].kind, 'video');
  assertEquals(plan.upserts[1].kind, 'live_replay');
  assertEquals(plan.unavailableIds, []);
  assertEquals(plan.restoredCount, 0);
});

Deno.test('API mode marks vanished videos unavailable, never deletes', () => {
  const plan = planSync(
    [existing('kept'), existing('vanished')],
    [video('kept')],
    'api',
  );
  assertEquals(plan.unavailableIds, ['vanished']);
});

Deno.test('RSS mode never marks rot: the 15-entry cap proves nothing (docs/spec/08)', () => {
  const plan = planSync(
    [existing('older-than-feed')],
    [video('recent')],
    'rss',
  );
  assertEquals(plan.unavailableIds, []);
});

Deno.test('a reappeared video counts as restored (restore is symmetric)', () => {
  const plan = planSync(
    [existing('back', 'unavailable')],
    [video('back')],
    'api',
  );
  assertEquals(plan.restoredCount, 1);
  assertEquals(plan.unavailableIds, []);
});

Deno.test('already-unavailable rows are not re-marked', () => {
  const plan = planSync([existing('gone', 'unavailable')], [], 'api');
  assertEquals(plan.unavailableIds, []);
});

Deno.test('parseIsoDuration handles YouTube shapes', () => {
  assertEquals(parseIsoDuration('PT42M10S'), 2530);
  assertEquals(parseIsoDuration('PT1H2M3S'), 3723);
  assertEquals(parseIsoDuration('PT58S'), 58);
  assertEquals(parseIsoDuration('P1DT2H'), 93_600);
  assertEquals(parseIsoDuration('garbage'), null);
  assertEquals(parseIsoDuration(''), null);
});

Deno.test('parseRssFeed extracts entries and decodes entities', () => {
  const xml = `<?xml version="1.0"?>
  <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
    <title>Channel</title>
    <entry>
      <yt:videoId>abc123</yt:videoId>
      <title>Grace &amp; Truth &#39;26</title>
      <published>2026-07-19T05:00:00+00:00</published>
    </entry>
    <entry>
      <yt:videoId>def456</yt:videoId>
      <title>Second</title>
      <published>2026-07-12T05:00:00+00:00</published>
    </entry>
    <entry>
      <title>malformed: no video id</title>
    </entry>
  </feed>`;
  const videos = parseRssFeed(xml);
  assertEquals(videos.length, 2);
  assertEquals(videos[0].youtubeId, 'abc123');
  assertEquals(videos[0].title, "Grace & Truth '26");
  assertEquals(videos[0].thumbnailUrl, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  assertEquals(videos[0].durationSec, null);
  // RSS cannot tell tabs or premieres apart: kind stays null (server keeps
  // the stored value) and nothing is marked live.
  assertEquals(videos[0].kind, null);
  assertEquals(videos[0].isLive, false);
});

Deno.test('run summaries satisfy the shared zod contract', () => {
  const plan = planSync([existing('x', 'unavailable')], [video('x')], 'rss');
  const summary = youtubeSyncSummarySchema.parse({
    mode: 'rss',
    channelId: 'UCtest',
    fetched: 1,
    upserted: plan.upserts.length,
    markedUnavailable: plan.unavailableIds.length,
    restored: plan.restoredCount,
    staleLiveCleared: 0,
  });
  assertEquals(summary.restored, 1);
});
