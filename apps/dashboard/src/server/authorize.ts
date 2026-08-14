import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

/**
 * The dashboard's authorization layer: one module every server route awaits before it
 * touches data (docs/spec/17 §Platform).
 *
 * `17` calls this "centralized middleware on every server route". It is deliberately
 * NOT Next's proxy.ts: that layer runs on prefetched routes and Next's own docs say it
 * "should not be your only line of defense in protecting your data". The pattern Next
 * prescribes, and what `17` actually describes, is a Data Access Layer: the check as
 * close to the data as possible. proxy.ts only redirects signed-out visitors.
 *
 * Three rules hold this together:
 *
 *  1. Authority never comes from the request. Role and branch are read from `profiles`
 *     server-side, never from the JWT claims alone (which go stale the moment someone
 *     is demoted, docs/spec/02) and never from a request body.
 *  2. The caller's identity is confirmed with the auth server, not just decoded.
 *     getClaims() would only prove the token was signed and unexpired; a leader who was
 *     signed out elsewhere would keep working until their token aged out. getUser()
 *     asks whether the session is still live, which is what a moderation surface needs.
 *  3. aal2 is part of the verdict, not a separate check somewhere else. One place, one
 *     answer, so no route can be written that forgets it.
 *
 * Why aal2 is enforced HERE and not in RLS: Supabase's own MFA guide reaches for a
 * restrictive policy `using (auth.jwt()->>'aal' = 'aal2')` on the table. On these tables
 * that policy would also apply to the MOBILE app's members, and would lock every member
 * out of their own content the moment any of them enrolled a factor. Only this layer
 * knows a request is a dashboard request.
 */

/** How long an aal2 session stays privileged before the code is asked for again. */
export const MFA_FRESHNESS_MS = 24 * 60 * 60 * 1000;

/**
 * The actions no leader has a version of, listed once.
 *
 * A set rather than a chain of `||` in the verdict below, so adding the next admin-only
 * action is one entry here and cannot be half-added: the refusal, the caller it carries
 * and the reason code all follow from membership.
 */
const ADMIN_ONLY = new Set<DashboardAction>([
  'assign_role',
  'manage_verses',
  'manage_sermon_audio',
]);

export type StaffRole = 'leader' | 'admin';

export interface Caller {
  userId: string;
  email: string;
  displayName: string;
  role: StaffRole;
  /** The branch a leader is scoped to. Admins have one too; it just does not limit them. */
  branchId: string;
  branchName: string;
}

export type DashboardAction =
  /** Reach the dashboard at all. Not branch-scoped. */
  | 'access_dashboard'
  /** Approve, reject or remove a piece of content. Branch-scoped (W2.7 slice 3). */
  | 'moderate_content'
  /**
   * Hand out a role, or move somebody between branches (W2.7 people slice).
   *
   * Admin-only and deliberately NOT branch-scoped: an admin moderates every branch, and
   * a leader gets no version of this at all. It lives here rather than as a
   * `role === 'admin'` line in the page for the reason at the top of this file: one
   * place, one answer, so no future route can be written that forgets it.
   */
  | 'assign_role'
  /**
   * Keep the daily-verse schedule (W2.7 slice 4).
   *
   * Admin-only for a product reason rather than a safety one: one verse goes to every
   * branch each day, so there is no branch-shaped version of this job. Asked for by name
   * here, and not as a `role === 'admin'` line inside `/verses`, because the schedule now
   * spans four routes and a form; one of them would eventually be written without it.
   */
  | 'manage_verses'
  /**
   * Stock the sermon-audio shelf: upload, attach, replace, remove (W3.1 slice 1b).
   *
   * Admin-only for the same product reason as the verses: one shelf serves every branch
   * (`17` §4), so there is no branch-shaped version of this job. The storage policies
   * repeat the rule at the data layer (live-table admin at aal2); this layer is what
   * keeps the dashboard's refusal inside the shell and pointing somewhere useful.
   */
  | 'manage_sermon_audio';

export interface AuthorizationRequest {
  action: DashboardAction;
  /**
   * The branch the TARGET belongs to, for branch-scoped actions.
   *
   * This must be read from the row being acted on, server-side. Passing a branch id
   * that came from the request body would hand the caller their own authority, which is
   * the exact hole `17` forbids and the CI probes hunt for.
   */
  branchId?: string;
}

export type DenialReason =
  /** No live session at all. */
  | 'unauthenticated'
  /** Signed in, but AUTH-3 never created a profile (docs/spec/03). */
  | 'no_profile'
  /** The profile is closed. */
  | 'account_closed'
  /** A real member of the church, with no dashboard role. */
  | 'not_staff'
  /** No second factor on the account yet. */
  | 'mfa_enrolment_required'
  /** A factor exists but this session has not cleared it, or cleared it too long ago. */
  | 'mfa_challenge_required'
  /** A leader reaching outside their branch. */
  | 'wrong_branch'
  /** Staff, but not a ministry admin, on an admin-only action. */
  | 'not_admin';

export type Verdict =
  | { ok: true; caller: Caller }
  | { ok: false; reason: DenialReason; caller?: Caller };

type Client = SupabaseClient<Database>;

/** Injected so the freshness rule is testable without waiting a day. */
export interface AuthorizeOptions {
  now?: number;
}

export async function authorize(
  supabase: Client,
  request: AuthorizationRequest,
  options: AuthorizeOptions = {},
): Promise<Verdict> {
  const now = options.now ?? Date.now();

  if (request.action === 'moderate_content' && !request.branchId) {
    // Fail closed and loudly: a branch-scoped action with no branch is a bug in the
    // calling route, not an unauthorized caller, and it must never read as "allowed".
    throw new Error(
      "authorize(): action 'moderate_content' requires a target branchId",
    );
  }

  const session = await resolveSession(supabase);
  if (!session.user) return { ok: false, reason: 'unauthenticated' };

  // Who they are BEFORE what they have proved, deliberately. Checking aal2 first would
  // walk an ordinary member through setting up an authenticator app and only then tell
  // them the dashboard was never for them. Their own role is not a secret being kept
  // from them by MFA: the factor protects privileged ACTIONS, and a member has none.
  const profile = session.profile;
  if (!profile) return { ok: false, reason: 'no_profile' };
  if (profile.deleted_at) return { ok: false, reason: 'account_closed' };
  if (profile.role !== 'leader' && profile.role !== 'admin') {
    return { ok: false, reason: 'not_staff' };
  }

  const assurance = await readAssurance(supabase);
  if (assurance.currentLevel !== 'aal2') {
    return {
      ok: false,
      reason:
        assurance.nextLevel === 'aal2'
          ? 'mfa_challenge_required'
          : 'mfa_enrolment_required',
    };
  }
  if (!isFresh(assurance.verifiedAt, now)) {
    return { ok: false, reason: 'mfa_challenge_required' };
  }

  const caller: Caller = {
    userId: profile.id,
    email: profile.email,
    displayName: profile.display_name,
    role: profile.role,
    branchId: profile.branch_id,
    branchName: profile.branches.name,
  };

  if (
    request.action === 'moderate_content' &&
    caller.role === 'leader' &&
    request.branchId !== caller.branchId
  ) {
    return { ok: false, reason: 'wrong_branch', caller };
  }

  // The caller comes back with the refusal so the page can keep them inside the shell
  // and point at the queue they DO have, rather than bouncing a working leader out to a
  // bare refusal screen. `role` here is the live table's answer, read above, so a leader
  // still holding an admin's stale claim does not get through.
  if (ADMIN_ONLY.has(request.action) && caller.role !== 'admin') {
    return { ok: false, reason: 'not_admin', caller };
  }

  return { ok: true, caller };
}

/**
 * Is there a live session at all, regardless of second factor?
 *
 * The ONE deliberate exception to "every route awaits authorize()", and it exists for a
 * single page: /mfa, where a leader goes precisely because they have not cleared aal2
 * yet. Gating that page on aal2 would be a redirect loop. It is exported by name, from
 * this module, so the exception stays visible and countable instead of becoming a habit
 * of calling getUser() directly wherever it is convenient.
 */
export async function requireSession(
  supabase: Client,
): Promise<{ userId: string } | null> {
  const { user } = await resolveSession(supabase);
  return user ? { userId: user.id } : null;
}

/** The session's assurance level, for the /mfa page to choose what to ask for. */
export async function sessionAssurance(
  supabase: Client,
  options: AuthorizeOptions = {},
): Promise<{ enrolled: boolean; verified: boolean; fresh: boolean }> {
  const assurance = await readAssurance(supabase);
  return {
    enrolled:
      assurance.nextLevel === 'aal2' || assurance.currentLevel === 'aal2',
    verified: assurance.currentLevel === 'aal2',
    fresh: isFresh(assurance.verifiedAt, options.now ?? Date.now()),
  };
}

/**
 * Everything about the caller that a single request needs, fetched at most once.
 *
 * Memoized against the client instance rather than through React's cache(), because a
 * client is already created fresh per request in every context this app has, and that
 * makes the memo work identically in Server Components and in route handlers.
 */
const sessionCache = new WeakMap<Client, Promise<ResolvedSession>>();

interface ResolvedSession {
  user: { id: string } | null;
  profile: ProfileRow | null;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  role: Database['public']['Enums']['profile_role'];
  branch_id: string;
  deleted_at: string | null;
  branches: { name: string };
}

async function resolveSession(supabase: Client): Promise<ResolvedSession> {
  const cached = sessionCache.get(supabase);
  if (cached) return await cached;

  const pending = loadSession(supabase);
  sessionCache.set(supabase, pending);
  return await pending;
}

async function loadSession(supabase: Client): Promise<ResolvedSession> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, profile: null };

  // Read through the CALLER's own client, so RLS ("members read their own profile")
  // is still the thing granting this read. Explicit columns, never select *.
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, email, display_name, role, branch_id, deleted_at, branches(name)',
    )
    .eq('id', data.user.id)
    .maybeSingle<ProfileRow>();

  return { user: { id: data.user.id }, profile: profile ?? null };
}

interface Assurance {
  currentLevel: string | null;
  nextLevel: string | null;
  /** When this session last cleared a second factor, in ms, or null if it never did. */
  verifiedAt: number | null;
}

async function readAssurance(supabase: Client): Promise<Assurance> {
  // Reads the access token this app already validated with the auth server above, so
  // the aal and amr claims in it are the auth server's word, not the browser's.
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return { currentLevel: null, nextLevel: null, verifiedAt: null };

  // amr entries are typed as `string | AMREntry`: the plain-string form is the bare
  // JWT claim shape, which carries no timestamp. Only the object form can date a
  // verification, and anything without a date is treated as undatable below.
  const dated = data.currentAuthenticationMethods.filter(
    (entry): entry is Exclude<typeof entry, string> =>
      typeof entry !== 'string',
  );

  const totp = dated
    .filter((entry) => entry.method === 'totp')
    // amr is ordered most recent first, but sorting says so out loud.
    .sort((a, b) => b.timestamp - a.timestamp)
    // .at(0), not [0]: without noUncheckedIndexedAccess an index reads as always
    // defined, and the empty-array case here is real (a session that never cleared a
    // factor). .at() is honestly typed as possibly undefined.
    .at(0);

  return {
    currentLevel: data.currentLevel,
    nextLevel: data.nextLevel,
    verifiedAt: totp ? totp.timestamp * 1000 : null,
  };
}

function isFresh(verifiedAt: number | null, now: number): boolean {
  // An aal2 session with no totp entry in amr should not exist. If it ever does, the
  // safe reading is "we cannot tell how old this is", so ask for the code.
  if (verifiedAt === null) return false;
  return now - verifiedAt < MFA_FRESHNESS_MS;
}
