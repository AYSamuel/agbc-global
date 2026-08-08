import { formattingLocale } from '../index';

// Which tag `Intl` formats with (docs/spec/16 §Localization).
//
// The app ships four LANGUAGES and translation looks one of them up. Formatting
// is a different question: day-month order and 12h/24h are regional, and a bare
// `en` resolves to en-US, so every member of a Glasgow-led church with branches
// in Berlin, Emmen and Ogbomosho was reading American dates.

// The device's locale lives INSIDE the factory: `i18n/index.ts` calls
// `deviceLanguage()` at module load, which runs before this file's own
// statements, so a test-file variable would still be undefined by then (the
// same shape `state/__tests__/auth.test.ts` uses, for the same reason).
jest.mock('expo-localization', () => {
  let locales = [{ languageCode: 'en', languageTag: 'en-US' }];
  return {
    __setLocale: (languageCode: string, languageTag: string) => {
      locales = [{ languageCode, languageTag }];
    },
    getLocales: () => locales,
  };
});

const { __setLocale: setLocale } = jest.requireMock<{
  __setLocale: (languageCode: string, languageTag: string) => void;
}>('expo-localization');

function onDevice(languageTag: string) {
  setLocale(languageTag.split('-')[0] ?? '', languageTag);
}

describe('the tag Intl formats with', () => {
  test("takes the device's REGION when it is reading the device's language", () => {
    onDevice('en-GB');
    expect(formattingLocale('en')).toBe('en-GB');
    // The same English, a different set of conventions. This is the whole
    // reason the app cannot format with a bare language code.
    onDevice('en-NG');
    expect(formattingLocale('en')).toBe('en-NG');
    onDevice('en-US');
    expect(formattingLocale('en')).toBe('en-US');
  });

  test('leaves the region to Intl when the reader has overridden the language', () => {
    // A UK phone switched to German in Settings: choosing German is a choice
    // about how the app should read, so it must not keep British conventions
    // (decided with Ayo 2026-08-08).
    onDevice('en-GB');
    expect(formattingLocale('de')).toBe('de');
    onDevice('de-DE');
    expect(formattingLocale('nl')).toBe('nl');
  });

  test('a device that reports no region falls back to the language', () => {
    setLocale('en', '');
    expect(formattingLocale('en')).toBe('en');
  });
});

describe('what it actually changes on screen', () => {
  // The bug, stated as the output nobody wanted: a stored Sunday rendered for a
  // reader in Glasgow. Asserted through `Intl` itself rather than through a
  // component, because this is the layer where the decision is made.
  const sunday = new Date(Date.UTC(2026, 7, 2));
  const asDate = (locale: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(sunday);

  test('British and Nigerian readers get day-first; American readers do not', () => {
    onDevice('en-GB');
    expect(asDate(formattingLocale('en'))).toBe('Sun 2 Aug');
    // Day-first as well, and punctuated differently: exactly the sort of thing
    // to leave to ICU rather than to decide in a component.
    onDevice('en-NG');
    expect(asDate(formattingLocale('en'))).toBe('Sun, 2 Aug');
    onDevice('en-US');
    expect(asDate(formattingLocale('en'))).toBe('Sun, Aug 2');
  });

  test('a UK phone reading German gets German, not British English', () => {
    onDevice('en-GB');
    expect(asDate(formattingLocale('de'))).toBe('So., 2. Aug.');
  });
});
