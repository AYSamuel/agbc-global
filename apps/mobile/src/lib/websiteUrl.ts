// The website serves its pages at the root for English and under /de, /nl, /fr for
// the other locales (astro prefixDefaultLocale:false). Match the app's active
// language so a German reader lands on the German page. Lived in features/give
// (W1.x) until the Academy handoff needed the same rule (W2.9 slice 3); promoted
// here because it is website knowledge, not giving knowledge. String-built rather
// than via URL() to avoid depending on a URL polyfill under Hermes. Pure helper,
// kept out of the data layer so screens (and tests) can use it without touching
// the network client.
const LOCALIZED_WEBSITE_LANGS = new Set(['de', 'nl', 'fr']);

export function localizedWebsiteUrl(base: string, language: string): string {
  const lang = language.split('-')[0];
  if (!LOCALIZED_WEBSITE_LANGS.has(lang)) return base;
  // Match the origin (scheme + host) and slice the rest as the path, so an empty
  // path is a plain '' rather than an optional capture group eslint reads as
  // never-undefined.
  const match = /^https?:\/\/[^/]+/.exec(base);
  if (match === null) return base;
  const origin = match[0];
  const path = base.slice(origin.length);
  return `${origin}/${lang}${path}`;
}
