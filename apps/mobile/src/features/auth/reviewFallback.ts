import { reviewSigninResponseSchema } from '@agbc/shared';

import { supabase } from '@/lib/supabase';

// Store-review bypass, client half (docs/spec/03 §Security). AUTH-2 calls this
// ONLY after a normal verifyOtp rejection: the app carries zero knowledge of
// the review email or code; the server decides and answers uniformly. On
// success the returned token_hash mints the session through the normal
// verification endpoint, so everything downstream is a plain member session.
export async function tryReviewSignin(
  email: string,
  code: string,
): Promise<boolean> {
  try {
    // The functions client types `error` as any; narrow the whole response.
    const { data, error } = (await supabase.functions.invoke('review-signin', {
      body: { email, code },
    })) as { data: unknown; error: unknown };
    if (error !== null) return false;
    const parsed = reviewSigninResponseSchema.safeParse(data);
    if (!parsed.success || !parsed.data.ok || !parsed.data.token_hash) {
      return false;
    }
    const verified = await supabase.auth.verifyOtp({
      token_hash: parsed.data.token_hash,
      type: 'email',
    });
    return verified.error === null;
  } catch {
    // The fallback never surfaces its own errors: the caller shows the
    // original invalid-code state.
    return false;
  }
}
