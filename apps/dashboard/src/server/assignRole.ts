import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import type { Caller } from './authorize';

/**
 * Finding a person, and giving them a role (W2.7 people slice, ADR 0015, docs/spec/17).
 *
 * Everything here goes through the caller's OWN client. The lookup reads `profiles` under
 * RLS, and the change goes through `set_member_role`, which checks the authority itself and
 * is the only write path to another member's profile that exists. Nothing in this module
 * can widen what the caller may do; it can only present it.
 */

type Client = SupabaseClient<Database>;
export type Role = Database['public']['Enums']['profile_role'];

export interface FoundPerson {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  branchId: string;
  branchName: string;
  onboarded: boolean;
  /** When their profile was created. The frame shows the year, as "Member since". */
  joinedAt: string;
}

/** One option in the branch chooser. */
export interface BranchOption {
  id: string;
  name: string;
}

/**
 * Why a lookup found nothing usable.
 *
 * These are DISTINCT on purpose, reversing the neutral-refusal rule the plan used to carry
 * (Ayo, 2026-07-31). That rule borrowed `signIn.codeSent`'s reasoning, which does not
 * transfer: `signIn` is anonymous, so one vague reply there stops a stranger testing who
 * belongs to the ministry. This surface is reached only by a live admin who has cleared
 * step-up TOTP and can already read every profile and the whole audit log, so a uniform
 * refusal protects nobody and costs them the ability to tell a typo from someone who has
 * never signed in.
 */
export type LookupFailure =
  'no_account' | 'closed' | 'not_onboarded' | 'yourself';

export type LookupResult =
  | { found: true; person: FoundPerson }
  | { found: false; reason: LookupFailure };

export type AssignFailure =
  | LookupFailure
  | 'last_admin'
  | 'archived_branch'
  | 'no_branch'
  | 'bad_code'
  | 'no_factor'
  | 'not_admin'
  | 'failed';

export type AssignResult = { ok: true } | { ok: false; reason: AssignFailure };

/**
 * Exact match only, and lowercased before comparing.
 *
 * `17` requires exact-email lookup with no partial matching, so nobody can sweep for which
 * addresses belong to the ministry, and so no member list is ever rendered. `eq` on a
 * normalised address is the whole of it: there is deliberately no `ilike`, no prefix search
 * and no "did you mean".
 */
export async function findMemberByEmail(
  supabase: Client,
  caller: Caller,
  rawEmail: string,
): Promise<LookupResult> {
  const email = rawEmail.trim().toLowerCase();

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, display_name, role, branch_id, created_at, deleted_at, onboarded_at, branches(name)',
    )
    .eq('email', email)
    .maybeSingle<{
      id: string;
      email: string;
      display_name: string;
      role: Role;
      branch_id: string;
      created_at: string;
      deleted_at: string | null;
      onboarded_at: string | null;
      branches: { name: string } | null;
    }>();

  if (error || !data) return { found: false, reason: 'no_account' };

  // Checked before "closed" and before anything else: telling an admin "that account is
  // closed" about their own address would be both wrong and confusing.
  if (data.id === caller.userId) return { found: false, reason: 'yourself' };
  if (data.deleted_at) return { found: false, reason: 'closed' };
  if (!data.onboarded_at) return { found: false, reason: 'not_onboarded' };

  return {
    found: true,
    person: {
      id: data.id,
      email: data.email,
      displayName: data.display_name,
      role: data.role,
      branchId: data.branch_id,
      branchName: data.branches?.name ?? '',
      onboarded: true,
      joinedAt: data.created_at,
    },
  };
}

/**
 * The branches the chooser may offer.
 *
 * Active only, because `set_member_role` refuses an archived destination outright:
 * archiving moves people OUT of a branch (`17` module 5), and leadership of an archived
 * branch is authority over nothing. Offering one would be an option that always fails.
 *
 * Read through the caller's own client like everything else here, though this one is
 * public data: `branches` is anon-readable (`02`), which is what lets the app draw the
 * family map before anybody signs in.
 */
export async function listActiveBranches(
  supabase: Client,
): Promise<BranchOption[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('id, name')
    .eq('status', 'active')
    .order('name');

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Is this person the last leader their branch has?
 *
 * Drives the warning the frame shows, and NOTHING else: `set_member_role` allows the
 * change either way, because a ministry that cannot demote its only leader is worse off
 * than one that is briefly leaderless. `17` module 5 raises the same concern about
 * archiving a branch; this is that concern in miniature, at the moment of the decision.
 *
 * Reads the live table rather than reasoning from what the form knows, because "the only
 * leader" is a fact about other people's rows that nothing on this screen can see.
 */
export async function isOnlyLeaderOfBranch(
  supabase: Client,
  person: FoundPerson,
): Promise<boolean> {
  if (person.role !== 'leader') return false;

  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('branch_id', person.branchId)
    .eq('role', 'leader')
    .is('deleted_at', null)
    .neq('id', person.id);

  // A failure here means the warning is not shown. Deliberate, and the least-bad of the
  // three options: this read cannot refuse anything, so raising would break a lookup that
  // otherwise worked, and warning anyway would tell an admin a branch is losing its
  // leader when it may not be. The admin's own lookup succeeded a moment earlier through
  // the same client, so a failure here is a stack problem they will meet again.
  if (error || count === null) return false;
  return count === 0;
}

/**
 * Assign the role, after proving the person is still holding the authenticator.
 *
 * THE FRESH CODE IS THE POINT, and it is not the same thing as the session being aal2.
 * `authorize()` already refuses any dashboard session below aal2, so a stale-but-verified
 * session reaches this page. `17` asks for step-up on role assignment specifically, because
 * handing out authority is the irreversible act in this feature: an unattended laptop should
 * not be able to make someone a leader. So the code is verified at the moment of the change,
 * not inherited from a sign-in up to 24 hours earlier.
 *
 * Contrast `decide_branch_request`, which asks for nothing extra: re-challenging a leader on
 * every queue item is how queues stop getting cleared (decision 8).
 */
export async function assignRole(
  supabase: Client,
  input: { targetId: string; role: Role; branchId?: string; code: string },
): Promise<AssignResult> {
  const stepUp = await verifyStepUp(supabase, input.code);
  if (stepUp) return { ok: false, reason: stepUp };

  const { error } = await supabase.rpc('set_member_role', {
    target: input.targetId,
    new_role: input.role,
    ...(input.branchId ? { new_branch: input.branchId } : {}),
  });

  if (!error) return { ok: true };
  return { ok: false, reason: mapRpcError(error.message) };
}

async function verifyStepUp(
  supabase: Client,
  code: string,
): Promise<AssignFailure | null> {
  const { data: factors, error: listError } =
    await supabase.auth.mfa.listFactors();
  if (listError) return 'failed';

  // listFactors() already returns only VERIFIED factors under `totp`, so filtering on
  // status here is dead code the linter is right to reject. `.at(0)` rather than `[0]`
  // because without noUncheckedIndexedAccess an index reads as always-defined, and an
  // admin with no factor enrolled is a real case: authorize() would have sent them to
  // /mfa, but this module must not assume that ran.
  const totp = factors.totp.at(0);
  if (!totp) return 'no_factor';

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: totp.id,
    code,
  });
  // Any failure here is reported as a bad code rather than passed through. The auth server
  // distinguishes an expired challenge from a wrong digit; the person retyping it does not
  // care, and the difference is a small oracle about their factor.
  return error ? 'bad_code' : null;
}

/**
 * Postgres error to a reason the surface can speak.
 *
 * The SQLSTATE alone is not enough: `set_member_role` raises 42501 for two different
 * refusals and 23514 for four, so the message is part of the contract. That coupling is
 * deliberate and safe in one specific way, which is worth stating because message-matching
 * is usually a smell: pgTAP `020` asserts every one of these strings, so changing a message
 * in the migration turns a database test red before it reaches this file.
 */
function mapRpcError(message: string): AssignFailure {
  const says = (fragment: string) => message.includes(fragment);

  if (says('only an admin assigns roles')) return 'not_admin';
  if (says('fresh code from your authenticator')) return 'bad_code';
  if (says('never self-service')) return 'yourself';
  if (says('no such member')) return 'no_account';
  if (says('that account is closed')) return 'closed';
  if (says('not finished joining')) return 'not_onboarded';
  if (says('no such branch')) return 'no_branch';
  if (says('that branch is archived')) return 'archived_branch';
  if (says('last admin cannot be demoted')) return 'last_admin';

  // An unmapped refusal is still a refusal. Falling through to a generic failure is what
  // keeps a future migration's new rule from reading as success here.
  return 'failed';
}
