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

  // Same reason as the versionCode test above: EAS keeps the iOS build number too.
  test('no local ios buildNumber, because EAS owns it', () => {
    expect(config.ios?.buildNumber).toBeUndefined();
  });

  // Grace Portal 1.0.0 (18) supports iPad, and an App Store update may not drop a
  // device family the version before it supported. Expo's default is false, so this
  // line going missing fails the upload, not a test anyone runs on an iPad (W4.17).
  test('ios supports iPad, because the record it replaces does', () => {
    expect(config.ios?.supportsTablet).toBe(true);
  });

  // App Store Connect's Apple ID for the existing record. W4.10's iOS update check
  // looks it up; a wrong one answers about somebody else's app.
  test('ios carries the App Store id of the existing record', () => {
    expect(config.ios?.infoPlist?.AppStoreID).toBe('6760579106');
  });

  test('runtime version uses the fingerprint policy', () => {
    expect(config.runtimeVersion).toEqual({ policy: 'fingerprint' });
  });
});

describe('ios release declarations', () => {
  // Answers App Store Connect's export compliance question once, in the binary,
  // instead of by hand on every upload. The app uses only the OS's own encryption.
  test('declares no non-exempt encryption', () => {
    expect(config.ios?.config?.usesNonExemptEncryption).toBe(false);
  });
});
