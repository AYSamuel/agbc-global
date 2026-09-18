import { assertEquals } from 'jsr:@std/assert@1';

import { youtubeSyncSummarySchema } from '../../../packages/shared/src/contracts/watch-jobs.ts';
import {
  parseIsoDuration,
  parseRssFeed,
  planDetailFetch,
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
  };
}

/** The census, as a set: what the channel still lists. */
function listed(...ids: string[]): ReadonlySet<string> {
  return new Set(ids);
}

function existing(
  id: string,
  status: ExistingSermonRow['status'] = 'available',
): ExistingSermonRow {
  return { youtube_id: id, status };
}

Deno.test('planSync upserts every fetched video with its kind', () => {
  const live = { ...video('b'), kind: 'live_replay' as const };
  const plan = planSync([], listed('a', 'b'), [video('a'), live], 'api');
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
    listed('kept'),
    [video('kept')],
    'api',
  );
  assertEquals(plan.unavailableIds, ['vanished']);
});

Deno.test('RSS mode never marks rot: the 15-entry cap proves nothing (docs/spec/08)', () => {
  const plan = planSync(
    [existing('older-than-feed')],
    listed('recent'),
    [video('recent')],
    'rss',
  );
  assertEquals(plan.unavailableIds, []);
});

Deno.test('a reappeared video counts as restored (restore is symmetric)', () => {
  const plan = planSync(
    [existing('back', 'unavailable')],
    listed('back'),
    [video('back')],
    'api',
  );
  assertEquals(plan.restoredCount, 1);
  assertEquals(plan.unavailableIds, []);
});

Deno.test('already-unavailable rows are not re-marked', () => {
  const plan = planSync([existing('gone', 'unavailable')], listed(), [], 'api');
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
  // RSS cannot tell tabs or premieres apart: kind stays null and the server keeps
  // whatever it already stored.
  assertEquals(videos[0].kind, null);
});

Deno.test('run summaries satisfy the shared zod contract', () => {
  const plan = planSync(
    [existing('x', 'unavailable')],
    listed('x'),
    [video('x')],
    'rss',
  );
  const summary = youtubeSyncSummarySchema.parse({
    mode: 'rss',
    channelId: 'UCtest',
    listed: 1,
    playlistPages: 0,
    fetched: 1,
    pending: 0,
    upserted: plan.upserts.length,
    markedUnavailable: plan.unavailableIds.length,
    restored: plan.restoredCount,
  });
  assertEquals(summary.restored, 1);
});

// ---------------------------------------------------------------------------
// Rot is judged against the census, details are budgeted (W4.21).
// ---------------------------------------------------------------------------

Deno.test('rot is judged against the census, not against what this run read', () => {
  // The regression this item could most easily have introduced. Once details
  // are budgeted, `fetched` is a SLICE, so judging rot by it would mark every
  // row the run did not happen to re-read as gone from YouTube: on the first
  // backfill that is the entire existing library.
  const plan = planSync(
    [existing('old-1'), existing('old-2'), existing('really-gone')],
    listed('old-1', 'old-2', 'new-1'),
    [video('new-1')], // The budget only stretched to the new one.
    'api',
  );

  assertEquals(plan.unavailableIds, ['really-gone']);
  assertEquals(plan.upserts.length, 1);
});

Deno.test('a restore is counted only when this run actually writes the row', () => {
  // Listed again but not read this run: it stays unavailable until a write
  // flips it, so counting it here would report a restore that did not happen.
  const notYet = planSync(
    [existing('back', 'unavailable')],
    listed('back'),
    [],
    'api',
  );
  assertEquals(notYet.restoredCount, 0);
  assertEquals(notYet.unavailableIds, []);
});

Deno.test('planDetailFetch asks only for rows it is about to write, newest first', () => {
  const plan = planDetailFetch(
    ['new-1', 'have-1', 'have-2', 'new-2'],
    [existing('have-1'), existing('have-2')],
    { budget: 10, refreshNewest: 0 },
  );

  assertEquals(plan.ids, ['new-1', 'new-2']);
  assertEquals(plan.pending, 0);
});

Deno.test('planDetailFetch re-reads a row that came back, because only a write restores it', () => {
  const plan = planDetailFetch(
    ['returned', 'have'],
    [existing('returned', 'unavailable'), existing('have')],
    { budget: 10, refreshNewest: 0 },
  );

  assertEquals(plan.ids, ['returned']);
});

Deno.test('the budget bounds the run and reports what it still owes', () => {
  const census = Array.from({ length: 250 }, (_, i) => `v${String(i)}`);
  const plan = planDetailFetch(census, [], { budget: 100, refreshNewest: 0 });

  assertEquals(plan.ids.length, 100);
  assertEquals(plan.ids[0], 'v0');
  assertEquals(plan.pending, 150);
});

Deno.test('successive runs converge: what one leaves pending, the next takes up', () => {
  // The resume point is live state, never a stored cursor: the second run is
  // told nothing about the first, it simply re-reads which rows exist.
  const census = Array.from({ length: 250 }, (_, i) => `v${String(i)}`);

  const first = planDetailFetch(census, [], { budget: 100, refreshNewest: 0 });
  const afterFirst = first.ids.map((id) => existing(id));

  const second = planDetailFetch(census, afterFirst, {
    budget: 100,
    refreshNewest: 0,
  });
  assertEquals(second.ids[0], 'v100');
  assertEquals(second.pending, 50);

  const afterSecond = [...afterFirst, ...second.ids.map((id) => existing(id))];
  const third = planDetailFetch(census, afterSecond, {
    budget: 100,
    refreshNewest: 0,
  });
  assertEquals(third.ids.length, 50);
  assertEquals(third.pending, 0);
});

Deno.test('the newest are re-read every run, and the refresh survives a full backlog', () => {
  // A re-titled recent message still corrects itself within a tick. The
  // refresh is taken FIRST so a 2,000-video backfill cannot squeeze it out,
  // which is exactly what would happen if the budget were spent in census
  // order and the refresh appended afterwards.
  const census = Array.from({ length: 500 }, (_, i) => `v${String(i)}`);
  const held = census.slice(0, 3).map((id) => existing(id));

  const plan = planDetailFetch(census, held, { budget: 5, refreshNewest: 3 });

  assertEquals(plan.ids, ['v0', 'v1', 'v2', 'v3', 'v4']);
  assertEquals(plan.pending, 495);
});
