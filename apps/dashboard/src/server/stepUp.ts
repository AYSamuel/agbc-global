import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

/**
 * The fresh authenticator code, asked for at the moment of a consequential act.
 *
 * THE FRESH CODE IS NOT THE SAME THING AS THE SESSION BEING aal2. `authorize()` already
 * refuses any dashboard session below aal2, so a stale-but-verified session reaches every
 * page. `17` §Platform asks for step-up on the acts that hand out reach, because an
 * unattended laptop should not be able to perform one; this verifies the factor at the
 * moment of the change rather than inheriting a sign-in up to 24 hours earlier.
 *
 * WHERE THE LINE IS DRAWN, because it is a judgement rather than a rule and it should be
 * written down once. Role assignment asks (`set_member_role`). Closing a branch and moving
 * the headquarters ask (W3.5 slice 5b): both reach every member, and neither is undone by a
 * leader. An ordinary branch edit does NOT ask, and neither does approving a branch-change
 * request, because re-challenging somebody on routine work is how routine work stops getting
 * done (ADR 0015 decision 8).
 *
 * Lifted out of `assignRole.ts` when the branch module became its second caller, per
 * `~/.claude/standards/frontend.md`: a reusable piece buried in one module is a piece the
 * next module copies. Its behaviour is unchanged, including the deliberate flattening of
 * every failure into `bad_code`.
 */

type Client = SupabaseClient<Database>;

export type StepUpFailure = 'bad_code' | 'no_factor' | 'failed';

export async function verifyStepUp(
  supabase: Client,
  code: string,
): Promise<StepUpFailure | null> {
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
