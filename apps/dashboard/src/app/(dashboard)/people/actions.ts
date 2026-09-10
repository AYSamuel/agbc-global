'use server';

import { createServerComponentClient } from '@/lib/supabase/server';
import {
  assignRole,
  findMemberByEmail,
  isOnlyLeaderOfBranch,
  type Role,
} from '@/server/assignRole';
import { authorize } from '@/server/authorize';

import type { AssignState, LookupState } from './state';

/**
 * The two Server Actions behind People (docs/spec/17 §People, ADR 0015).
 *
 * Thin, like `moderation/actions.ts`: everything that can go wrong lives in
 * `server/assignRole.ts`, where it is tested against real sessions and a real database.
 * This layer parses the form, re-checks authority, and turns a result into something the
 * screen can say.
 *
 * TWO THINGS ARE DIFFERENT FROM THE MODERATION ACTION, and both come from one constraint.
 *
 * 1. **The outcome does not travel in the URL.** Moderation redirects back to
 *    `/moderation?outcome=approved`, which survives a refresh and re-submits nothing.
 *    That pattern cannot carry a person: the whole subject here is an email address, and
 *    `backend.md` (and `20`) keep PII out of URLs, where it lands in server logs, the
 *    browser's history and any `Referer` header. So the lookup is a POST whose answer
 *    comes back as state.
 *
 * 2. **This surface therefore needs JavaScript**, where the queue does not. That is a real
 *    cost and it is bounded: the dashboard's sign-in and MFA screens already call
 *    supabase-js in the browser, so nobody can reach this page without scripts anyway.
 *
 * Authority is re-read here rather than trusted from the page that rendered the form. A
 * Server Action is its own entry point, reachable by anyone who can POST to it, so
 * `authorize()` runs again in both. CSRF needs no explicit check: Next compares Origin
 * against Host for every Server Action, which is the same defence `sameOrigin.ts` gives
 * the route handlers that get no such thing for free.
 */

export async function find(
  _previous: LookupState,
  formData: FormData,
): Promise<LookupState> {
  // Echoed back exactly as typed, minus the whitespace: the not-found banner names the
  // address, and a typo is the likeliest reason to be reading it.
  const email = (readString(formData.get('email')) ?? '').trim();

  if (!looksLikeAnAddress(email)) {
    return { status: 'failed', email, reason: 'invalid' };
  }

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'assign_role' });
  if (!verdict.ok) return { status: 'failed', email, reason: 'refused' };

  const result = await findMemberByEmail(supabase, verdict.caller, email);
  if (!result.found) {
    return { status: 'failed', email, reason: result.reason };
  }

  return {
    status: 'found',
    email,
    person: result.person,
    onlyLeader: await isOnlyLeaderOfBranch(supabase, result.person),
  };
}

/**
 * Note what the success carries back: the role, and nothing else. The screen already
 * holds the person it looked up, so sending their name back through the action would be
 * a second copy of a fact that already has an owner, and a second chance for the two to
 * disagree.
 *
 * And note what is read from the form: an id, a role, a branch and a code. `targetId`
 * being client-supplied is not a hole, for the same reason the moderation action takes an
 * item id from a form: `set_member_role` refuses everything an admin may not do, whatever
 * id it is handed. The client chooses WHICH row, never what may be done to it.
 */
export async function assign(
  _previous: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const targetId = readString(formData.get('targetId'));
  const role = readRole(formData.get('role'));
  const branchId = readString(formData.get('branchId'));
  const code = readString(formData.get('code'));

  if (!targetId || !role || !code) {
    return { status: 'failed', reason: 'invalid' };
  }

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'assign_role' });
  if (!verdict.ok) return { status: 'failed', reason: 'refused' };

  const result = await assignRole(supabase, {
    targetId,
    role,
    branchId,
    code,
  });

  return result.ok
    ? { status: 'done', role }
    : { status: 'failed', reason: result.reason };
}

/**
 * Deliberately not a full RFC 5321 validation, and deliberately not a regex people have
 * to read. The lookup is an exact match, so a wrong address simply finds nobody; the only
 * job here is to stop an obviously empty or malformed entry from reading as "no account
 * for that address", which would send an admin hunting for a person rather than a typo.
 */
function looksLikeAnAddress(value: string): boolean {
  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const [name, domain] = parts;
  return name.length > 0 && domain.includes('.') && !/\s/.test(value);
}

function readString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRole(value: FormDataEntryValue | null): Role | undefined {
  return value === 'member' || value === 'leader' || value === 'admin'
    ? value
    : undefined;
}
