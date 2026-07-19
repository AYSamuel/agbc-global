// Hermes ships WITHOUT Intl.PluralRules and Intl.Locale (verified against Hermes'
// IntlAPIs.md, July 2026), and i18next v24+ hard-requires Intl.PluralRules: DE/NL/FR
// plurals silently break without these (docs/spec/16). ORDER MATTERS: Locale first
// (PluralRules' prerequisite), then PluralRules (polyfill-force per FormatJS's React
// Native guidance), then the locale data for our four languages. The `.js` extensions
// are REQUIRED: the packages' exports maps only expose extensioned specifiers.
import '@formatjs/intl-locale/polyfill-force.js';
import '@formatjs/intl-pluralrules/polyfill-force.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/de.js';
import '@formatjs/intl-pluralrules/locale-data/nl.js';
import '@formatjs/intl-pluralrules/locale-data/fr.js';
