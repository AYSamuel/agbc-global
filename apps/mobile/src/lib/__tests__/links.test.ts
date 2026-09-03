import { privacyUrl, termsUrl } from '@/lib/links';

/**
 * The legal links, which are the one pair in the app where reaching the page is
 * not enough: `20` wants the policy UNDERSTOOD, and the website already carries
 * all four languages.
 */
describe('the legal pages the app links out to', () => {
  test('English reads the unprefixed page', () => {
    expect(privacyUrl('en')).toBe('https://www.agbcglobal.com/privacy');
    expect(termsUrl('en')).toBe('https://www.agbcglobal.com/terms');
  });

  test('the other three read their own', () => {
    expect(privacyUrl('de')).toBe('https://www.agbcglobal.com/de/privacy');
    expect(privacyUrl('nl')).toBe('https://www.agbcglobal.com/nl/privacy');
    expect(privacyUrl('fr')).toBe('https://www.agbcglobal.com/fr/privacy');
    expect(termsUrl('de')).toBe('https://www.agbcglobal.com/de/terms');
  });

  test('a regional tag still finds its language', () => {
    // i18next serves `de`, but a caller reaching for the device tag instead of
    // `i18n.language` must not silently fall back to English.
    expect(privacyUrl('de-AT')).toBe('https://www.agbcglobal.com/de/privacy');
  });

  test('a language the website does not carry falls back to English', () => {
    // Yoruba is spoken in Ogbomosho and the website has no pages for it, so the
    // English policy is the honest destination rather than a 404.
    expect(privacyUrl('yo')).toBe('https://www.agbcglobal.com/privacy');
  });

  test('every legal URL uses the canonical host', () => {
    // `agbcglobal.com` 308-redirects to `www.`, and the rest of the app already
    // links to `www`. Asserted because the redirect hides the mistake: the bare
    // host works, so nothing would ever fail on it.
    for (const url of [
      privacyUrl('en'),
      privacyUrl('fr'),
      termsUrl('en'),
      termsUrl('nl'),
    ]) {
      expect(url.startsWith('https://www.agbcglobal.com/')).toBe(true);
    }
  });
});
