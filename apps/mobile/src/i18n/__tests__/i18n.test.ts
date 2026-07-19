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

  test('unknown keys fall back to English', async () => {
    await i18n.changeLanguage('de');
    // tagline is deliberately EN-only until the W4.6 translation pass.
    expect(i18n.t('tagline')).toBe(
      'One family · many nations · one amazing grace',
    );
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
