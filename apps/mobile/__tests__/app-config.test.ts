import config from '../app.config';

// First-wire test for the Jest harness (W0.5), asserting something that must NEVER
// drift: the frozen Grace Portal identity (docs/spec/19, ADR 0002). If this fails,
// someone touched values that break the existing store listings.
describe('app identity is frozen', () => {
  test('android package and versionCode floor', () => {
    expect(config.android?.package).toBe('com.oami.agbcapp');
    expect(config.android?.versionCode).toBeGreaterThanOrEqual(20);
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
