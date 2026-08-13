import { useLaunchStore } from '../launch';

// onboarding_completed lives in the STORE ACTION (W2.10): `hasOnboarded` has
// one owner, and both ends of first run (ONB-3 Continue, ONB-1 "I'm just
// looking") flow through it. The wire is proven in lib/analytics/__tests__;
// this pins that completing onboarding is what raises the event.

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return --
   documented jest.mock factory shape */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */

beforeEach(() => {
  jest.clearAllMocks();
  useLaunchStore.setState({ hasOnboarded: false });
});

test('completing onboarding records the fact and fires the event', () => {
  useLaunchStore.getState().completeOnboarding();
  expect(useLaunchStore.getState().hasOnboarded).toBe(true);
  expect(mockTrack).toHaveBeenCalledWith('onboarding_completed');
});

test('hydration and other store writes fire nothing', () => {
  useLaunchStore.getState().setHydrated();
  expect(mockTrack).not.toHaveBeenCalled();
});
