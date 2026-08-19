import { assertEquals } from 'jsr:@std/assert@1';

import { renderTemplate } from '../_shared/pushTemplates.ts';
import {
  advancingIds,
  buildEntries,
  PRAYER_TEMPLATE,
  type PrayerDueRow,
} from './core.ts';

function due(overrides: Partial<PrayerDueRow> = {}): PrayerDueRow {
  return {
    intercession_id: 'i-1',
    profile_id: 'profile-a',
    prayer_id: '60000000-0000-4000-8000-000000000002',
    dedupe_key: 'prayer_reminder:i-1:1',
    ...overrides,
  };
}

Deno.test('a due commitment becomes a nudge pointing at the request', () => {
  const [entry] = buildEntries([due()]);

  assertEquals(entry.profile_id, 'profile-a');
  assertEquals(entry.type, 'prayer');
  assertEquals(entry.template_key, PRAYER_TEMPLATE);
  assertEquals(entry.deep_link, '/prayer/60000000-0000-4000-8000-000000000002');
});

Deno.test('the payload carries nothing about the request', () => {
  // The whole point (docs/spec/15 payload rule, `20`): a prayer request is
  // special-category data and none of it travels. No params, and the rendered words
  // name nobody and describe nothing.
  const [entry] = buildEntries([due()]);
  assertEquals(entry.params, {});

  const rendered = renderTemplate(entry.template_key, entry.params, 'en');
  assertEquals(rendered.title, 'You said you’d pray for a request');
  assertEquals(rendered.body, 'Take a moment now');
});

Deno.test('the nudge is the recipient’s language, like every other template', () => {
  const [entry] = buildEntries([due()]);
  assertEquals(
    renderTemplate(entry.template_key, entry.params, 'nl').title,
    'Je wilde voor een verzoek bidden',
  );
});

Deno.test('each nudge in the cadence is its own occurrence', () => {
  const first = buildEntries([due({ dedupe_key: 'prayer_reminder:i-1:1' })])[0];
  const second = buildEntries([due({ dedupe_key: 'prayer_reminder:i-1:2' })])[0];
  assertEquals(first.dedupe_key === second.dedupe_key, false);
});

Deno.test('every batched commitment is advanced, not only the ones that sent', () => {
  // A run that dies between writing and advancing must not stick on one rung: the next
  // run recomputes the same key, the seam refuses it, and this still moves the cadence on.
  const rows = [due({ intercession_id: 'i-1' }), due({ intercession_id: 'i-2' })];
  assertEquals(advancingIds(rows), ['i-1', 'i-2']);
});

Deno.test('an empty batch builds and advances nothing', () => {
  assertEquals(buildEntries([]), []);
  assertEquals(advancingIds([]), []);
});
