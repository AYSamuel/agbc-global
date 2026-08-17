import {
  deepLinkFromData,
  FALLBACK_ROUTE,
  notificationIdFromData,
  resolveDeepLink,
} from '../deepLinks';

// A notification payload is UNTRUSTED input that arrives from outside the app and is acted
// on with one tap, often from a lock screen. `15` and `03` both say a deep link navigates
// and never writes, and this allowlist is the only thing enforcing it once W3.5 lets a
// leader type a link into a broadcast.

describe('routes the app is willing to open', () => {
  it('allows the static routes on the list', () => {
    expect(resolveDeepLink('/family')).toBe('/family');
    expect(resolveDeepLink('/my-posts')).toBe('/my-posts');
    expect(resolveDeepLink('/settings/profile')).toBe('/settings/profile');
    expect(resolveDeepLink('/')).toBe('/');
  });

  it('allows a dynamic route with a plausible id', () => {
    expect(
      resolveDeepLink('/prayer/8f14e45f-ceea-467a-9f6b-1f0a0e2b7c31'),
    ).toBe('/prayer/8f14e45f-ceea-467a-9f6b-1f0a0e2b7c31');
    expect(resolveDeepLink('/course/grace-reset')).toBe('/course/grace-reset');
  });

  it('treats a trailing slash as the same route', () => {
    expect(resolveDeepLink('/more/')).toBe('/more');
  });

  it('sends anything unrecognised to the notification centre, never nowhere', () => {
    // A tap that appears to do nothing reads as a broken app.
    expect(resolveDeepLink('/not-a-route')).toBe(FALLBACK_ROUTE);
    expect(resolveDeepLink('')).toBe(FALLBACK_ROUTE);
    expect(resolveDeepLink(undefined)).toBe(FALLBACK_ROUTE);
    expect(resolveDeepLink(42)).toBe(FALLBACK_ROUTE);
  });
});

describe('what the allowlist is actually for', () => {
  it('refuses anything that would leave the app', () => {
    expect(resolveDeepLink('https://evil.example/steal')).toBe(FALLBACK_ROUTE);
    expect(resolveDeepLink('agbcglobal://family')).toBe(FALLBACK_ROUTE);
    // `//host` is an authority even with no scheme.
    expect(resolveDeepLink('//evil.example/family')).toBe(FALLBACK_ROUTE);
  });

  it('refuses a query string, which is how navigation becomes an action', () => {
    // expo-router would hand these straight to the screen as params.
    expect(resolveDeepLink('/give?confirm=1')).toBe(FALLBACK_ROUTE);
    expect(resolveDeepLink('/family#anchor')).toBe(FALLBACK_ROUTE);
  });

  it('refuses traversal into routes that were never meant to be linkable', () => {
    expect(resolveDeepLink('/prayer/../dev-tokens')).toBe(FALLBACK_ROUTE);
    expect(resolveDeepLink('/../gallery')).toBe(FALLBACK_ROUTE);
  });

  it('refuses a dynamic segment that is not an id', () => {
    // A segment carrying slashes is not an id; it is an attempt at something else.
    expect(resolveDeepLink('/prayer/a/b')).toBe(FALLBACK_ROUTE);
    expect(resolveDeepLink('/prayer/')).toBe(FALLBACK_ROUTE);
    expect(resolveDeepLink(`/prayer/${'x'.repeat(200)}`)).toBe(FALLBACK_ROUTE);
  });

  it('refuses a dynamic id under a prefix that is not dynamic', () => {
    expect(resolveDeepLink('/settings/anything-else')).toBe(FALLBACK_ROUTE);
  });
});

describe('reading the payload', () => {
  it('reads exactly one field for the route', () => {
    expect(deepLinkFromData({ deepLink: '/family' })).toBe('/family');
    // Anything else in the payload is ignored on purpose.
    expect(deepLinkFromData({ deepLink: '/family', action: 'delete' })).toBe(
      '/family',
    );
  });

  it('falls back when the payload has no link at all', () => {
    expect(deepLinkFromData(null)).toBe(FALLBACK_ROUTE);
    expect(deepLinkFromData({})).toBe(FALLBACK_ROUTE);
    expect(deepLinkFromData('a string')).toBe(FALLBACK_ROUTE);
  });

  it('accepts a notification id only in a shape it could actually be', () => {
    expect(notificationIdFromData({ notificationId: 'abc-123' })).toBe(
      'abc-123',
    );
    expect(notificationIdFromData({ notificationId: '../../x' })).toBeNull();
    expect(notificationIdFromData({})).toBeNull();
  });
});
