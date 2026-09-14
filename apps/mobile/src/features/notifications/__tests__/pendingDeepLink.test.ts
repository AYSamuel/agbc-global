import { mayOpenPending, usePendingDeepLinkStore } from '../pendingDeepLink';

/**
 * The held link's rule about WHO may follow it (W4.15 slice 2b). Before this a held link
 * was opened for a member and dropped for everyone else, which is right for a
 * notification and wrong for a scanned card: a testimony is guest-browsable and the
 * scanner is more often a stranger than a member. The rule lives here, beside the store,
 * so the entry router asks one question rather than two.
 */

beforeEach(() => {
  usePendingDeepLinkStore.setState({
    route: null,
    forGuests: false,
    entryDone: false,
  });
});

describe('mayOpenPending', () => {
  it('opens anything for a member', () => {
    expect(mayOpenPending({ forGuests: false }, 'member', true)).toBe(true);
    expect(mayOpenPending({ forGuests: true }, 'member', true)).toBe(true);
  });

  it('opens a guest-allowed link for a guest who has onboarded, and only then', () => {
    expect(mayOpenPending({ forGuests: true }, 'guest', true)).toBe(true);
    // A first launch goes to onboarding; a stranger's testimony over it is the wrong
    // screen in the wrong place.
    expect(mayOpenPending({ forGuests: true }, 'guest', false)).toBe(false);
    // A half-created profile resumes AUTH-3, and nothing is pushed over that either.
    expect(mayOpenPending({ forGuests: true }, 'onboarding', true)).toBe(false);
  });

  it("never opens a notification's link for a guest", () => {
    expect(mayOpenPending({ forGuests: false }, 'guest', true)).toBe(false);
    expect(mayOpenPending({ forGuests: false }, 'onboarding', true)).toBe(
      false,
    );
  });
});

describe('usePendingDeepLinkStore', () => {
  it('holds a notification link as member-only by default', () => {
    usePendingDeepLinkStore.getState().set('/prayer/abc');
    expect(usePendingDeepLinkStore.getState().take()).toEqual({
      route: '/prayer/abc',
      forGuests: false,
    });
  });

  it('take() clears both the route and its permission, once', () => {
    usePendingDeepLinkStore.getState().set('/testimony/abc', {
      forGuests: true,
    });
    expect(usePendingDeepLinkStore.getState().take()).toEqual({
      route: '/testimony/abc',
      forGuests: true,
    });
    expect(usePendingDeepLinkStore.getState().take()).toBeNull();
    expect(usePendingDeepLinkStore.getState().forGuests).toBe(false);
  });
});
