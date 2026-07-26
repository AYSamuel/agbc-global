import { AuthApiError } from '@supabase/supabase-js';

import { resolveAuthEntryRoute } from '@/state/auth';

import { mapAuthError, OTP_EXPIRY_MS } from '../errors';
import { maskEmail } from '../maskEmail';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({}),
  },
}));

describe('maskEmail (docs/spec/03 sent-to indicator)', () => {
  it('masks the local part down to its first character', () => {
    expect(maskEmail('ayo@gmail.com')).toBe('a•••@gmail.com');
    expect(maskEmail('a@b.co')).toBe('a•••@b.co');
  });

  it('returns unmaskable input unchanged', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email');
    expect(maskEmail('@lead.com')).toBe('@lead.com');
  });
});

describe('mapAuthError (docs/spec/03 AUTH-2 states)', () => {
  const otpRejected = new AuthApiError('Token expired', 403, 'otp_expired');

  it('reads a rejection inside the window as a mistyped code', () => {
    expect(mapAuthError(otpRejected, 'verify', 30_000)).toBe(
      'errorInvalidCode',
    );
  });

  it('reads a rejection past the window as expired', () => {
    expect(mapAuthError(otpRejected, 'verify', OTP_EXPIRY_MS + 1)).toBe(
      'errorExpiredCode',
    );
  });

  it('maps 429 per context', () => {
    const limited = new AuthApiError(
      'Rate limit',
      429,
      'over_request_rate_limit',
    );
    expect(mapAuthError(limited, 'verify')).toBe('errorTooManyAttempts');
    expect(mapAuthError(limited, 'send')).toBe('errorRateLimited');
  });

  it('maps a 5xx to the total-outage state', () => {
    const down = new AuthApiError('SMTP down', 500, 'unexpected_failure');
    expect(mapAuthError(down, 'send')).toBe('errorOutage');
  });

  it('maps transport failures to offline', () => {
    expect(mapAuthError(new TypeError('Network request failed'), 'send')).toBe(
      'errorOffline',
    );
    expect(mapAuthError(new Error('Aborted'), 'verify')).toBe('errorOffline');
  });
});

describe('resolveAuthEntryRoute (docs/spec/03 launch routing)', () => {
  it('resumes AUTH-3 for a half-created profile regardless of onboarding', () => {
    expect(resolveAuthEntryRoute(true, 'onboarding')).toBe('/auth/profile');
    expect(resolveAuthEntryRoute(false, 'onboarding')).toBe('/auth/profile');
  });

  it('follows the launch store otherwise', () => {
    expect(resolveAuthEntryRoute(true, 'member')).toBe('/home');
    expect(resolveAuthEntryRoute(true, 'guest')).toBe('/home');
    expect(resolveAuthEntryRoute(false, 'guest')).toBe('/onboarding/welcome');
  });
});
