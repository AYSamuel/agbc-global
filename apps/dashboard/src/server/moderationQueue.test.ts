import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  createCaller,
  createTestBranch,
  deleteCaller,
  deleteTestBranch,
  type TestCaller,
} from '@/test/callers';

import { authorize, type Caller } from './authorize';
import { loadModerationQueue, OVERDUE_AFTER_MS } from './moderationQueue';

/**
 * The probes `21` §4 asks for, against the read path itself.
 *
 * Not against the screen: a UI that forgets to filter still looks correct, and a test
 * that drives the UI would agree with it. These call the loader a page calls, with a real
 * leader's session, and check what the DATABASE hands back.
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

/** authorize()'s verdict, unwrapped, so a probe reads as the route reads. */
async function callerContext(target: TestCaller): Promise<Caller> {
  const verdict = await authorize(target.serverClient(), {
    action: 'access_dashboard',
  });
  if (!verdict.ok)
    throw new Error(`expected an authorized caller, got ${verdict.reason}`);
  return verdict.caller;
}

let leaderA: TestCaller;
let leaderB: TestCaller;
let ministryAdmin: TestCaller;

/**
 * Two branches this file owns outright. Counting a moderator's queue against a SEEDED
 * branch counts the dev seed and anything a developer left behind while clicking around,
 * and the assertion then fails for reasons unrelated to the code. Owning the branches
 * makes every count below exact.
 *
 * The admin is the exception: an admin sees every branch by definition, including other
 * people's, so admin assertions stay scoped to this file's own rows.
 */
let branchA: string;
let branchB: string;

beforeAll(async () => {
  branchA = await createTestBranch('queue-a');
  branchB = await createTestBranch('queue-b');

  leaderA = await caller({
    role: 'leader',
    branchId: branchA,
    mfa: 'verified',
  });
  leaderB = await caller({
    role: 'leader',
    branchId: branchB,
    mfa: 'verified',
  });
  ministryAdmin = await caller({
    role: 'admin',
    branchId: branchA,
    mfa: 'verified',
  });

  // Content authored by the leaders themselves, purely so the rows exist; the queue does
  // not care who wrote them, only which branch they belong to.
  const service = admin();

  const testimony = await service
    .from('testimonies')
    .insert([
      {
        author_id: leaderA.userId,
        branch_id: branchA,
        body: 'W2.7 probe: branch A pending testimony',
        language: 'de',
        status: 'pending',
        consent_version: 'content-share-v1',
      },
      {
        author_id: leaderB.userId,
        branch_id: branchB,
        body: 'W2.7 probe: branch B pending testimony',
        language: 'en',
        status: 'pending',
        consent_version: 'content-share-v1',
      },
    ])
    .select('id');
  if (testimony.error) throw new Error(testimony.error.message);
  seeded.testimonies = testimony.data.map((row) => row.id);

  const prayer = await service
    .from('prayers')
    .insert([
      {
        author_id: leaderA.userId,
        branch_id: branchA,
        body: 'W2.7 probe: branch A anonymous prayer',
        language: 'en',
        is_anonymous: true,
        status: 'pending',
        consent_version: 'content-share-v1',
      },
    ])
    .select('id');
  if (prayer.error) throw new Error(prayer.error.message);
  seeded.prayers = prayer.data.map((row) => row.id);
});

afterAll(async () => {
  const service = admin();
  if (seeded.testimonies.length) {
    await service.from('testimonies').delete().in('id', seeded.testimonies);
  }
  if (seeded.prayers.length) {
    await service.from('prayers').delete().in('id', seeded.prayers);
  }
  await Promise.all(minted.map(deleteCaller));
  await Promise.all([deleteTestBranch(branchA), deleteTestBranch(branchB)]);
});

/** Only the rows this file created, so a populated dev database cannot skew a count. */
function probeItems(items: { id: string }[]): { id: string }[] {
  const mine = new Set([...seeded.testimonies, ...seeded.prayers]);
  return items.filter((item) => mine.has(item.id));
}

describe('branch scope', () => {
  test('a leader sees their own branch', async () => {
    const client = leaderA.serverClient();
    const queue = await loadModerationQueue(
      client,
      await callerContext(leaderA),
    );

    // Exact, not filtered: this leader's branch belongs to this file, so two is two.
    expect(queue.items).toHaveLength(2);
    expect(queue.items.every((item) => item.branchId === branchA)).toBe(true);
  });

  test('IDOR: a leader asking for another branch by id gets nothing', async () => {
    // The probe that matters. The branch filter is a query parameter on a real screen,
    // so a leader can absolutely send the other branch's id. Authority never comes from the
    // request: RLS refuses the rows whatever arrives here.
    const client = leaderA.serverClient();

    const queue = await loadModerationQueue(
      client,
      await callerContext(leaderA),
      {
        branchId: branchB,
      },
    );

    expect(queue.items).toHaveLength(0);
    expect(queue.counts.all).toBe(0);
  });

  test('IDOR: a leader never sees the other branch even unfiltered', async () => {
    const client = leaderA.serverClient();

    const queue = await loadModerationQueue(
      client,
      await callerContext(leaderA),
    );

    expect(queue.items.some((item) => item.branchId === branchB)).toBe(false);
  });

  test('an admin sees both branches, and can narrow to one', async () => {
    const everywhere = await loadModerationQueue(
      ministryAdmin.serverClient(),
      await callerContext(ministryAdmin),
    );
    const branches = new Set(
      probeItems(everywhere.items).map((item) => item.id),
    );
    expect(branches.size).toBe(3);

    const glasgowOnly = await loadModerationQueue(
      ministryAdmin.serverClient(),
      await callerContext(ministryAdmin),
      { branchId: branchB },
    );
    expect(glasgowOnly.items.every((item) => item.branchId === branchB)).toBe(
      true,
    );
  });
});

describe('what the reviewer is shown', () => {
  test('an anonymous prayer carries no author name', async () => {
    const queue = await loadModerationQueue(
      leaderA.serverClient(),
      await callerContext(leaderA),
    );

    const prayer = queue.items.find((item) => item.id === seeded.prayers[0]);
    expect(prayer).toBeDefined();
    expect(prayer?.isAnonymous).toBe(true);
    expect(prayer?.authorName).toBeNull();
  });

  test('the branch name is resolved, not just its id', async () => {
    const queue = await loadModerationQueue(
      leaderA.serverClient(),
      await callerContext(leaderA),
    );

    expect(queue.items[0]?.branchName).toMatch(/^Test Branch test-queue-a/);
  });

  test('language travels with the item', async () => {
    const queue = await loadModerationQueue(
      leaderA.serverClient(),
      await callerContext(leaderA),
    );

    const testimony = queue.items.find(
      (item) => item.id === seeded.testimonies[0],
    );
    expect(testimony?.language).toBe('de');
  });

  test('the kind filter narrows without widening scope', async () => {
    const queue = await loadModerationQueue(
      leaderA.serverClient(),
      await callerContext(leaderA),
      { kind: 'prayer' },
    );

    expect(queue.items.every((item) => item.kind === 'prayer')).toBe(true);
    expect(queue.items.every((item) => item.branchId === branchA)).toBe(true);
  });
});

describe('the queue is ordered like a queue', () => {
  test('oldest first, so the item nearest escalation is at the top', async () => {
    const queue = await loadModerationQueue(
      leaderA.serverClient(),
      await callerContext(leaderA),
    );

    const times = queue.items.map((item) => new Date(item.createdAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test('counts overdue against the 48h escalation threshold', async () => {
    const client = leaderA.serverClient();
    const context = await callerContext(leaderA);

    const fresh = await loadModerationQueue(client, context, {}, Date.now());
    expect(fresh.overdue).toBe(0);

    // Same rows, read from three days in the future: everything is now overdue.
    const later = await loadModerationQueue(
      client,
      context,
      {},
      Date.now() + OVERDUE_AFTER_MS + 24 * 60 * 60 * 1000,
    );
    expect(later.overdue).toBe(later.items.length);
    expect(later.items.length).toBeGreaterThan(0);
  });
});
