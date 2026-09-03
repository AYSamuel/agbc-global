import i18n, { deviceLanguage } from '@/i18n';
import { resolveLanguage } from '@/state/language';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

describe('plurals per language (JSON v4 + Intl.PluralRules)', () => {
  test('German: one/other', async () => {
    await i18n.changeLanguage('de');
    expect(i18n.t('weeks', { count: 1 })).toBe('1 Woche');
    expect(i18n.t('weeks', { count: 3 })).toBe('3 Wochen');
  });

  test('French: count 0 selects the SINGULAR (CLDR "one" covers 0 and 1)', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('weeks', { count: 0 })).toBe('0 semaine');
    expect(i18n.t('weeks', { count: 1 })).toBe('1 semaine');
    expect(i18n.t('weeks', { count: 2 })).toBe('2 semaines');
  });

  test('English: count 0 selects the plural', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('weeks', { count: 0 })).toBe('0 weeks');
    expect(i18n.t('weeks', { count: 1 })).toBe('1 week');
  });

  test('Dutch: one/other', async () => {
    await i18n.changeLanguage('nl');
    expect(i18n.t('weeks', { count: 1 })).toBe('1 week');
    expect(i18n.t('weeks', { count: 2 })).toBe('2 weken');
  });
});

describe('namespaces and live switching', () => {
  test('settings namespace resolves per language', async () => {
    await i18n.changeLanguage('de');
    expect(i18n.t('settings:language')).toBe('Sprache');
    await i18n.changeLanguage('fr');
    expect(i18n.t('settings:language')).toBe('Langue');
    await i18n.changeLanguage('en');
    expect(i18n.t('settings:language')).toBe('Language');
  });

  /**
   * This test used to assert the OPPOSITE, with `tagline` as its vehicle,
   * because the line was deliberately English-only "until the W4.6 translation
   * pass". This is that pass, and the wording is ported from the website's own
   * `nav.tagline`, which has carried all four languages since it was written
   * (`22` §4: port website strings where possible).
   *
   * The English-fallback behaviour it was demonstrating can no longer be
   * demonstrated with a real key, and that is the point: after W4.6 slice 1 no
   * key is missing from any locale, and `scripts/check-i18n-keys.mjs` fails the
   * build if one ever is. The fallback stays configured as the net under a
   * mistake, rather than as a thing any string relies on.
   */
  test('the tagline reads in the language it is being read in', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('tagline')).toBe(
      'One family · many nations · one amazing grace',
    );
    await i18n.changeLanguage('de');
    expect(i18n.t('tagline')).toBe(
      'Eine Familie · viele Nationen · eine erstaunliche Gnade',
    );
    await i18n.changeLanguage('nl');
    expect(i18n.t('tagline')).toBe(
      'Eén familie · vele naties · één verbazingwekkende genade',
    );
    await i18n.changeLanguage('fr');
    expect(i18n.t('tagline')).toBe(
      'Une famille · plusieurs nations · une grâce infinie',
    );
    await i18n.changeLanguage('en');
  });
});

describe('language resolution', () => {
  test('device language maps to a supported language with EN fallback', () => {
    expect(deviceLanguage()).toBe('en');
  });

  test('explicit pref wins; system follows device', () => {
    expect(resolveLanguage('system', 'de')).toBe('de');
    expect(resolveLanguage('fr', 'de')).toBe('fr');
    expect(resolveLanguage('system', 'en')).toBe('en');
  });
});
