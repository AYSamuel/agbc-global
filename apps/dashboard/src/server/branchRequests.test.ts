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
import { decideRequest, loadBranchRequests } from './branchRequests';

/**
 * The branch-request board, against the real database.
 *
 * The assertion this file exists for is the one a happy-path suite would never think to
 * make: that the DESTINATION leader can read the NAME of somebody who is not in their
 * branch. Everything else here is about who cannot see what, because the read runs through
 * a security-definer view whose WHERE clause is the only thing standing between a leader
 * and every other branch's moves.
 *
 * Every assertion is scoped to branches this file created. The `server` project mints real
 * users against a shared local stack and cannot delete the ones that were given a role, so
 * anything counting rows across a seeded branch fails for reasons unrelated to the code.
 */

const minted: TestCaller[] = [];
const branches: string[] = [];

let destination: string;
let source: string;
let elsewhere: string;
let destinationLeader: TestCaller;
let sourceLeader: TestCaller;
let unrelatedLeader: TestCaller;
let ministryAdmin: TestCaller;

async function caller(
  ...args: Parameters<typeof createCaller>
): Promise<TestCaller> {
  const created = await createCaller(...args);
  minted.push(created);
  return created;
}

async function branch(label: string): Promise<string> {
  const created = await createTestBranch(label);
  branches.push(created);
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

/**
 * A member of the source branch asking to join the destination, through their OWN session.
 *
 * Not through the service key, and finding out why was worth the detour: `022` revokes
 * everything on this table from `service_role` on purpose, so a leaked key cannot forge a
 * move. Asking as the member is both the only way in and the honest one: the guard forces
 * `profile_id` and `from_branch_id` off their profile, so this stages exactly the row the
 * app would create.
 */
async function asks(
  from = source,
  to = destination,
): Promise<{ member: TestCaller; name: string; requestId: string }> {
  const member = await caller({ role: 'member', branchId: from });
  const client = member.serverClient();

  // `profile_id` and `from_branch_id` are sent because they are `not null` with no default,
  // so the generated types require them. The guard overwrites both from the caller's own
  // profile whatever arrives, which is what `022` proves and this file relies on rather
  // than re-tests.
  const { data, error } = await client
    .from('branch_change_requests')
    .insert({
      profile_id: member.userId,
      from_branch_id: from,
      to_branch_id: to,
    })
    .select('id')
    .single();
  if (error) throw new Error(`could not ask for the move: ${error.message}`);

  const { data: profile } = await client
    .from('profiles')
    .select('display_name')
    .eq('id', member.userId)
    .single();

  return {
    member,
    name: profile?.display_name ?? '',
    requestId: data.id,
  };
}

async function branchOf(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('profiles')
    .select('branch_id')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);
  return data.branch_id;
}

beforeAll(async () => {
  destination = await branch('req-destination');
  source = await branch('req-source');
  elsewhere = await branch('req-elsewhere');

  // `mfa: 'verified'` on everyone who reaches authorize(): the dashboard refuses a session
  // below aal2, so a fixture without a cleared factor fails as "enrol first" long before
  // the thing under test. Deciding a request asks for no FRESH code (decision 8), which is
  // a different question from the session's level.
  destinationLeader = await caller({
    role: 'leader',
    branchId: destination,
    mfa: 'verified',
  });
  sourceLeader = await caller({
    role: 'leader',
    branchId: source,
    mfa: 'verified',
  });
  unrelatedLeader = await caller({
    role: 'leader',
    branchId: elsewhere,
    mfa: 'verified',
  });
  ministryAdmin = await caller({
    role: 'admin',
    branchId: elsewhere,
    mfa: 'verified',
  });
});

afterAll(async () => {
  await Promise.all(minted.map(deleteCaller));
  await Promise.all(branches.map(deleteTestBranch));
});

describe('what each leader can see', () => {
  test('the destination leader sees the request AND can name the person', async () => {
    const { name, requestId } = await asks();

    const board = await loadBranchRequests(
      destinationLeader.serverClient(),
      await context(destinationLeader),
    );

    // THE ASSERTION THIS FILE EXISTS FOR. Selecting the table and joining the name gives
    // this leader an empty queue, because `profiles` is branch-scoped and the requester is
    // still in the branch they are leaving.
    const waiting = board.waiting.find((request) => request.id === requestId);
    expect(waiting).toBeDefined();
    expect(waiting).toMatchObject({
      displayName: name,
      fromBranchId: source,
      toBranchId: destination,
    });
    expect(name).not.toBe('');
    expect(waiting?.fromBranchName).toMatch(/^Test Branch/);
  });

  test('the source leader is told nothing while it is pending', async () => {
    await asks();

    const board = await loadBranchRequests(
      sourceLeader.serverClient(),
      await context(sourceLeader),
    );

    expect(board.waiting).toEqual([]);
    expect(board.left).toEqual([]);
  });

  test('a leader of neither branch sees an empty board', async () => {
    await asks();

    const board = await loadBranchRequests(
      unrelatedLeader.serverClient(),
      await context(unrelatedLeader),
    );

    expect(board.waiting).toEqual([]);
    expect(board.left).toEqual([]);
    expect(board.joinedThisYear).toBe(0);
  });

  test('the queue is oldest first, because the oldest is the one at risk', async () => {
    const first = await asks();
    const second = await asks();

    const board = await loadBranchRequests(
      destinationLeader.serverClient(),
      await context(destinationLeader),
    );
    const positions = [first.requestId, second.requestId].map((id) =>
      board.waiting.findIndex((request) => request.id === id),
    );

    expect(positions[0]).toBeGreaterThanOrEqual(0);
    expect(positions[0]).toBeLessThan(positions[1]);
  });
});

describe('deciding', () => {
  test('an approval moves the member, and the source branch is told afterwards', async () => {
    const { member, requestId } = await asks();

    const result = await decideRequest(destinationLeader.serverClient(), {
      requestId,
      approve: true,
    });

    expect(result).toEqual({ ok: true });
    expect(await branchOf(member.userId)).toBe(destination);

    const forSource = await loadBranchRequests(
      sourceLeader.serverClient(),
      await context(sourceLeader),
    );
    expect(forSource.left.map((request) => request.id)).toContain(requestId);
    expect(forSource.leftThisYear).toBeGreaterThan(0);

    const forDestination = await loadBranchRequests(
      destinationLeader.serverClient(),
      await context(destinationLeader),
    );
    expect(forDestination.waiting.map((request) => request.id)).not.toContain(
      requestId,
    );
    expect(forDestination.joinedThisYear).toBeGreaterThan(0);
  });

  test('a refusal needs a reason, and without one nothing changes', async () => {
    const { member, requestId } = await asks();

    const result = await decideRequest(destinationLeader.serverClient(), {
      requestId,
      approve: false,
    });

    expect(result).toEqual({ ok: false, reason: 'reason_required' });
    expect(await branchOf(member.userId)).toBe(source);
  });

  test('a refusal with a reason is recorded, and the source never learns of it', async () => {
    const { member, requestId } = await asks();

    const result = await decideRequest(destinationLeader.serverClient(), {
      requestId,
      approve: false,
      note: 'Spoke with them; they are still gathering in the old branch.',
    });

    expect(result).toEqual({ ok: true });
    expect(await branchOf(member.userId)).toBe(source);

    // "Tried to leave you and did not" is a different disclosure from "left you", and it
    // is worst in the safeguarding cases (decision 14).
    const forSource = await loadBranchRequests(
      sourceLeader.serverClient(),
      await context(sourceLeader),
    );
    expect(forSource.left.map((request) => request.id)).not.toContain(
      requestId,
    );
    expect(forSource.waiting.map((request) => request.id)).not.toContain(
      requestId,
    );
  });

  test('a leader cannot decide another branch’s queue', async () => {
    // The IDOR probe: a real leader, holding a real request id that is not theirs.
    const { member, requestId } = await asks();

    const result = await decideRequest(unrelatedLeader.serverClient(), {
      requestId,
      approve: true,
    });

    expect(result).toEqual({ ok: false, reason: 'not_yours' });
    expect(await branchOf(member.userId)).toBe(source);
  });

  test('the destination leader gets 48 hours before an admin may step in', async () => {
    // Decision 5, and the reason it exists: the fallback makes "usually within 48 hours"
    // honest without taking the branch's own queue away from its leader.
    const { requestId } = await asks();

    const result = await decideRequest(ministryAdmin.serverClient(), {
      requestId,
      approve: true,
    });

    expect(result).toEqual({ ok: false, reason: 'leader_first' });
  });

  test('an admin may act immediately when the destination has no leader at all', async () => {
    // True of every branch today, which is why the fallback is not theoretical.
    const leaderless = await branch('req-leaderless');
    const { member, requestId } = await asks(source, leaderless);

    const result = await decideRequest(ministryAdmin.serverClient(), {
      requestId,
      approve: true,
    });

    expect(result).toEqual({ ok: true });
    expect(await branchOf(member.userId)).toBe(leaderless);
  });

  test('a decision is final: the second one is refused', async () => {
    const { requestId } = await asks();

    await decideRequest(destinationLeader.serverClient(), {
      requestId,
      approve: true,
    });
    const again = await decideRequest(destinationLeader.serverClient(), {
      requestId,
      approve: false,
      note: 'changed my mind',
    });

    expect(again).toEqual({ ok: false, reason: 'already_decided' });
  });

  test('a request that is not there reads as gone, not as a failure', async () => {
    const result = await decideRequest(destinationLeader.serverClient(), {
      requestId: '00000000-0000-4000-8000-0000000000ff',
      approve: true,
    });

    expect(result).toEqual({ ok: false, reason: 'gone' });
  });
});
