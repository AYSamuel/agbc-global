// The website serves /give at the root for English and under /de, /nl, /fr for the
// other locales (astro prefixDefaultLocale:false). Match the app's active language
// so a German giver lands on the German page. String-built rather than via URL() to
// avoid depending on a URL polyfill under Hermes. Pure helper, kept out of the data
// layer so screens (and tests) can use it without touching the network client.
const LOCALIZED_GIVE_LANGS = new Set(['de', 'nl', 'fr']);

export function localizedGiveUrl(base: string, language: string): string {
  const lang = language.split('-')[0];
  if (!LOCALIZED_GIVE_LANGS.has(lang)) return base;
  // Match the origin (scheme + host) and slice the rest as the path, so an empty
  // path is a plain '' rather than an optional capture group eslint reads as
  // never-undefined.
  const match = /^https?:\/\/[^/]+/.exec(base);
  if (match === null) return base;
  const origin = match[0];
  const path = base.slice(origin.length);
  return `${origin}/${lang}${path}`;
}
