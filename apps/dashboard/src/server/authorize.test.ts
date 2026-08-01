import { afterAll, describe, expect, test } from 'vitest';

import {
  admin,
  anonymousClient,
  BRANCH,
  createCaller,
  deleteCaller,
  type TestCaller,
} from '@/test/callers';

import { authorize, MFA_FRESHNESS_MS, requireSession } from './authorize';

// Every caller minted here is torn down at the end, so the suite can run repeatedly
// against the same local stack without leaving accounts behind.
const minted: TestCaller[] = [];

async function caller(
  ...args: Parameters<typeof createCaller>
): Promise<TestCaller> {
  const created = await createCaller(...args);
  minted.push(created);
  return created;
}

afterAll(async () => {
  await Promise.all(minted.map(deleteCaller));
});

describe('who gets in', () => {
  test('a signed-out caller is unauthenticated', async () => {
    const verdict = await authorize(anonymousClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toEqual({ ok: false, reason: 'unauthenticated' });
  });

  test('a leader who cleared TOTP is allowed in, with their branch', async () => {
    const leader = await caller({
      role: 'leader',
      branchId: BRANCH.berlin,
      mfa: 'verified',
    });

    const verdict = await authorize(leader.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.caller.role).toBe('leader');
    expect(verdict.caller.branchId).toBe(BRANCH.berlin);
    // Read from the database, not from a claim or a request: the name proves the join
    // actually happened.
    expect(verdict.caller.branchName).toBe('AGBC Lighthouse Berlin');
    expect(verdict.caller.email).toBe(leader.email);
  });

  test('a member of the church is refused, having done nothing wrong', async () => {
    const member = await caller({ role: 'member', mfa: 'verified' });

    const verdict = await authorize(member.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toMatchObject({ ok: false, reason: 'not_staff' });
  });

  test('a member is told they are not staff WITHOUT being sent to set up MFA first', async () => {
    // Ordering, not politeness: if aal2 were checked first, an ordinary member who
    // opened the dashboard out of curiosity would be walked through installing an
    // authenticator app and only then told the door was never theirs.
    const member = await caller({ role: 'member', mfa: 'none' });

    const verdict = await authorize(member.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toMatchObject({ ok: false, reason: 'not_staff' });
  });

  test('a signed-in caller with no profile is told so, not treated as staff', async () => {
    const stranger = await caller({
      role: 'member',
      mfa: 'verified',
      withoutProfile: true,
    });

    const verdict = await authorize(stranger.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toMatchObject({ ok: false, reason: 'no_profile' });
  });

  test('a closed account is refused even with the right role', async () => {
    const closed = await caller({
      role: 'admin',
      mfa: 'verified',
      deleted: true,
    });

    const verdict = await authorize(closed.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toMatchObject({ ok: false, reason: 'account_closed' });
  });
});

describe('the second factor is not decorative', () => {
  test('a leader with no factor at all is sent to enrol', async () => {
    const leader = await caller({ role: 'leader', mfa: 'none' });

    const verdict = await authorize(leader.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toMatchObject({
      ok: false,
      reason: 'mfa_enrolment_required',
    });
  });

  test('a half-finished setup counts as no factor, not as one to challenge', async () => {
    // Supabase raises nextLevel to aal2 only for a VERIFIED factor, so a setup that was
    // started and abandoned leaves the account at aal1/aal1. Sending this leader to
    // enrolment is right: nobody ever proved that authenticator produces working codes,
    // and the enrolment screen clears the dead factor and issues a fresh QR.
    const leader = await caller({ role: 'leader', mfa: 'half-enrolled' });

    const verdict = await authorize(leader.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toMatchObject({
      ok: false,
      reason: 'mfa_enrolment_required',
    });
  });

  test('a working factor does not let a session in until THAT session clears it', async () => {
    // The exact hole this rule exists to close, and the reason enrolment alone is
    // decorative: the leader has a real factor, but signed in with the email code only.
    // Without the aal2 check they would moderate at aal1.
    const leader = await caller({ role: 'leader', mfa: 'unchallenged' });

    const verdict = await authorize(leader.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toMatchObject({
      ok: false,
      reason: 'mfa_challenge_required',
    });
  });

  test('an admin is held to the same bar as a leader', async () => {
    const ministryAdmin = await caller({ role: 'admin', mfa: 'unchallenged' });

    const verdict = await authorize(ministryAdmin.serverClient(), {
      action: 'access_dashboard',
    });

    expect(verdict).toMatchObject({
      ok: false,
      reason: 'mfa_challenge_required',
    });
  });
});

describe('the freshness window', () => {
  test('a code cleared just now is fresh', async () => {
    const leader = await caller({ role: 'leader', mfa: 'verified' });

    const verdict = await authorize(
      leader.serverClient(),
      { action: 'access_dashboard' },
      { now: Date.now() },
    );

    expect(verdict.ok).toBe(true);
  });

  test('a code cleared just under 24h ago still counts', async () => {
    const leader = await caller({ role: 'leader', mfa: 'verified' });

    const verdict = await authorize(
      leader.serverClient(),
      { action: 'access_dashboard' },
      { now: Date.now() + MFA_FRESHNESS_MS - 60_000 },
    );

    expect(verdict.ok).toBe(true);
  });

  test('past 24h the code is asked for again', async () => {
    const leader = await caller({ role: 'leader', mfa: 'verified' });

    const verdict = await authorize(
      leader.serverClient(),
      { action: 'access_dashboard' },
      // The amr timestamp is whole seconds, so nudge past the boundary rather than
      // sitting exactly on it.
      { now: Date.now() + MFA_FRESHNESS_MS + 60_000 },
    );

    expect(verdict).toMatchObject({
      ok: false,
      reason: 'mfa_challenge_required',
    });
  });
});

describe('branch scope', () => {
  test('a leader may moderate their own branch', async () => {
    const leader = await caller({
      role: 'leader',
      branchId: BRANCH.glasgow,
      mfa: 'verified',
    });

    const verdict = await authorize(leader.serverClient(), {
      action: 'moderate_content',
      branchId: BRANCH.glasgow,
    });

    expect(verdict.ok).toBe(true);
  });

  test('a leader may NOT moderate another branch', async () => {
    // The IDOR probe, at the layer that decides. Every route-level probe in slice 2
    // lands on this same verdict.
    const leader = await caller({
      role: 'leader',
      branchId: BRANCH.glasgow,
      mfa: 'verified',
    });

    const verdict = await authorize(leader.serverClient(), {
      action: 'moderate_content',
      branchId: BRANCH.berlin,
    });

    expect(verdict).toMatchObject({ ok: false, reason: 'wrong_branch' });
  });

  test('an admin may moderate any branch', async () => {
    const ministryAdmin = await caller({
      role: 'admin',
      branchId: BRANCH.glasgow,
      mfa: 'verified',
    });

    const verdict = await authorize(ministryAdmin.serverClient(), {
      action: 'moderate_content',
      branchId: BRANCH.berlin,
    });

    expect(verdict.ok).toBe(true);
  });

  test('a branch-scoped action with no target branch throws rather than allowing', async () => {
    const leader = await caller({ role: 'leader', mfa: 'verified' });

    await expect(
      authorize(leader.serverClient(), { action: 'moderate_content' }),
    ).rejects.toThrow(/requires a target branchId/);
  });
});

describe('handing out roles', () => {
  test('an admin may assign roles', async () => {
    const ministryAdmin = await caller({
      role: 'admin',
      branchId: BRANCH.glasgow,
      mfa: 'verified',
    });

    const verdict = await authorize(ministryAdmin.serverClient(), {
      action: 'assign_role',
    });

    expect(verdict.ok).toBe(true);
  });

  test('a leader may not, in any branch, including their own', async () => {
    // Not branch-scoped, unlike moderation: there is no branch a leader may hand out
    // authority in. The refusal carries the caller so /people can keep them in the shell
    // and point at the queue that IS theirs.
    const leader = await caller({
      role: 'leader',
      branchId: BRANCH.glasgow,
      mfa: 'verified',
    });

    const verdict = await authorize(leader.serverClient(), {
      action: 'assign_role',
    });

    expect(verdict).toMatchObject({ ok: false, reason: 'not_admin' });
    expect(verdict.caller?.branchId).toBe(BRANCH.glasgow);
  });

  test('an admin who has not cleared their factor is challenged, not refused outright', async () => {
    // Order matters: the second factor is asked for before the role question is
    // answered, so an admin on a fresh session is sent to /mfa rather than being told
    // this page is not theirs.
    const ministryAdmin = await caller({
      role: 'admin',
      branchId: BRANCH.glasgow,
      mfa: 'unchallenged',
    });

    const verdict = await authorize(ministryAdmin.serverClient(), {
      action: 'assign_role',
    });

    expect(verdict).toMatchObject({
      ok: false,
      reason: 'mfa_challenge_required',
    });
  });

  test('a demoted admin loses it on their next request, token or no token', async () => {
    const ministryAdmin = await caller({
      role: 'admin',
      branchId: BRANCH.glasgow,
      mfa: 'verified',
    });
    await admin()
      .from('profiles')
      .update({ role: 'leader' })
      .eq('id', ministryAdmin.userId);

    const verdict = await authorize(ministryAdmin.serverClient(), {
      action: 'assign_role',
    });

    expect(verdict).toMatchObject({ ok: false, reason: 'not_admin' });
  });
});

describe('authority comes from the database, not the token', () => {
  test('a leader demoted after signing in is refused on their next request', async () => {
    // docs/spec/02's named caveat: the custom access token hook stamps user_role into
    // the JWT, and that claim stays 'leader' until the token refreshes. Reading the
    // role from the table is what makes a demotion take effect immediately.
    const leader = await caller({ role: 'leader', mfa: 'verified' });

    const before = await authorize(leader.serverClient(), {
      action: 'access_dashboard',
    });
    expect(before.ok).toBe(true);

    const { error } = await admin()
      .from('profiles')
      .update({ role: 'member' })
      .eq('id', leader.userId);
    expect(error).toBeNull();

    const after = await authorize(leader.serverClient(), {
      action: 'access_dashboard',
    });
    expect(after).toMatchObject({ ok: false, reason: 'not_staff' });
  });

  test('a signed-out session stops working immediately, not at token expiry', async () => {
    // getClaims() would still accept this token for up to an hour: it only checks the
    // signature and the clock. getUser() asks the auth server, which is the difference
    // between "signed out" and "signed out eventually".
    const leader = await caller({ role: 'leader', mfa: 'verified' });
    const client = leader.serverClient();

    expect((await authorize(client, { action: 'access_dashboard' })).ok).toBe(
      true,
    );

    const signedOut = await admin().auth.admin.signOut(
      await accessTokenOf(leader),
    );
    expect(signedOut.error).toBeNull();

    const verdict = await authorize(leader.serverClient(), {
      action: 'access_dashboard',
    });
    expect(verdict).toMatchObject({ ok: false, reason: 'unauthenticated' });
  });
});

describe('requireSession', () => {
  test('reports a live session without demanding a second factor', async () => {
    // What /mfa relies on: a leader mid-enrolment has a session but no aal2, and must
    // still be able to reach the page that fixes that.
    const leader = await caller({ role: 'leader', mfa: 'none' });

    const session = await requireSession(leader.serverClient());

    expect(session).toEqual({ userId: leader.userId });
  });
});

async function accessTokenOf(target: TestCaller): Promise<string> {
  const { data } = await target.serverClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('expected a session');
  return token;
}
