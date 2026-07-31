import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { localStack } from './localStack';
import { totpCode } from './totp';

/**
 * Builds real signed-in callers against the local Supabase stack.
 *
 * Everything here is genuine: a real auth user, a real profile row under real RLS, a
 * real email-OTP sign-in, and a real TOTP factor enrolled and cleared through Supabase's
 * own challenge API. The only thing standing in for the outside world is the
 * authenticator app (src/test/totp.ts).
 *
 * Why not mock any of it: the claim these tests exist to check is "authorize() refuses
 * the wrong caller". A mocked session would only ever prove that authorize() agrees with
 * whatever the mock asserted about Supabase, which is the belief being tested, not the
 * behaviour (~/.claude/standards/qa-testing.md, and the W2.4 lesson).
 */

/** Seeded branches (supabase/seeds/00-common.sql). */
export const BRANCH = {
  glasgow: '00000000-0000-4000-8000-000000000001',
  berlin: '00000000-0000-4000-8000-000000000002',
} as const;

/**
 * A branch that exists only for one test file.
 *
 * Any test that COUNTS what a moderator sees needs this. Counting against a seeded
 * branch means counting the dev seed's content plus whatever a developer left behind
 * while clicking through the app, and the assertion fails for reasons that have nothing
 * to do with the code. That happened three times while building W2.7 before the cause
 * was fixed rather than the symptom.
 *
 * Owning the branch makes the queue exactly what the test put in it.
 */
export async function createTestBranch(label: string): Promise<string> {
  const service = admin();
  const slug = `test-${label}-${String(process.pid)}-${String(++branchCounter)}`;

  const { data, error } = await service
    .from('branches')
    .insert({
      slug,
      name: `Test Branch ${slug}`,
      city: 'Testville',
      country: 'Testland',
      timezone: 'Europe/London',
      lat: 0,
      lng: 0,
    })
    .select('id')
    .single();

  if (error)
    throw new Error(`could not create a test branch: ${error.message}`);
  return data.id;
}

export async function deleteTestBranch(id: string): Promise<void> {
  await admin().from('branches').delete().eq('id', id);
}

let branchCounter = 0;

/**
 * The four states a leader's second factor can actually be in.
 *
 * Worth spelling out, because Supabase's MFA guide describes `aal1 / aal2` as "user has
 * an MFA factor enrolled but has not verified it", which reads as though starting an
 * enrolment is enough to raise `nextLevel`. Measured against the local stack
 * (2026-07-29) it is not: `nextLevel` only reaches aal2 once a factor's status is
 * `verified`. A started-but-never-confirmed factor leaves the account at aal1/aal1,
 * indistinguishable from having no factor at all, which is the correct outcome (nobody
 * ever proved that authenticator works) but not the one the docs imply.
 */
export type MfaState =
  /** No factor on the account. */
  | 'none'
  /** A setup that was started and never confirmed. Still aal1/aal1. */
  | 'half-enrolled'
  /** A working factor, on a session that has not cleared it. aal1/aal2. */
  | 'unchallenged'
  /** A working factor, cleared by this session. aal2/aal2. */
  | 'verified';

export interface CallerOptions {
  role: Database['public']['Enums']['profile_role'];
  branchId?: string;
  mfa?: MfaState;
  /** Skip profile creation, to exercise the signed-in-but-no-profile path. */
  withoutProfile?: boolean;
  deleted?: boolean;
}

export interface TestCaller {
  userId: string;
  email: string;
  /**
   * The enrolled factor's secret, for tests that have to produce a code the way the
   * leader's phone would: role assignment asks for one at the moment of the change, so a
   * test of it without a real code would only be testing the mock. Undefined when the
   * caller was minted with `mfa: 'none'`.
   */
  totpSecret?: string;
  /** The session's cookies, in the form a browser would send them. */
  cookieHeader: string;
  /**
   * A fresh server client over this caller's cookies. New instance per call on purpose:
   * authorize() memoizes against the client, so a shared one would hide a second call's
   * behaviour and let a demotion mid-test go unnoticed.
   */
  serverClient: () => SupabaseClient<Database>;
}

let counter = 0;

/** A server client carrying no cookies at all: the signed-out visitor. */
export function anonymousClient(): SupabaseClient<Database> {
  const stack = localStack();

  return createServerClient<Database>(stack.url, stack.publishableKey, {
    cookies: {
      getAll: () => [],
      setAll: () => undefined,
    },
  });
}

export function admin(): SupabaseClient<Database> {
  const stack = localStack();
  return createClient<Database>(stack.url, stack.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createCaller(
  options: CallerOptions,
): Promise<TestCaller> {
  const stack = localStack();
  const service = admin();

  counter += 1;
  const email = `w27-caller-${String(counter)}-${String(process.pid)}@test.local`;

  const created = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (created.error) {
    throw new Error(`could not create the test user: ${created.error.message}`);
  }
  const userId = created.data.user.id;

  if (!options.withoutProfile) {
    const { error } = await service.from('profiles').insert({
      id: userId,
      email,
      display_name: `Caller ${String(counter)}`,
      branch_id: options.branchId ?? BRANCH.glasgow,
      role: options.role,
      onboarded_at: new Date().toISOString(),
      deleted_at: options.deleted ? new Date().toISOString() : null,
    });
    if (error)
      throw new Error(`could not create the test profile: ${error.message}`);
  }

  const browser = createClient<Database>(stack.url, stack.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await signIn(browser, service, email);

  const mfa = options.mfa ?? 'none';
  let totpSecret: string | undefined;
  if (mfa !== 'none') {
    totpSecret = await enrolTotp(browser, mfa !== 'half-enrolled');
  }
  if (mfa === 'unchallenged') {
    // Sign in again from scratch. The factor is verified on the ACCOUNT, but this new
    // session has only cleared the email code, which is exactly the state a leader is
    // in when they open the dashboard the next morning.
    await signIn(browser, service, email);
  }

  const { data: sessionData } = await browser.auth.getSession();
  const session = sessionData.session;
  if (!session) throw new Error('no session after sign-in');

  const jar = await writeSessionCookies(
    session.access_token,
    session.refresh_token,
  );

  return {
    userId,
    email,
    totpSecret,
    cookieHeader: serializeJar(jar),
    serverClient: () => clientOverJar(jar),
  };
}

/**
 * A code this caller's factor has not answered with yet.
 *
 * Supabase refuses a TOTP code it has already accepted, which is correct of it (a code
 * seen once must not work twice) and is a trap for a test: enrolling the factor uses a
 * code, and a step-up in the same 30-second window would then fail as a REPLAY and read
 * as "assignRole rejects a valid code". Every use is recorded here, and the next one
 * waits for the window to turn over rather than lying about the reason.
 *
 * The wait is real time, up to 30 seconds, which is why the tests that need one say so in
 * their timeout. Faking the clock would not help: the auth server keeps its own.
 */
export async function stepUpCode(caller: TestCaller): Promise<string> {
  const secret = caller.totpSecret;
  if (!secret) {
    throw new Error('this caller was minted without an authenticator');
  }

  const windowOf = (at: number) => Math.floor(at / 30_000);
  if (usedWindows.get(secret) === windowOf(Date.now())) {
    const nextWindow = (windowOf(Date.now()) + 1) * 30_000;
    await new Promise((resolve) =>
      setTimeout(resolve, nextWindow - Date.now() + 250),
    );
  }

  usedWindows.set(secret, windowOf(Date.now()));
  return totpCode(secret);
}

const usedWindows = new Map<string, number>();

/**
 * Best effort, and the case where it fails is worth knowing about.
 *
 * A caller who was ever GIVEN A ROLE cannot be deleted from here at all. Their profile has
 * `privileged_actions` rows, whose FK is `on delete set null`, and that update is refused
 * outside `agbc.audit_maintenance` by the append-only trigger. So the delete raises, this
 * swallows it, and the account stays on the local stack (measured 2026-07-31, after 81
 * leaders had quietly accumulated in the seeded Glasgow branch).
 *
 * The refusal is the audit log working, not a defect: a leaked service key must not be
 * able to erase who was granted authority. The product path is the deletion job, which
 * sets the maintenance flag and stamps `target_redacted_at` (decision 10, acceptance 12);
 * it is a later item, and nothing in this repo can erase such an account until it lands.
 *
 * What this costs tests: nothing, PROVIDED every assertion is scoped to ids the test
 * created. Anything that counts rows across a seeded branch will eventually fail for
 * reasons that have nothing to do with the code. `pnpm db:reset` clears the debris.
 */
export async function deleteCaller(caller: TestCaller): Promise<void> {
  await admin().auth.admin.deleteUser(caller.userId);
}

/**
 * Signs in the way a leader does: an emailed six-digit code. generateLink hands back the
 * code the email would have carried, so the real OTP path runs without Mailpit.
 */
async function signIn(
  browser: SupabaseClient<Database>,
  service: SupabaseClient<Database>,
  email: string,
): Promise<void> {
  const link = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (link.error)
    throw new Error(
      `could not generate the sign-in code: ${link.error.message}`,
    );

  const verified = await browser.auth.verifyOtp({
    email,
    token: link.data.properties.email_otp,
    type: 'magiclink',
  });
  if (verified.error)
    throw new Error(`could not sign in: ${verified.error.message}`);
}

/** Returns the factor's secret, so a test can play the authenticator later. */
async function enrolTotp(
  browser: SupabaseClient<Database>,
  verify: boolean,
): Promise<string> {
  const enrolled = await browser.auth.mfa.enroll({ factorType: 'totp' });
  if (enrolled.error)
    throw new Error(`could not enrol TOTP: ${enrolled.error.message}`);

  const secret = enrolled.data.totp.secret;
  if (!verify) return secret;

  const challenge = await browser.auth.mfa.challenge({
    factorId: enrolled.data.id,
  });
  if (challenge.error)
    throw new Error(`could not challenge TOTP: ${challenge.error.message}`);

  const result = await browser.auth.mfa.verify({
    factorId: enrolled.data.id,
    challengeId: challenge.data.id,
    code: totpCode(secret),
  });
  if (result.error)
    throw new Error(`could not verify TOTP: ${result.error.message}`);

  // This code is now spent. stepUpCode() reads this so a later step-up in the same
  // window waits rather than being refused as a replay.
  usedWindows.set(secret, Math.floor(Date.now() / 30_000));
  return secret;
}

type Jar = Map<string, string>;

/**
 * Hands the session to @supabase/ssr and lets IT write the cookies.
 *
 * The alternative, building `sb-<ref>-auth-token` by hand, would encode this repo's
 * belief about a cookie format the library owns and may change: chunking, encoding
 * prefix, name. Letting the library write them means the tests break loudly on a real
 * format change instead of passing against a format nobody uses any more.
 */
async function writeSessionCookies(
  accessToken: string,
  refreshToken: string,
): Promise<Jar> {
  const jar: Jar = new Map();
  const writer = clientOverJar(jar);

  const { error } = await writer.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error)
    throw new Error(`could not write session cookies: ${error.message}`);

  return jar;
}

function clientOverJar(jar: Jar): SupabaseClient<Database> {
  const stack = localStack();

  return createServerClient<Database>(stack.url, stack.publishableKey, {
    cookies: {
      getAll() {
        return [...jar].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          if (value === '') jar.delete(name);
          else jar.set(name, value);
        }
      },
    },
  });
}

function serializeJar(jar: Jar): string {
  return [...jar]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}
