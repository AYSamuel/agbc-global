import { assertEquals } from 'jsr:@std/assert@1';

import {
  buildEntries,
  SERVICE_DEEP_LINK,
  SERVICE_TEMPLATE,
  type ServiceDueRow,
} from './core.ts';

function due(overrides: Partial<ServiceDueRow> = {}): ServiceDueRow {
  return {
    profile_id: 'profile-a',
    branch_id: 'branch-1',
    branch_name: 'AGBC Lighthouse Berlin',
    service_date: '2026-08-23',
    start_time: '11:00:00',
    dedupe_key: 'service_reminder:branch-1:2026-08-23T11:00',
    ...overrides,
  };
}

Deno.test('a due row becomes one entry carrying the branch and nothing else', () => {
  const [entry] = buildEntries([due()]);

  assertEquals(entry.profile_id, 'profile-a');
  assertEquals(entry.type, 'service_reminder');
  assertEquals(entry.template_key, SERVICE_TEMPLATE);
  assertEquals(entry.deep_link, SERVICE_DEEP_LINK);
  // The only param, and it is a name the church publishes itself (docs/spec/15).
  assertEquals(entry.params, { branch: 'AGBC Lighthouse Berlin' });
});

Deno.test('the dedupe key is carried through, never rebuilt', () => {
  // If this job re-derived the key from the date and time, the no-double-send guarantee
  // would have two authors that could drift apart. SQL decides the occurrence; this
  // passes it on unchanged.
  const rows = [
    due({ dedupe_key: 'service_reminder:branch-1:2026-08-23T11:00' }),
    due({
      profile_id: 'profile-b',
      start_time: '18:00:00',
      dedupe_key: 'service_reminder:branch-1:2026-08-23T18:00',
    }),
  ];

  assertEquals(
    buildEntries(rows).map((entry) => entry.dedupe_key),
    [
      'service_reminder:branch-1:2026-08-23T11:00',
      'service_reminder:branch-1:2026-08-23T18:00',
    ],
  );
});

Deno.test('every due member gets their own entry', () => {
  const rows = [
    due({ profile_id: 'a' }),
    due({ profile_id: 'b' }),
    due({ profile_id: 'c' }),
  ];
  assertEquals(buildEntries(rows).map((entry) => entry.profile_id), [
    'a',
    'b',
    'c',
  ]);
});

Deno.test('an empty window builds nothing', () => {
  assertEquals(buildEntries([]), []);
});
