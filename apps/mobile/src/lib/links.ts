import { Platform } from 'react-native';

// External destinations shared across screens. All public URLs; nothing here is
// secret (docs/spec/21 §3).

// TODO(W4.6 legal pass): confirm the exact terms/privacy paths on the website.
export const TERMS_URL = 'https://agbcglobal.com/terms';
export const PRIVACY_URL = 'https://agbcglobal.com/privacy';

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
