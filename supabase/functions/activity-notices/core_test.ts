import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';

import { allowedByPrefs, routeFor } from '../_shared/pushChannels.ts';
import { renderTemplate } from '../_shared/pushTemplates.ts';
import { buildEntries, MY_POSTS_DEEP_LINK, TEMPLATES, type ActivityDueRow } from './core.ts';

function due(overrides: Partial<ActivityDueRow> = {}): ActivityDueRow {
  return {
    kind: 'prayed',
    recipient_id: '99000000-0000-4000-8000-00000000000a',
    subject_id: '99000000-0000-4000-8000-0000000000b1',
    subject_kind: null,
    detail: null,
    tally: null,
    dedupe_key: 'prayed:99000000-0000-4000-8000-0000000000c1',
    ...overrides,
  };
}

Deno.test('a fulfilled commitment becomes one prayer notification, carrying nothing', () => {
  const [entry] = buildEntries([due()]);

  assertEquals(entry.type, 'prayer');
  assertEquals(entry.template_key, TEMPLATES.prayed);
  assertEquals(entry.deep_link, '/prayer/99000000-0000-4000-8000-0000000000b1');
  // The whole payload rule for this tier, asserted rather than trusted: not the request,
  // not a word of it, not who prayed (docs/spec/15, `20`).
  assertEquals(entry.params, {});
});

Deno.test('a Glory bucket carries its count and nothing else', () => {
  const [entry] = buildEntries([
    due({
      kind: 'glory',
      tally: 7,
      subject_id: '99000000-0000-4000-8000-0000000000b2',
      dedupe_key: 'glory:99000000-0000-4000-8000-0000000000b2:2026-08-29T11',
    }),
  ]);

  assertEquals(entry.type, 'testimony_glory');
  assertEquals(entry.template_key, TEMPLATES.glory);
  assertEquals(entry.deep_link, '/testimony/99000000-0000-4000-8000-0000000000b2');
  assertEquals(entry.params, { count: 7 });
});

Deno.test('each moderation outcome gets its OWN words, and a removal never says "change"', () => {
  const outcomes: Array<[string, string]> = [
    ['approved', TEMPLATES.approved],
    ['rejected', TEMPLATES.rejected],
    ['removed', TEMPLATES.removed],
  ];

  for (const [status, template] of outcomes) {
    const [entry] = buildEntries([
      due({ kind: 'moderation', subject_kind: 'testimony', detail: status }),
    ]);
    assertEquals(entry.type, 'moderation');
    assertEquals(entry.template_key, template);
    // All three land on MY-POSTS: the one screen that can render a live post, a rejected
    // one with its reason, and a removed one with the line pointing at a leader.
    assertEquals(entry.deep_link, MY_POSTS_DEEP_LINK);
    assertEquals(entry.params, {});
  }

  // The point of `moderation.removed` existing at all. `MyPostCard.tsx`: "rejected is a
  // conversation the author can answer (edit and resubmit), removed is not", so a removal
  // must never be handed the words that invite an edit.
  //
  // Widened to `string` deliberately: `TEMPLATES` is `as const`, so comparing the two
  // literal types directly is a TS2367 compile error rather than a runtime assertion. The
  // type system already proves they differ TODAY; this keeps the claim readable and still
  // fails if a later edit points both names at one key.
  assertNotEquals<string>(TEMPLATES.removed, TEMPLATES.rejected);
  const removed = renderTemplate(TEMPLATES.removed, {}, 'en');
  assertEquals(removed.title.toLowerCase().includes('change'), false);
});

Deno.test('every template this job can send exists in all four languages', () => {
  for (const key of Object.values(TEMPLATES)) {
    for (const language of ['en', 'de', 'nl', 'fr'] as const) {
      const rendered = renderTemplate(key, { count: 3 }, language);
      // The fallback returns a usable generic line rather than throwing, so an absent key
      // is invisible unless the rendered text is compared to it.
      const generic = renderTemplate('no.such.key', {}, language);
      assertEquals(
        rendered.title === generic.title && rendered.body === generic.body,
        false,
        `${key} is missing in ${language}`,
      );
    }
  }
});

Deno.test('the tiers route to the channels and pref gates 15 names', () => {
  // The two activity kinds are suppressible, on the columns the tier table names, and the
  // moderation notice is not. This is the claim W3.6 exists to make good: before slice 2
  // `prayer_activity` and `testimony_activity` gated no producer at all.
  assertEquals(routeFor('prayer').pref, 'prayer_activity');
  assertEquals(routeFor('testimony_glory').pref, 'testimony_activity');
  assertEquals(routeFor('moderation').pref, null);

  assertEquals(allowedByPrefs('prayer', { prayer_activity: false }), false);
  assertEquals(allowedByPrefs('testimony_glory', { testimony_activity: false }), false);
  // Transactional: it answers something the member did, so nothing switches it off.
  assertEquals(allowedByPrefs('moderation', { testimony_activity: false }), true);
});

Deno.test('a kind or status this build does not know is dropped, not guessed at', () => {
  const entries = buildEntries([
    due({ kind: 'moderation', detail: 'pending' }),
    due({ kind: 'something_new' }),
    due(),
  ]);

  // Only the known row survives. Sending the generic fallback line about somebody's own
  // testimony would be worse than silence, which is why this drops where `routeFor`
  // delivers.
  assertEquals(entries.length, 1);
  assertEquals(entries[0].template_key, TEMPLATES.prayed);
});

Deno.test('dedupe keys pass through untouched: the SQL owns the claim', () => {
  const rows = [
    due({ dedupe_key: 'prayed:abc' }),
    due({ kind: 'glory', tally: 1, dedupe_key: 'glory:def:2026-08-29T11' }),
    due({
      kind: 'moderation',
      detail: 'approved',
      dedupe_key: 'moderation:testimony:ghi:2026-08-29T11:00:00.000000',
    }),
  ];

  assertEquals(
    buildEntries(rows).map((e) => e.dedupe_key),
    rows.map((r) => r.dedupe_key),
  );
});
