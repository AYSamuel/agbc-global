import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

/**
 * Returning to the app has to count as focus.
 *
 * React Query's refetch-on-focus is a no-op in React Native until AppState is handed to
 * `focusManager`. Missing that step meant nothing refetched except on mount or on an
 * explicit pull, which showed up on device as a branch-change welcome that would not
 * appear until the app was force-restarted (2026-08-01).
 *
 * The listener is registered as a side effect of importing the data layer, so the test
 * imports it and then asks AppState what it is holding.
 */

type Handler = Parameters<typeof AppState.addEventListener>[1];

test('the data layer subscribes to AppState and mirrors it into focusManager', () => {
  const handlers: Handler[] = [];
  const spy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event, handler) => {
      if (event === 'change') handlers.push(handler);
      return { remove: () => undefined };
    });

  // Spied BEFORE the module loads, and NOT inside jest.isolateModules: an isolated
  // registry would hand the module its own copy of react-query, so the focusManager it
  // called would not be the one this test is watching.
  const setFocused = jest.spyOn(focusManager, 'setFocused');

  // require, not a dynamic import: this jest runs without --experimental-vm-modules, and
  // the listener is registered as a side effect of loading the module either way.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../queryPersist');

  expect(spy).toHaveBeenCalledWith('change', expect.any(Function));
  expect(handlers.length).toBeGreaterThan(0);

  handlers.forEach((handler) => {
    handler('background');
  });
  expect(setFocused).toHaveBeenLastCalledWith(false);

  handlers.forEach((handler) => {
    handler('active');
  });
  // The one that matters: coming back marks the app focused, which is what makes a stale
  // query refetch instead of waiting for a remount.
  expect(setFocused).toHaveBeenLastCalledWith(true);
});
