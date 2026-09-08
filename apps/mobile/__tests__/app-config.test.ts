import config from '../app.config';

// First-wire test for the Jest harness (W0.5), asserting something that must NEVER
// drift: the frozen Grace Portal identity (docs/spec/19, ADR 0002). If this fails,
// someone touched values that break the existing store listings.
describe('app identity is frozen', () => {
  test('android package', () => {
    expect(config.android?.package).toBe('com.oami.agbcapp');
  });

  // Was `versionCode >= 20` until 1.0.1, asserting a field EAS ignores. `eas.json`
  // sets `appVersionSource: "remote"`, so the build number lives on EAS and this one
  // was read by nobody: it said 20 while the shipped build was 22, and eas-cli warns
  // on every build that it should go. The floor is real and is enforced where it can
  // be, by Play refusing anything at or below the last upload; what a test here can
  // actually keep is that the number never comes BACK, because a re-added `20` would
  // be believed by the next person and mean nothing.
  test('no local versionCode, because EAS owns the build number', () => {
    expect(config.android?.versionCode).toBeUndefined();
  });

  // The release IS this field, and the forced-update gate parses it as x.y.z:
  // anything else makes the floor unparseable, and an unparseable floor fails open.
  test('version is a plain x.y.z release', () => {
    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('ios bundle identifier', () => {
    expect(config.ios?.bundleIdentifier).toBe(
      'com.olayinkaademiluka.grace-portal',
    );
  });

  test('runtime version uses the fingerprint policy', () => {
    expect(config.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });
});
