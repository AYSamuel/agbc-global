import { assertEquals } from 'jsr:@std/assert@1';

import { buildEntries, RSVP_TEMPLATE, type RsvpDueRow } from './core.ts';

function due(overrides: Partial<RsvpDueRow> = {}): RsvpDueRow {
  return {
    profile_id: 'profile-a',
    event_id: '83000000-0000-4000-8000-000000000001',
    event_title: 'Night of Worship',
    starts_at_local: '2026-08-28T19:00:00',
    dedupe_key: 'rsvp_reminder:83000000-0000-4000-8000-000000000001:2026-08-28T19:00',
    ...overrides,
  };
}

Deno.test('a due RSVP becomes a transactional entry deep-linking to the event', () => {
  const [entry] = buildEntries([due()]);

  assertEquals(entry.profile_id, 'profile-a');
  // Transactional: it answers an RSVP the member made, so no pref can suppress it.
  assertEquals(entry.type, 'rsvp_reminder');
  assertEquals(entry.template_key, RSVP_TEMPLATE);
  assertEquals(entry.params, { event: 'Night of Worship' });
  assertEquals(entry.deep_link, '/event/83000000-0000-4000-8000-000000000001');
});

Deno.test('the deep link stays on the app allowlist shape', () => {
  // deepLinks.ts accepts `/event/<segment>` and rejects anything carrying a query, a
  // scheme or a traversal. A title with punctuation must never leak into the path.
  const [entry] = buildEntries([
    due({ event_title: 'Youth Conference: bring a friend?' }),
  ]);
  assertEquals(entry.deep_link, '/event/83000000-0000-4000-8000-000000000001');
  assertEquals(entry.params, { event: 'Youth Conference: bring a friend?' });
});

Deno.test('a rescheduled event carries a different key', () => {
  const before = buildEntries([due()])[0];
  const after = buildEntries([
    due({
      starts_at_local: '2026-08-28T20:30:00',
      dedupe_key:
        'rsvp_reminder:83000000-0000-4000-8000-000000000001:2026-08-28T20:30',
    }),
  ])[0];

  assertEquals(before.dedupe_key === after.dedupe_key, false);
});

Deno.test('an empty window builds nothing', () => {
  assertEquals(buildEntries([]), []);
});
