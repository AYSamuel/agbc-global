// The guarded require in front of `expo-in-app-updates` (W4.10 slice 1).
//
// Worth its own file because the thing being proved is what happens when the module is
// NOT there, which every client in existence is until the next EAS build: a top-level
// import of a native module a client does not carry crashes the route rather than
// degrading it (CLAUDE.md, the dev-client native fence), and that is exactly the bug this
// file exists to make impossible.
//
// `jest.resetModules` + `jest.doMock` rather than a hoisted `jest.mock`, because the
// accessor caches its answer for the life of the module: each case needs a fresh copy of
// `inAppUpdates.ts` with a different `require` outcome behind it.

type InAppUpdates = typeof import('../inAppUpdates');

function loadWith(factory: () => unknown): InAppUpdates {
  jest.resetModules();
  jest.doMock('expo-in-app-updates', factory);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../inAppUpdates') as InAppUpdates;
}

describe('a build whose client does not carry the native module', () => {
  const missing = () => {
    throw new Error("Cannot find native module 'ExpoInAppUpdates'");
  };

  test('degrades to null instead of throwing', () => {
    expect(loadWith(missing).inAppUpdatesModule()).toBeNull();
  });

  test('the check answers "nothing to say" rather than rejecting', async () => {
    await expect(loadWith(missing).checkForUpdate()).resolves.toBeNull();
  });

  test('starting an update reports that nothing took over', async () => {
    // False is what sends the caller to the store listing, so a member on an old
    // client still has a way forward rather than a button that does nothing.
    await expect(loadWith(missing).startUpdate(false)).resolves.toBe(false);
  });
});

describe('a build that does carry it', () => {
  test('the check is handed straight through', async () => {
    const answer = {
      updateAvailable: true,
      storeVersion: '23',
      flexibleAllowed: true,
    };
    const module = loadWith(() => ({
      checkForUpdate: () => Promise.resolve(answer),
      startUpdate: () => Promise.resolve(true),
    }));
    await expect(module.checkForUpdate()).resolves.toEqual(answer);
  });

  test('the flow choice reaches the platform', async () => {
    const startUpdate = jest.fn<Promise<boolean>, [boolean | undefined]>(() =>
      Promise.resolve(true),
    );
    const module = loadWith(() => ({
      checkForUpdate: () => Promise.resolve({ updateAvailable: false }),
      startUpdate,
    }));
    await expect(module.startUpdate(false)).resolves.toBe(true);
    // Flexible. Passing `true` here would take the member's screen for an update
    // they were only offered, which is slice 2's escalation and not this one.
    expect(startUpdate).toHaveBeenCalledWith(false);
  });

  test('a rejected check is an answer of null, not a crash', async () => {
    // Play rejects on a sideloaded build, on a device with no Play Store, and
    // offline. None of those is worth a word on screen.
    const module = loadWith(() => ({
      checkForUpdate: () => Promise.reject(new Error('Play unavailable')),
      startUpdate: () => Promise.resolve(true),
    }));
    await expect(module.checkForUpdate()).resolves.toBeNull();
  });

  test('a rejected start reports failure rather than propagating', async () => {
    const module = loadWith(() => ({
      checkForUpdate: () => Promise.resolve({ updateAvailable: false }),
      startUpdate: () => Promise.reject(new Error('no flow')),
    }));
    await expect(module.startUpdate(false)).resolves.toBe(false);
  });
});
