import { Platform } from 'react-native';

import { localizedWebsiteUrl } from '@/lib/websiteUrl';

// External destinations shared across screens. All public URLs; nothing here is
// secret (docs/spec/21 §3).

/**
 * The church website's legal pages, IN THE READER'S LANGUAGE.
 *
 * Two things were wrong with the constants these replace, and W4.6 confirmed
 * both against the live site rather than against memory.
 *
 * THE LANGUAGE. The website carries privacy, terms and Impressum in all four
 * languages (`Desktop/agbc` src/i18n/legal.ts, typed so a missing locale is a
 * build error there) and serves them prefixed: /de/privacy, /nl/terms, /fr/...,
 * with English unprefixed. The app linked to the English page unconditionally,
 * so a member reading the app in German tapped Privacy and got English. That is
 * the one place it matters most, since `20` requires the policy to be
 * understood, not merely reachable.
 *
 * THE HOST. `agbcglobal.com` 308-redirects to `www.agbcglobal.com`, and every
 * other website link in this app (giving, the Academy handoff) already uses
 * `www`. One redirect is cheap and an inconsistency is not: the next person
 * copies whichever they read first.
 *
 * The paths are confirmed live rather than assumed: /privacy, /terms and their
 * three prefixed forms each return 200 (checked 2026-09-02), which closes the
 * TODO this file carried for the legal pass.
 *
 * `localizedWebsiteUrl` is deliberately reused rather than re-derived: it
 * already owns "how the website's locales are shaped" for giving and Academy,
 * and a second copy of that rule is a second thing to get wrong the day the
 * site changes its routing.
 *
 * @param language i18next's active language, NOT the formatting locale. This is
 *   a question about which words to show, so the reader's region is irrelevant
 *   (see the note on `formattingLocale` in src/i18n).
 */
export function termsUrl(language: string): string {
  return localizedWebsiteUrl('https://www.agbcglobal.com/terms', language);
}

export function privacyUrl(language: string): string {
  return localizedWebsiteUrl('https://www.agbcglobal.com/privacy', language);
}

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.oami.agbcapp';

// TODO(before W4.8, ideally now): fill the numeric App Store id from App Store
// Connect (the existing Grace Portal record, docs/spec/19) and switch to
// `https://apps.apple.com/app/id<ID>`. Until then iOS best-efforts into the App
// Store app's search (legacy scheme; openURL needs no queries-scheme entry).
export const APP_STORE_URL =
  'itms-apps://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?media=software&term=Grace+Portal';

export function storeUrl(): string {
  return Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
}
