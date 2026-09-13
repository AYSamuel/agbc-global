import { usePendingDeepLinkStore } from '@/features/notifications/pendingDeepLink';

import { redirectSystemPath } from '../../../../app/+native-intent';

/**
 * The hook expo-router calls with every URL the OS hands the app (W4.15 slice 2b). Two
 * things it must get right: a share link that LAUNCHES the app is held for the entry
 * router rather than routed (the entry `router.replace` would eat it, exactly as it ate
 * a notification's link on 2026-08-16), and every other URL passes through untouched.
 */

const ID = '7415a000-0000-4000-8000-000000000001';
const LINK = `https://www.agbcglobal.com/app/t/${ID}`;

beforeEach(() => {
  usePendingDeepLinkStore.setState({
    route: null,
    forGuests: false,
    entryDone: false,
  });
});

describe('redirectSystemPath', () => {
  it('holds a share link that launched the app, for guests, and answers with the root', () => {
    expect(redirectSystemPath({ path: LINK, initial: true })).toBe('/');
    expect(usePendingDeepLinkStore.getState().take()).toEqual({
      route: `/testimony/${ID}`,
      forGuests: true,
    });
  });

  it('routes a share link directly once the entry router has run', () => {
    usePendingDeepLinkStore.getState().markEntryDone();
    expect(redirectSystemPath({ path: LINK, initial: false })).toBe(
      `/testimony/${ID}`,
    );
    expect(usePendingDeepLinkStore.getState().route).toBeNull();
  });

  it('still holds a link that arrives before entry routing, whatever "initial" says', () => {
    // FCM taught the notification path this: the process can be alive and the launch
    // navigation still pending. The store's flag is the truth, not the argument.
    expect(redirectSystemPath({ path: LINK, initial: false })).toBe('/');
    expect(usePendingDeepLinkStore.getState().route).toBe(`/testimony/${ID}`);
  });

  it('passes every other URL through exactly as it arrived', () => {
    const dev =
      'exp+agbc://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081';
    expect(redirectSystemPath({ path: dev, initial: true })).toBe(dev);
    expect(usePendingDeepLinkStore.getState().route).toBeNull();
    const other = 'https://www.agbcglobal.com/privacy';
    expect(redirectSystemPath({ path: other, initial: false })).toBe(other);
  });
});
