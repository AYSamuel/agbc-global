import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  createCaller,
  createTestBranch,
  deleteCaller,
  deleteTestBranch,
  type TestCaller,
} from '@/test/callers';

import { loadReportsInbox } from './reportsInbox';

/**
 * The reports inbox, probed against the database rather than the screen.
 *
 * Same reasoning as `moderationQueue.test.ts`: a page that forgot to scope still looks
 * right, and a test driving the page would agree with it. These call the loader a page
 * calls, holding a real leader's session, and check what comes back.
 *
 * The grouping is the interesting part and it is the part a unit test cannot fake: three
 * reports on one testimony have to arrive as ONE card with a tally, and they only do if
 * the read, the CHECK constraint and this module agree.
 */

const minted: TestCaller[] = [];
const seeded: { testimonies: string[]; prayers: string[]; reports: string[] } =
  { testimonies: [], prayers: [], reports: [] };

async function caller(
  ...args: Parameters<typeof createCaller>
): Promise<TestCaller> {
  const created = await createCaller(...args);
  minted.push(created);
  return created;
}

let leaderA: TestCaller;
let leaderB: TestCaller;
let ministryAdmin: TestCaller;
let memberA: TestCaller;
let memberB: TestCaller;

/** Two branches this file owns outright, so every count below is exact. */
let branchA: string;
let branchB: string;

/** The reported rows, by what each one is for. */
let busyTestimony: string;
let quietPrayer: string;
let otherBranchTestimony: string;

beforeAll(async () => {
  branchA = await createTestBranch('reports-a');
  branchB = await createTestBranch('reports-b');

  [leaderA, leaderB, ministryAdmin, memberA, memberB] = await Promise.all([
    caller({ role: 'leader', branchId: branchA, mfa: 'verified' }),
    caller({ role: 'leader', branchId: branchB, mfa: 'verified' }),
    caller({ role: 'admin', branchId: branchA, mfa: 'verified' }),
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
        body: 'W2.7 probe: the reported testimony in branch A',
        language: 'de',
        status: 'approved',
        consent_version: 'content-share-v1',
      },
      {
        author_id: leaderB.userId,
        branch_id: branchB,
        body: 'W2.7 probe: the reported testimony in branch B',
        language: 'en',
        status: 'approved',
        consent_version: 'content-share-v1',
      },
    ])
    .select('id');
  if (testimonies.error) throw new Error(testimonies.error.message);
  seeded.testimonies = testimonies.data.map((row) => row.id);
  [busyTestimony, otherBranchTestimony] = seeded.testimonies;

  const prayers = await service
    .from('prayers')
    .insert({
      author_id: memberA.userId,
      branch_id: branchA,
      body: 'W2.7 probe: the reported anonymous prayer in branch A',
      language: 'en',
      is_anonymous: true,
      status: 'approved',
      consent_version: 'content-share-v1',
    })
    .select('id');
  if (prayers.error) throw new Error(prayers.error.message);
  seeded.prayers = prayers.data.map((row) => row.id);
  quietPrayer = seeded.prayers[0];

  // THREE reports on one testimony, two of them the same reason, and one report on a
  // prayer in the same branch. The partial unique is per (reporter, item), so this needs
  // two reporters.
  const reports = await service
    .from('reports')
    .insert([
      {
        reporter_id: memberA.userId,
        testimony_id: busyTestimony,
        reason: 'private_details',
        is_safeguarding: false,
      },
      {
        reporter_id: memberB.userId,
        testimony_id: busyTestimony,
        reason: 'private_details',
        is_safeguarding: false,
      },
      {
        reporter_id: leaderA.userId,
        testimony_id: busyTestimony,
        reason: 'not_for_this_space',
        is_safeguarding: false,
      },
      {
        reporter_id: memberB.userId,
        prayer_id: quietPrayer,
        reason: 'at_risk',
        is_safeguarding: true,
      },
      {
        reporter_id: memberA.userId,
        testimony_id: otherBranchTestimony,
        reason: 'hurtful',
        is_safeguarding: false,
      },
    ])
    .select('id');
  if (reports.error) throw new Error(reports.error.message);
  seeded.reports = reports.data.map((row) => row.id);
});

afterAll(async () => {
  const service = admin();
  if (seeded.reports.length) {
    await service.from('reports').delete().in('id', seeded.reports);
  }
  if (seeded.testimonies.length) {
    await service.from('testimonies').delete().in('id', seeded.testimonies);
  }
  if (seeded.prayers.length) {
    await service.from('prayers').delete().in('id', seeded.prayers);
  }
  await Promise.all(minted.map(deleteCaller));
  await Promise.all([deleteTestBranch(branchA), deleteTestBranch(branchB)]);
});

describe('branch scope', () => {
  test('a leader sees the reports about their own branch', async () => {
    const inbox = await loadReportsInbox(leaderA.serverClient());

    // Two CARDS from four reports: the three on the testimony are one card.
    expect(inbox.items).toHaveLength(2);
    expect(inbox.items.every((item) => item.branchId === branchA)).toBe(true);
  });

  test('a leader never sees another branch, reports included', async () => {
    const inbox = await loadReportsInbox(leaderA.serverClient());

    expect(inbox.items.some((item) => item.id === otherBranchTestimony)).toBe(
      false,
    );
  });

  test('an admin sees both branches', async () => {
    const inbox = await loadReportsInbox(ministryAdmin.serverClient());
    const mine = inbox.items.filter((item) =>
      [busyTestimony, quietPrayer, otherBranchTestimony].includes(item.id),
    );

    expect(mine).toHaveLength(3);
    expect(new Set(mine.map((item) => item.branchId))).toEqual(
      new Set([branchA, branchB]),
    );
  });

  test('a member sees their own report and nobody else’s', async () => {
    // `reporters read their own reports` is a real policy, so a member holding this
    // client does get rows back, and the loader does not pretend otherwise. What it must
    // never do is show them the OTHER reports on the same post: two members reported this
    // testimony, and each of them is entitled to know about exactly one of those.
    //
    // The page is unreachable for a member (`authorize` refuses), so this is the loader
    // proving it would not leak even if something else ever called it.
    const inbox = await loadReportsInbox(memberA.serverClient());
    const card = inbox.items.find((item) => item.id === busyTestimony);

    expect(card?.reportCount).toBe(1);
    expect(card?.reasons).toEqual([{ reason: 'private_details', count: 1 }]);
    // memberB's flagged prayer report is not theirs to see at all.
    expect(inbox.items.some((item) => item.id === quietPrayer)).toBe(false);
  });
});

describe('grouping', () => {
  test('three reports on one post are one card with a tally', async () => {
    const inbox = await loadReportsInbox(leaderA.serverClient());
    const card = inbox.items.find((item) => item.id === busyTestimony);

    expect(card?.reportCount).toBe(3);
    expect(card?.reasons).toEqual([
      { reason: 'private_details', count: 2 },
      { reason: 'not_for_this_space', count: 1 },
    ]);
  });

  test('the reasons keep their fixed order, danger first', async () => {
    const inbox = await loadReportsInbox(ministryAdmin.serverClient());
    const prayer = inbox.items.find((item) => item.id === quietPrayer);

    // Sorted by `09`'s order rather than by frequency, so a leader scanning two cards
    // finds "someone may be at risk" in the same place on both.
    expect(prayer?.reasons[0].reason).toBe('at_risk');
  });

  test('the card carries the FIRST report, not the newest', async () => {
    const service = admin();
    const late = await service
      .from('reports')
      .insert({
        reporter_id: ministryAdmin.userId,
        testimony_id: busyTestimony,
        reason: 'hurtful',
      })
      .select('id');
    if (late.error) throw new Error(late.error.message);
    seeded.reports.push(late.data[0].id);

    const inbox = await loadReportsInbox(leaderA.serverClient());
    const card = inbox.items.find((item) => item.id === busyTestimony);
    const first = inbox.items.map((item) => item.firstReportedAt);

    expect(card?.reportCount).toBe(4);
    // Oldest first, which is what makes "first reported 2 days ago" the age of the wait.
    expect([...first].sort()).toEqual(first);

    await service.from('reports').delete().eq('id', late.data[0].id);
    seeded.reports = seeded.reports.filter((id) => id !== late.data[0].id);
  });
});

describe('what a card says', () => {
  test('an anonymous prayer stays anonymous to the moderator', async () => {
    const inbox = await loadReportsInbox(leaderA.serverClient());
    const prayer = inbox.items.find((item) => item.id === quietPrayer);

    // The promise the app makes reaches the dashboard. A moderator's RLS could read the
    // author, so this is a decision and not a limitation.
    expect(prayer?.isAnonymous).toBe(true);
    expect(prayer?.authorName).toBeNull();
  });

  test('a named testimony names its author and branch', async () => {
    const inbox = await loadReportsInbox(leaderA.serverClient());
    const card = inbox.items.find((item) => item.id === busyTestimony);

    expect(card?.authorName).toMatch(/^Caller /);
    expect(card?.branchName).not.toBe('');
  });

  test('a flagged report marks its card', async () => {
    const inbox = await loadReportsInbox(leaderA.serverClient());

    expect(
      inbox.items.find((item) => item.id === quietPrayer)?.isSafeguarding,
    ).toBe(true);
    expect(
      inbox.items.find((item) => item.id === busyTestimony)?.isSafeguarding,
    ).toBe(false);
    expect(inbox.counts.safeguarding).toBe(1);
  });

  test('a resolved report leaves the inbox', async () => {
    const service = admin();
    await service
      .from('reports')
      .update({ status: 'dismissed' })
      .eq('testimony_id', busyTestimony);

    const inbox = await loadReportsInbox(leaderA.serverClient());
    expect(inbox.items.some((item) => item.id === busyTestimony)).toBe(false);

    await service
      .from('reports')
      .update({ status: 'open' })
      .eq('testimony_id', busyTestimony);
  });

  test('a deleted post takes its card with it', async () => {
    const service = admin();
    await service
      .from('prayers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', quietPrayer);

    const inbox = await loadReportsInbox(leaderA.serverClient());
    // The report row survives, because `20` keeps it for 24 months. The card does not:
    // there is nothing left to read and nothing left to decide.
    expect(inbox.items.some((item) => item.id === quietPrayer)).toBe(false);

    await service
      .from('prayers')
      .update({ deleted_at: null })
      .eq('id', quietPrayer);
  });
});
