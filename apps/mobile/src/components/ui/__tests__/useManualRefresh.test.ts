import { act, renderHook } from '@testing-library/react-native';

import { useManualRefresh } from '../useManualRefresh';

// The spinner is feedback for a gesture. `query.isRefetching` looked like the
// right signal and was not: it is true for refetches the app starts itself, so
// a landed Glory made the feed appear to reload under the member (reported on
// device 2026-07-27).

test('nothing spins until someone pulls', async () => {
  const { result } = await renderHook(() =>
    useManualRefresh(() => Promise.resolve()),
  );
  expect(result.current.refreshing).toBe(false);
});

test('a pull spins, and stops when the refetch settles', async () => {
  let release!: () => void;
  const refetch = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const { result } = await renderHook(() => useManualRefresh(refetch));

  await act(() => {
    result.current.onRefresh();
  });
  expect(result.current.refreshing).toBe(true);

  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(result.current.refreshing).toBe(false);
});

test('a failed refresh still ends the gesture', async () => {
  // Otherwise the spinner hangs forever on a screen that is already showing its
  // own error state.
  const { result } = await renderHook(() =>
    useManualRefresh(() => Promise.reject(new Error('offline'))),
  );
  await act(async () => {
    result.current.onRefresh();
    await Promise.resolve();
  });
  expect(result.current.refreshing).toBe(false);
});
