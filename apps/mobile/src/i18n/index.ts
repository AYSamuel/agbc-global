import './polyfills';

import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

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

// Namespaces per docs/spec/24 §2.5. The empty ones fill as their features build
// (home W1.4, watch W1.3, family W1.5, ...); full DE/NL/FR translation lands at W4.6.
export const NAMESPACES = [
  'common',
  'home',
  'watch',
  'family',
  'give',
  'events',
  'auth',
  'settings',
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
    auth: require('./locales/en/auth.json') as object,
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
    auth: require('./locales/de/auth.json') as object,
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
    auth: require('./locales/nl/auth.json') as object,
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
    auth: require('./locales/fr/auth.json') as object,
    errors: require('./locales/fr/errors.json') as object,
  },
};

export function deviceLanguage(): SupportedLanguage {
  const code = getLocales()[0].languageCode;
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code ?? '')
    ? (code as SupportedLanguage)
    : 'en';
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
