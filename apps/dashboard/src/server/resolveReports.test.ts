import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  createCaller,
  createTestBranch,
  deleteCaller,
  deleteTestBranch,
  type TestCaller,
} from '@/test/callers';

import { loadReportsInbox } from './reportsInbox';
import { markReportsActioned, resolveReports } from './resolveReports';

/**
 * The write paths, against real sessions.
 *
 * The claim worth proving is not "the button calls the function". It is that a leader's
 * authority stops at their branch and that a flagged report cannot be closed from this
 * screen by anybody, including the leader who flagged it. Both are enforced by the
 * database and by this module together, so both are checked through a real client.
 */

const minted: TestCaller[] = [];
const seeded: { testimonies: string[]; prayers: string[] } = {
  testimonies: [],
  prayers: [],
};

async function caller(
  ...args: Parameters<typeof createCaller>
): Promise<TestCaller> {
  const created = await createCaller(...args);
  minted.push(created);
  return created;
}

let leaderA: TestCaller;
let leaderB: TestCaller;
let memberA: TestCaller;
let memberB: TestCaller;
let branchA: string;
let branchB: string;
let reported: string;
let flagged: string;
let elsewhere: string;

/** Puts the reports back the way `beforeAll` left them, so tests stay independent. */
async function reopen(): Promise<void> {
  await admin()
    .from('reports')
    .update({ status: 'open', resolution_note: null })
    .in('testimony_id', [reported, elsewhere]);
  await admin()
    .from('reports')
    .update({ status: 'open', is_safeguarding: true, resolution_note: null })
    .eq('prayer_id', flagged);
  await admin()
    .from('reports')
    .update({ is_safeguarding: false })
    .in('testimony_id', [reported, elsewhere]);
}

beforeAll(async () => {
  branchA = await createTestBranch('resolve-a');
  branchB = await createTestBranch('resolve-b');

  [leaderA, leaderB, memberA, memberB] = await Promise.all([
    caller({ role: 'leader', branchId: branchA, mfa: 'verified' }),
    caller({ role: 'leader', branchId: branchB, mfa: 'verified' }),
    caller({ role: 'member', branchId: branchA }),
    caller({ role: 'member', branchId: branchA }),
  ]);

  const service = admin();

  const testimonies = await service
    .from('testimonies')
    .insert([
      {
        author_id: memberA.userId,
        branch_id: branchA,
        body: 'W2.7 probe: a reported testimony to resolve',
        language: 'en',
        status: 'approved',
        consent_version: 'content-share-v1',
      },
      {
        author_id: leaderB.userId,
        branch_id: branchB,
        body: 'W2.7 probe: a reported testimony in the other branch',
        language: 'en',
        status: 'approved',
        consent_version: 'content-share-v1',
      },
    ])
    .select('id');
  if (testimonies.error) throw new Error(testimonies.error.message);
  seeded.testimonies = testimonies.data.map((row) => row.id);
  [reported, elsewhere] = seeded.testimonies;

  const prayers = await service
    .from('prayers')
    .insert({
      author_id: memberA.userId,
      branch_id: branchA,
      body: 'W2.7 probe: a prayer with a safeguarding flag on it',
      language: 'en',
      status: 'approved',
      consent_version: 'content-share-v1',
    })
    .select('id');
  if (prayers.error) throw new Error(prayers.error.message);
  seeded.prayers = prayers.data.map((row) => row.id);
  flagged = seeded.prayers[0];

  const reports = await service.from('reports').insert([
    {
      reporter_id: memberA.userId,
      testimony_id: reported,
      reason: 'hurtful',
      is_safeguarding: false,
    },
    {
      reporter_id: memberB.userId,
      testimony_id: reported,
      reason: 'not_for_this_space',
      is_safeguarding: false,
    },
    {
      reporter_id: memberA.userId,
      prayer_id: flagged,
      reason: 'at_risk',
      is_safeguarding: true,
    },
    {
      reporter_id: memberA.userId,
      testimony_id: elsewhere,
      reason: 'hurtful',
      is_safeguarding: false,
    },
  ]);
  if (reports.error) throw new Error(reports.error.message);
});

afterEach(reopen);

afterAll(async () => {
  const service = admin();
  // The reports go with their content: `on delete cascade` on both target columns.
  if (seeded.testimonies.length) {
    await service.from('testimonies').delete().in('id', seeded.testimonies);
  }
  if (seeded.prayers.length) {
    await service.from('prayers').delete().in('id', seeded.prayers);
  }
  await Promise.all(minted.map(deleteCaller));
  await Promise.all([deleteTestBranch(branchA), deleteTestBranch(branchB)]);
});

describe('dismissing', () => {
  test('a leader closes every open report on one post at once', async () => {
    const result = await resolveReports(leaderA.serverClient(), {
      kind: 'testimony',
      id: reported,
      action: 'dismiss',
    });

    expect(result).toEqual({ ok: true, changed: 2 });

    const inbox = await loadReportsInbox(leaderA.serverClient());
    expect(inbox.items.some((item) => item.id === reported)).toBe(false);
  });

  test('the post itself is untouched', async () => {
    await resolveReports(leaderA.serverClient(), {
      kind: 'testimony',
      id: reported,
      action: 'dismiss',
    });

    const { data } = await admin()
      .from('testimonies')
      .select('status, deleted_at')
      .eq('id', reported)
      .single();
    expect(data?.status).toBe('approved');
    expect(data?.deleted_at).toBeNull();
  });

  test("another branch's reports are not this leader's to dismiss", async () => {
    const result = await resolveReports(leaderA.serverClient(), {
      kind: 'testimony',
      id: elsewhere,
      action: 'dismiss',
    });

    // Refused before any write: the branch is read from the row, and authorize() says no.
    expect(result).toEqual({ ok: false, reason: 'refused' });

    const { data } = await admin()
      .from('reports')
      .select('status')
      .eq('testimony_id', elsewhere);
    expect(data?.every((row) => row.status === 'open')).toBe(true);
  });
});

describe('the safeguarding rule', () => {
  test('a flagged report cannot be dismissed, by the branch leader either', async () => {
    const result = await resolveReports(leaderA.serverClient(), {
      kind: 'prayer',
      id: flagged,
      action: 'dismiss',
    });

    expect(result).toEqual({ ok: false, reason: 'safeguarding_stays_open' });

    const { data } = await admin()
      .from('reports')
      .select('status')
      .eq('prayer_id', flagged)
      .single();
    expect(data?.status).toBe('open');
  });

  test('a flagged report survives a decision on the content', async () => {
    // Removal does not end a safeguarding duty (`02`), which is exactly the case a
    // careless "close everything about this post" would break.
    const result = await markReportsActioned(
      leaderA.serverClient(),
      'prayer',
      flagged,
    );

    expect(result).toEqual({ ok: false, reason: 'safeguarding_stays_open' });

    const { data } = await admin()
      .from('reports')
      .select('status, is_safeguarding')
      .eq('prayer_id', flagged)
      .single();
    expect(data).toEqual({ status: 'open', is_safeguarding: true });
  });

  test('a leader can raise the flag on their own branch', async () => {
    const result = await resolveReports(leaderA.serverClient(), {
      kind: 'testimony',
      id: reported,
      action: 'flag_safeguarding',
    });

    expect(result).toEqual({ ok: true, changed: 2 });

    const inbox = await loadReportsInbox(leaderA.serverClient());
    expect(
      inbox.items.find((item) => item.id === reported)?.isSafeguarding,
    ).toBe(true);
  });

  test('flagging is refused across a branch boundary', async () => {
    const result = await resolveReports(leaderB.serverClient(), {
      kind: 'testimony',
      id: reported,
      action: 'flag_safeguarding',
    });

    expect(result).toEqual({ ok: false, reason: 'refused' });
  });

  test('a flag raised is a flag kept: dismissing after flagging changes nothing', async () => {
    await resolveReports(leaderA.serverClient(), {
      kind: 'testimony',
      id: reported,
      action: 'flag_safeguarding',
    });
    const result = await resolveReports(leaderA.serverClient(), {
      kind: 'testimony',
      id: reported,
      action: 'dismiss',
    });

    expect(result).toEqual({ ok: false, reason: 'safeguarding_stays_open' });
  });
});

describe('closing with a decision', () => {
  test('the reports close when the post is decided', async () => {
    const result = await markReportsActioned(
      leaderA.serverClient(),
      'testimony',
      reported,
    );

    expect(result).toEqual({ ok: true, changed: 2 });

    const { data } = await admin()
      .from('reports')
      .select('status, resolution_note')
      .eq('testimony_id', reported);
    expect(data?.every((row) => row.status === 'actioned')).toBe(true);
    // The note is the system's account of why this stopped being open (`02`).
    expect(data?.every((row) => (row.resolution_note ?? '').length > 0)).toBe(
      true,
    );
  });

  test('a member cannot close anything', async () => {
    const result = await resolveReports(memberA.serverClient(), {
      kind: 'testimony',
      id: reported,
      action: 'dismiss',
    });

    expect(result).toEqual({ ok: false, reason: 'refused' });
  });
});
