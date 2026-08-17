import './polyfills';

import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import deCommon from './locales/de/common.json';
import deSettings from './locales/de/settings.json';
import enCommon from './locales/en/common.json';
import enSettings from './locales/en/settings.json';
import frCommon from './locales/fr/common.json';
import frSettings from './locales/fr/settings.json';
import nlCommon from './locales/nl/common.json';
import nlSettings from './locales/nl/settings.json';

export const SUPPORTED_LANGUAGES = ['en', 'de', 'nl', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Autonyms for language pickers (each language names itself; mirrors the website's
// `languages` map in agbc/src/i18n/ui.ts).
export const LANGUAGE_AUTONYMS: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
  nl: 'Nederlands',
  fr: 'Français',
};

// Namespaces per docs/spec/24 §2.5 (church added at W1.7 for the screens 04
// owns directly, rhythm at W2.8 for attendance, the streak strip and RHYTHM,
// which span Home and their own screen and belong to neither). The empty ones
// fill as their features build (home W1.4, watch W1.3, family W1.5, ...); full
// DE/NL/FR translation lands at W4.6.
export const NAMESPACES = [
  'common',
  'home',
  'watch',
  'family',
  'give',
  'events',
  'church',
  'rhythm',
  'academy',
  'auth',
  'settings',
  'notifications',
  'errors',
] as const;

const resources = {
  en: {
    common: enCommon,
    settings: enSettings,
    home: require('./locales/en/home.json') as object,
    watch: require('./locales/en/watch.json') as object,
    family: require('./locales/en/family.json') as object,
    give: require('./locales/en/give.json') as object,
    events: require('./locales/en/events.json') as object,
    church: require('./locales/en/church.json') as object,
    rhythm: require('./locales/en/rhythm.json') as object,
    academy: require('./locales/en/academy.json') as object,
    auth: require('./locales/en/auth.json') as object,
    notifications: require('./locales/en/notifications.json') as object,
    errors: require('./locales/en/errors.json') as object,
  },
  de: {
    common: deCommon,
    settings: deSettings,
    home: require('./locales/de/home.json') as object,
    watch: require('./locales/de/watch.json') as object,
    family: require('./locales/de/family.json') as object,
    give: require('./locales/de/give.json') as object,
    events: require('./locales/de/events.json') as object,
    church: require('./locales/de/church.json') as object,
    rhythm: require('./locales/de/rhythm.json') as object,
    academy: require('./locales/de/academy.json') as object,
    auth: require('./locales/de/auth.json') as object,
    notifications: require('./locales/de/notifications.json') as object,
    errors: require('./locales/de/errors.json') as object,
  },
  nl: {
    common: nlCommon,
    settings: nlSettings,
    home: require('./locales/nl/home.json') as object,
    watch: require('./locales/nl/watch.json') as object,
    family: require('./locales/nl/family.json') as object,
    give: require('./locales/nl/give.json') as object,
    events: require('./locales/nl/events.json') as object,
    church: require('./locales/nl/church.json') as object,
    rhythm: require('./locales/nl/rhythm.json') as object,
    academy: require('./locales/nl/academy.json') as object,
    auth: require('./locales/nl/auth.json') as object,
    notifications: require('./locales/nl/notifications.json') as object,
    errors: require('./locales/nl/errors.json') as object,
  },
  fr: {
    common: frCommon,
    settings: frSettings,
    home: require('./locales/fr/home.json') as object,
    watch: require('./locales/fr/watch.json') as object,
    family: require('./locales/fr/family.json') as object,
    give: require('./locales/fr/give.json') as object,
    events: require('./locales/fr/events.json') as object,
    church: require('./locales/fr/church.json') as object,
    rhythm: require('./locales/fr/rhythm.json') as object,
    academy: require('./locales/fr/academy.json') as object,
    auth: require('./locales/fr/auth.json') as object,
    notifications: require('./locales/fr/notifications.json') as object,
    errors: require('./locales/fr/errors.json') as object,
  },
};

export function deviceLanguage(): SupportedLanguage {
  const code = getLocales()[0].languageCode;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code ?? '')
    ? (code as SupportedLanguage)
    : 'en';
}

/**
 * The tag `Intl` should format with, which is NOT the tag i18next translates
 * with (docs/spec/16 §Localization).
 *
 * The app ships four LANGUAGES, so translation looks up `en`. Formatting is a
 * different question with a different answer: day-month order, 12h against 24h
 * and decimal separators are regional, and a bare `en` resolves to en-US, so
 * until this existed every member of a Glasgow-led church with branches in
 * Berlin, Emmen and Ogbomosho read American dates ("Sun, Aug 2"). Format
 * follows the READER; a service time still follows the branch it happens in,
 * and a stored `service_date` follows neither (see features/rhythm/format.ts).
 *
 * The region comes from the device when it agrees with the language being
 * read, and is left to `Intl` otherwise: a UK phone reading English gets
 * en-GB, a Nigerian phone gets en-NG, and a UK phone SWITCHED to German gets
 * German conventions rather than British ones, because choosing German is a
 * choice about how the app should read (decided with Ayo 2026-08-08).
 *
 * @param language the language i18next is currently serving (`i18n.language`).
 */
export function formattingLocale(language: string): string {
  const device = getLocales()[0];
  return device.languageCode === language && device.languageTag
    ? device.languageTag
    : language;
}

/**
 * `formattingLocale` for components, re-evaluated when the language changes so
 * a live switch in Settings re-formats every date on screen (docs/spec/16:
 * "language change mid-session: relocalize without restart").
 *
 * Every `Intl` call site takes this. The bare `i18n.language` is still correct
 * for the things that are about the LANGUAGE rather than the reader's
 * conventions: the profile language sent at sign-up, the `daily_verses` lookup,
 * the website's locale path segment, and the language picker itself.
 */
export function useFormattingLocale(): string {
  const { i18n: instance } = useTranslation();
  return formattingLocale(instance.language);
}

// Initialized synchronously at import (bundled resources, no async loading); the root
// layout imports this module before anything renders.
// eslint-disable-next-line import/no-named-as-default-member -- i18next's documented fluent API
void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  ns: NAMESPACES,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
