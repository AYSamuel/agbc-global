import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  createCaller,
  createTestBranch,
  deleteCaller,
  deleteTestBranch,
  stepUpCode,
  type TestCaller,
} from '@/test/callers';

import {
  assignRole,
  findMemberByEmail,
  isOnlyLeaderOfBranch,
  listActiveBranches,
} from './assignRole';
import { authorize, type Caller } from './authorize';

/**
 * The People server module, against the real database and real authenticators.
 *
 * Nothing here is mocked, and the reason is the same one `authorize.test.ts` gives: the
 * claim being tested is "an admin, and only an admin, holding a code from their own phone
 * right now, can hand out authority". A mocked auth server would only prove this file
 * agrees with the mock about what Supabase does. `src/test/totp.ts` plays the phone,
 * because the phone is the one party genuinely outside the system.
 *
 * Every assertion is scoped to ids this file created. The `server` project mints real
 * users against a shared local stack and leaves the odd one behind on a crash, so a test
 * that counted rows generally would fail for reasons that have nothing to do with the
 * code (three times during W2.7 before the cause was fixed rather than the symptom).
 */

const minted: TestCaller[] = [];
const branches: string[] = [];

let ministryAdmin: TestCaller;
let member: TestCaller;
let homeBranch: string;
let destination: string;
let archived: string;

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

async function profileOf(
  userId: string,
): Promise<{ role: string; branch_id: string }> {
  const { data, error } = await admin()
    .from('profiles')
    .select('role, branch_id')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Read through the ADMIN'S OWN client, not the service key.
 *
 * Not a preference: `privileged_actions` revokes everything from `service_role` on
 * purpose, so that a leaked key cannot rewrite the record of who was given authority.
 * Reading it as the admin is both the only way in from here and the more honest one,
 * since it is the way the audit will actually be read.
 */
async function auditFor(userId: string): Promise<string[]> {
  const { data, error } = await ministryAdmin
    .serverClient()
    .from('privileged_actions')
    .select('action')
    .eq('target_id', userId);
  if (error) throw new Error(error.message);
  // Sorted here rather than in the query, because there is nothing to sort BY. Both rows
  // come from one UPDATE, so `occurred_at` is the same transaction timestamp on each and
  // ordering by it returns them in whichever order the planner felt like: this assertion
  // passed once and failed on the next run before the sort was added. What the test means
  // is "one row per fact that changed", and that is a set.
  return data.map((row) => row.action).sort();
}

beforeAll(async () => {
  homeBranch = await branch('people-home');
  destination = await branch('people-destination');
  archived = await branch('people-archived');
  await admin()
    .from('branches')
    .update({ status: 'archived' })
    .eq('id', archived);

  ministryAdmin = await caller({
    role: 'admin',
    branchId: homeBranch,
    mfa: 'verified',
  });
  member = await caller({
    role: 'member',
    branchId: homeBranch,
    mfa: 'none',
  });
});

afterAll(async () => {
  await Promise.all(minted.map(deleteCaller));
  await Promise.all(branches.map(deleteTestBranch));
});

describe('finding one person by their exact address', () => {
  test('an onboarded member is found, with their branch and current role', async () => {
    const result = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      member.email,
    );

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.person.id).toBe(member.userId);
    expect(result.person.role).toBe('member');
    expect(result.person.branchId).toBe(homeBranch);
    expect(result.person.branchName).toMatch(/^Test Branch/);
    expect(result.person.joinedAt).toBeTruthy();
  });

  test('case and stray whitespace do not stop a match', async () => {
    const result = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      `  ${member.email.toUpperCase()} `,
    );

    expect(result).toMatchObject({ found: true });
  });

  test('a partial address finds nobody: there is no sweeping for members', async () => {
    // The one property `17` and `20` both turn on. A prefix of a real, live address must
    // behave exactly like an address that was never here.
    const result = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      member.email.slice(0, member.email.indexOf('@')),
    );

    expect(result).toEqual({ found: false, reason: 'no_account' });
  });

  test('an address with no account says so, rather than refusing vaguely', async () => {
    const result = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      `nobody-${String(process.pid)}@test.local`,
    );

    expect(result).toEqual({ found: false, reason: 'no_account' });
  });

  test('a closed account is named as closed', async () => {
    const closed = await caller({
      role: 'member',
      branchId: homeBranch,
      deleted: true,
    });

    const result = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      closed.email,
    );

    expect(result).toEqual({ found: false, reason: 'closed' });
  });

  test('somebody still in onboarding is named as unfinished', async () => {
    const joining = await caller({ role: 'member', branchId: homeBranch });
    await admin()
      .from('profiles')
      .update({ onboarded_at: null })
      .eq('id', joining.userId);

    const result = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      joining.email,
    );

    expect(result).toEqual({ found: false, reason: 'not_onboarded' });
  });

  test('the admin looking up their own address is told it is them', async () => {
    const result = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      ministryAdmin.email,
    );

    expect(result).toEqual({ found: false, reason: 'yourself' });
  });
});

describe('assigning a role', () => {
  test('an admin with a fresh code makes a member the leader of a branch', async () => {
    const promoted = await caller({ role: 'member', branchId: homeBranch });

    const result = await assignRole(ministryAdmin.serverClient(), {
      targetId: promoted.userId,
      role: 'leader',
      branchId: destination,
      code: await stepUpCode(ministryAdmin),
    });

    expect(result).toEqual({ ok: true });
    expect(await profileOf(promoted.userId)).toEqual({
      role: 'leader',
      branch_id: destination,
    });
    // One row per fact that changed, written by the trigger rather than by this code
    // path: an audit a caller has to remember is an audit a caller will forget.
    expect(await auditFor(promoted.userId)).toEqual([
      'branch_changed',
      'role_changed',
    ]);
  }, 45_000);

  test('a code from the wrong moment changes nothing', async () => {
    const untouched = await caller({ role: 'member', branchId: homeBranch });

    const result = await assignRole(ministryAdmin.serverClient(), {
      targetId: untouched.userId,
      role: 'leader',
      branchId: destination,
      code: '000000',
    });

    expect(result).toEqual({ ok: false, reason: 'bad_code' });
    expect(await profileOf(untouched.userId)).toEqual({
      role: 'member',
      branch_id: homeBranch,
    });
    expect(await auditFor(untouched.userId)).toEqual([]);
  });

  test('a leader cannot assign roles, even holding a valid code of their own', async () => {
    // The IDOR probe for this surface. A leader is staff, has cleared their own second
    // factor, and is refused by the database rather than by the page that hides the form.
    const leader = await caller({
      role: 'leader',
      branchId: homeBranch,
      mfa: 'verified',
    });
    const target = await caller({ role: 'member', branchId: homeBranch });

    const result = await assignRole(leader.serverClient(), {
      targetId: target.userId,
      role: 'leader',
      branchId: homeBranch,
      code: await stepUpCode(leader),
    });

    expect(result).toEqual({ ok: false, reason: 'not_admin' });
    expect(await profileOf(target.userId)).toMatchObject({ role: 'member' });
  }, 45_000);

  test('an admin cannot change their own role', async () => {
    const result = await assignRole(ministryAdmin.serverClient(), {
      targetId: ministryAdmin.userId,
      role: 'member',
      code: await stepUpCode(ministryAdmin),
    });

    expect(result).toEqual({ ok: false, reason: 'yourself' });
    expect(await profileOf(ministryAdmin.userId)).toMatchObject({
      role: 'admin',
    });
  }, 45_000);

  test('nobody is assigned into an archived branch', async () => {
    const target = await caller({ role: 'member', branchId: homeBranch });

    const result = await assignRole(ministryAdmin.serverClient(), {
      targetId: target.userId,
      role: 'leader',
      branchId: archived,
      code: await stepUpCode(ministryAdmin),
    });

    expect(result).toEqual({ ok: false, reason: 'archived_branch' });
    expect(await profileOf(target.userId)).toEqual({
      role: 'member',
      branch_id: homeBranch,
    });
  }, 45_000);

  test('an admin with no authenticator is stopped before the change is attempted', async () => {
    const bare = await caller({
      role: 'admin',
      branchId: homeBranch,
      mfa: 'none',
    });
    const target = await caller({ role: 'member', branchId: homeBranch });

    const result = await assignRole(bare.serverClient(), {
      targetId: target.userId,
      role: 'leader',
      branchId: destination,
      code: '123456',
    });

    expect(result).toEqual({ ok: false, reason: 'no_factor' });
    expect(await profileOf(target.userId)).toMatchObject({ role: 'member' });
  });
});

describe('the branch that would be left without a leader', () => {
  test('the only leader of a branch is reported as such', async () => {
    const lonely = await branch('people-lonely');
    const only = await caller({ role: 'leader', branchId: lonely });

    const found = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      only.email,
    );
    expect(found.found).toBe(true);
    if (!found.found) return;

    expect(
      await isOnlyLeaderOfBranch(ministryAdmin.serverClient(), found.person),
    ).toBe(true);
  });

  test('a branch with a second leader is not left without one', async () => {
    const shared = await branch('people-shared');
    const first = await caller({ role: 'leader', branchId: shared });
    await caller({ role: 'leader', branchId: shared });

    const found = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      first.email,
    );
    expect(found.found).toBe(true);
    if (!found.found) return;

    expect(
      await isOnlyLeaderOfBranch(ministryAdmin.serverClient(), found.person),
    ).toBe(false);
  });

  test('a member never counts as a branch losing its leader', async () => {
    const found = await findMemberByEmail(
      ministryAdmin.serverClient(),
      await context(ministryAdmin),
      member.email,
    );
    expect(found.found).toBe(true);
    if (!found.found) return;

    expect(
      await isOnlyLeaderOfBranch(ministryAdmin.serverClient(), found.person),
    ).toBe(false);
  });
});

describe('the branches a leader can be given', () => {
  test('lists the active ones and never an archived one', async () => {
    const options = await listActiveBranches(ministryAdmin.serverClient());
    const ids = options.map((option) => option.id);

    expect(ids).toContain(homeBranch);
    expect(ids).toContain(destination);
    // The one that matters: `set_member_role` refuses an archived destination, so
    // offering it would be an option that always fails.
    expect(ids).not.toContain(archived);
  });
});
