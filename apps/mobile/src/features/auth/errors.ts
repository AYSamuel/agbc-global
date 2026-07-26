import { isAuthApiError } from '@supabase/supabase-js';

// Maps supabase-js auth failures to the docs/spec/03 AUTH-2 error states.
// GoTrue reports a wrong and an expired code with the SAME `otp_expired`
// code, so the invalid/expired split uses the client-side send time: within
// the 10-minute window a rejection means mistyped, beyond it means expired.

export const OTP_EXPIRY_MS = 10 * 60_000;

export type AuthErrorKey =
  | 'errorInvalidCode'
  | 'errorExpiredCode'
  | 'errorTooManyAttempts'
  | 'errorRateLimited'
  | 'errorOffline'
  | 'errorOutage';

export function mapAuthError(
  error: unknown,
  context: 'send' | 'verify',
  elapsedSinceSendMs?: number,
): AuthErrorKey {
  if (isAuthApiError(error)) {
    if (error.code === 'otp_expired') {
      return elapsedSinceSendMs !== undefined &&
        elapsedSinceSendMs >= OTP_EXPIRY_MS
        ? 'errorExpiredCode'
        : 'errorInvalidCode';
    }
    if (error.status === 429) {
      return context === 'verify' ? 'errorTooManyAttempts' : 'errorRateLimited';
    }
    // A reachable auth service refusing sends (5xx, misconfigured SMTP) is the
    // docs/spec/03 total-outage state; other 4xx on verify read as a bad code.
    if (error.status >= 500) return 'errorOutage';
    return context === 'verify' ? 'errorInvalidCode' : 'errorOutage';
  }
  // Non-API failures are transport: unreachable network, timeouts (the
  // client's bounded fetch aborts hangs), DNS. Offline is the honest state.
  return 'errorOffline';
}
