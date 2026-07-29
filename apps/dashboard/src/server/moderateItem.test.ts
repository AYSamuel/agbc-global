import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  createCaller,
  createTestBranch,
  deleteCaller,
  deleteTestBranch,
  type TestCaller,
} from '@/test/callers';

import { moderateItem } from './moderateItem';
import { loadModerationQueue } from './moderationQueue';
import { authorize, type Caller } from './authorize';

/**
 * Decisions, against the real database.
 *
 * The interesting test here is the RACE, and it can only live at this level: `now()` is
 * the TRANSACTION timestamp, so inside pgTAP's single transaction an author edit leaves
 * `updated_at` untouched and the two versions are identical by construction. Each call
 * below is its own request, exactly as PostgREST serves them, so the clock actually moves
 * and "the author edited while the leader was reading" can be staged for real.
 */

const minted: TestCaller[] = [];
let branchA: string;
let branchB: string;
let leaderA: TestCaller;
let leaderB: TestCaller;
let ministryAdmin: TestCaller;
let author: TestCaller;

async function caller(
  ...args: Parameters<typeof createCaller>
): Promise<TestCaller> {
  const created = await createCaller(...args);
  minted.push(created);
  return created;
}

async function context(target: TestCaller): Promise<Caller> {
  const verdict = await authorize(target.serverClient(), {
    action: 'access_dashboard',
  });
  if (!verdict.ok)
    throw new Error(`expected an authorized caller, got ${verdict.reason}`);
  return verdict.caller;
}

/** A fresh pending testimony in branch A, and the version a reviewer would hold. */
async function pendingItem(
  branchId = branchA,
): Promise<{ id: string; updatedAt: string }> {
  const { data, error } = await admin()
    .from('testimonies')
    .insert({
      author_id: author.userId,
      branch_id: branchId,
      body: `W2.7 slice 3 fixture ${String(Math.floor(performance.now() * 1000))}`,
      language: 'en',
      status: 'pending',
      consent_version: 'content-share-v1',
    })
    .select('id, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, updatedAt: data.updated_at };
}

async function statusOf(id: string): Promise<string> {
  const { data } = await admin()
    .from('testimonies')
    .select('status')
    .eq('id', id)
    .single();
  return data?.status ?? 'missing';
}

beforeAll(async () => {
  branchA = await createTestBranch('decide-a');
  branchB = await createTestBranch('decide-b');
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
  author = await caller({ role: 'member', branchId: branchA, mfa: 'none' });
});

afterAll(async () => {
  await admin().from('testimonies').delete().eq('author_id', author.userId);
  await Promise.all(minted.map(deleteCaller));
  await Promise.all([deleteTestBranch(branchA), deleteTestBranch(branchB)]);
});

describe('deciding', () => {
  test('a leader approves an item in their branch', async () => {
    const item = await pendingItem();

    const result = await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'approve',
    });

    expect(result).toEqual({ ok: true });
    expect(await statusOf(item.id)).toBe('approved');
  });

  test('rejecting records the reason the author will see', async () => {
    const item = await pendingItem();

    const result = await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'reject',
      rejectionReason: 'Please add a little more detail about what happened.',
    });

    expect(result).toEqual({ ok: true });
    const { data } = await admin()
      .from('testimonies')
      .select('status, rejection_reason, moderation_note')
      .eq('id', item.id)
      .single();
    expect(data?.status).toBe('rejected');
    expect(data?.rejection_reason).toMatch(/more detail/);
    expect(data?.moderation_note).toBeNull();
  });

  test('rejecting without a reason is refused before it reaches the database', async () => {
    const item = await pendingItem();

    const result = await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'reject',
      rejectionReason: '   ',
    });

    expect(result).toEqual({ ok: false, reason: 'missing_reason' });
    expect(await statusOf(item.id)).toBe('pending');
  });

  test('removing records a PRIVATE note, and no author-facing reason', async () => {
    const item = await pendingItem();

    const result = await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'remove',
      moderationNote:
        'Safeguarding: disclosed self-harm, routed to the lead pastor.',
    });

    expect(result).toEqual({ ok: true });
    const { data } = await admin()
      .from('testimonies')
      .select('status, rejection_reason, moderation_note')
      .eq('id', item.id)
      .single();
    expect(data?.status).toBe('removed');
    // The whole point of the separate column: the author is never handed this.
    expect(data?.moderation_note).toMatch(/Safeguarding/);
    expect(data?.rejection_reason).toBeNull();
  });

  test('removing without a note is refused', async () => {
    const item = await pendingItem();

    const result = await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'remove',
    });

    expect(result).toEqual({ ok: false, reason: 'missing_reason' });
    expect(await statusOf(item.id)).toBe('pending');
  });
});

describe('the race the compare-and-set exists for', () => {
  test('an author edit between review and decision refuses the decision', async () => {
    // Start A: the leader loads the queue and reads a version.
    const item = await pendingItem();
    const queue = await loadModerationQueue(
      leaderA.serverClient(),
      await context(leaderA),
    );
    const reviewed = queue.items.find((entry) => entry.id === item.id);
    expect(reviewed).toBeDefined();

    // Interleave B: the author rewrites the words while the leader is reading. A separate
    // request, so the transaction clock actually moves.
    const edit = await admin()
      .from('testimonies')
      .update({
        body: 'Completely different words, written after the leader looked.',
      })
      .eq('id', item.id)
      .select('updated_at')
      .single();
    expect(edit.error).toBeNull();
    expect(edit.data?.updated_at).not.toBe(reviewed?.updatedAt);

    // Complete A: the decision carries the version the leader actually reviewed.
    const result = await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: reviewed?.updatedAt ?? '',
      decision: 'approve',
    });

    expect(result).toEqual({ ok: false, reason: 'content_changed' });
    // Nothing published. The item is still waiting, now showing the new words.
    expect(await statusOf(item.id)).toBe('pending');
  });

  test('re-reading and deciding again succeeds', async () => {
    // The honest recovery path: the leader is sent back to read what changed.
    const item = await pendingItem();
    await admin()
      .from('testimonies')
      .update({ body: 'Edited before anyone reviewed it.' })
      .eq('id', item.id);

    const queue = await loadModerationQueue(
      leaderA.serverClient(),
      await context(leaderA),
    );
    const fresh = queue.items.find((entry) => entry.id === item.id);

    const result = await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: fresh?.updatedAt ?? '',
      decision: 'approve',
    });

    expect(result).toEqual({ ok: true });
  });
});

describe('branch scope on the write path', () => {
  test('IDOR: a leader cannot decide another branch, and it is reported as a refusal', async () => {
    // The subtle one. RLS filters the row out rather than raising, so the statement
    // succeeds and changes nothing. If moderateItem() read that as success, a leader
    // would get a green tick for something that never happened.
    const item = await pendingItem(branchA);

    const result = await moderateItem(leaderB.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'approve',
    });

    expect(result).toEqual({ ok: false, reason: 'refused' });
    expect(await statusOf(item.id)).toBe('pending');
  });

  test('an admin can decide in any branch', async () => {
    const item = await pendingItem(branchB);

    const result = await moderateItem(ministryAdmin.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'approve',
    });

    expect(result).toEqual({ ok: true });
  });

  test('a member cannot decide at all, including on their own post', async () => {
    const item = await pendingItem();

    const result = await moderateItem(author.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'approve',
    });

    expect(result).toEqual({ ok: false, reason: 'refused' });
    expect(await statusOf(item.id)).toBe('pending');
  });
});

describe('removed is terminal until an admin says otherwise', () => {
  test('a leader cannot restore what they removed', async () => {
    const item = await pendingItem();
    await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'remove',
      moderationNote: 'Removed in error, for the test.',
    });

    const { data } = await admin()
      .from('testimonies')
      .select('updated_at')
      .eq('id', item.id)
      .single();

    const result = await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: data?.updated_at ?? '',
      decision: 'approve',
    });

    // This is precisely why the UI confirms a removal: the leader cannot take it back.
    expect(result).toEqual({ ok: false, reason: 'restore_needs_admin' });
    expect(await statusOf(item.id)).toBe('removed');
  });

  test('an admin can', async () => {
    const item = await pendingItem();
    await moderateItem(leaderA.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: item.updatedAt,
      decision: 'remove',
      moderationNote: 'Removed in error, for the test.',
    });

    const { data } = await admin()
      .from('testimonies')
      .select('updated_at')
      .eq('id', item.id)
      .single();

    const result = await moderateItem(ministryAdmin.serverClient(), {
      kind: 'testimony',
      id: item.id,
      reviewedUpdatedAt: data?.updated_at ?? '',
      decision: 'approve',
    });

    expect(result).toEqual({ ok: true });
    expect(await statusOf(item.id)).toBe('approved');
  });
});
