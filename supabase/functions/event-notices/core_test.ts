import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';

import { routeFor } from '../_shared/pushChannels.ts';
import { renderTemplate } from '../_shared/pushTemplates.ts';
import {
  buildEntries,
  NOTICE_TEMPLATES,
  templateFor,
  typeFor,
  type DueEventRow,
} from './core.ts';

function due(overrides: Partial<DueEventRow> = {}): DueEventRow {
  return {
    event_id: '83000000-0000-4000-8000-000000000001',
    kind: 'moved',
    dedupe_key:
      'event_moved:83000000-0000-4000-8000-000000000001:2026-09-05T19:00:r2',
    status: 'scheduled',
    branch_id: '00000000-0000-4000-8000-000000000002',
    title: 'Night of Worship',
    starts_at_local: '2026-09-05T19:00:00',
    location: 'Prinzenstr. 84, 10969 Berlin',
    timezone: 'Europe/Berlin',
    ...overrides,
  };
}

Deno.test('one entry per member, all carrying the key SQL minted', () => {
  const entries = buildEntries(due(), ['profile-a', 'profile-b']);

  assertEquals(entries.length, 2);
  assertEquals(entries[0].profile_id, 'profile-a');
  assertEquals(entries[1].profile_id, 'profile-b');
  for (const entry of entries) {
    // Minted once, in SQL, and carried through untouched: the anti-join that pages this
    // job and the index that dedupes it are looking at the same string.
    assertEquals(entry.dedupe_key, due().dedupe_key);
  }
});

Deno.test('a change is transactional; a posting is not', () => {
  // The distinction the new type exists for: a member who turned branch news off must
  // still hear that the event they RSVP'd to is cancelled (docs/spec/15 tiers).
  for (const kind of ['cancelled', 'moved', 'reinstated'] as const) {
    const type = typeFor(due({ kind }));
    assertEquals(type, 'event_change');
    assertEquals(routeFor(type).pref, null);
  }

  const branchPosting = typeFor(due({ kind: 'posted' }));
  assertEquals(branchPosting, 'event');
  assertEquals(routeFor(branchPosting).pref, 'branch_updates');
});

Deno.test('a ministry-wide posting arrives on the ministry tier', () => {
  // branch_id IS NULL is the single source of truth for ministry-wide (docs/spec/02), so
  // it decides the tier too: the whole family, gated on ministry_announcements.
  const type = typeFor(due({ kind: 'posted', branch_id: null }));
  assertEquals(type, 'ministry');
  assertEquals(routeFor(type).pref, 'ministry_announcements');
  assertEquals(
    templateFor(due({ kind: 'posted', branch_id: null })),
    NOTICE_TEMPLATES.postedMinistry,
  );
});

Deno.test('a ministry-wide CHANGE stays transactional, like every other change', () => {
  // The scope decides the tier only for a posting. Cancelling the global gathering still
  // reaches the people who said they were coming, whatever they switched off.
  assertEquals(typeFor(due({ kind: 'cancelled', branch_id: null })), 'event_change');
});

Deno.test('the deep link is the event route, and nothing from the title reaches it', () => {
  const [entry] = buildEntries(
    due({ title: 'Youth Conference: bring a friend?' }),
    ['profile-a'],
  );
  assertEquals(entry.deep_link, '/event/83000000-0000-4000-8000-000000000001');
  // The app's allowlist accepts `/event/<segment>` and refuses a query or a traversal
  // (features/notifications/deepLinks.ts); a punctuated title must never get near it.
  assertEquals(entry.deep_link.includes('?'), false);
});

Deno.test('params carry the raw wall clock, never a formatted date', () => {
  const [entry] = buildEntries(due(), ['profile-a']);
  assertEquals(entry.params, {
    event: 'Night of Worship',
    when: '2026-09-05T19:00:00',
  });

  // Which is what lets the same row read correctly to two members in two languages.
  const en = renderTemplate(entry.template_key, entry.params, 'en');
  const nl = renderTemplate(entry.template_key, entry.params, 'nl');
  assertEquals(en.title, 'Night of Worship has moved');
  assertEquals(nl.title, 'Night of Worship is verplaatst');
  assertNotEquals(en.body, nl.body);
});

Deno.test('every kind renders in every language', () => {
  // A key added to the batch and not to the catalogue would send the generic line, which
  // is not wrong enough to notice and not right enough to be useful.
  for (const kind of ['posted', 'cancelled', 'moved', 'reinstated'] as const) {
    for (const branch of ['00000000-0000-4000-8000-000000000002', null]) {
      const row = due({ kind, branch_id: branch });
      const [entry] = buildEntries(row, ['profile-a']);
      for (const language of ['en', 'de', 'nl', 'fr']) {
        const rendered = renderTemplate(entry.template_key, entry.params, language);
        assertNotEquals(rendered.title, 'AGBC Global', `${kind}/${language}`);
        assertEquals(rendered.title.includes('{'), false);
        assertEquals(rendered.body.includes('{'), false);
      }
    }
  }
});

Deno.test('no member and nothing private travels in a notice', () => {
  // docs/spec/15's payload rule: the title and the start are the church's own published
  // facts, and there is deliberately nothing else in the entry.
  const [entry] = buildEntries(due(), ['profile-a']);
  assertEquals(Object.keys(entry.params).sort(), ['event', 'when']);
});
