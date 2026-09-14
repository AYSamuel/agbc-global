import { Share } from 'react-native';

// Outbound sharing of Family content (docs/spec/09). Sharing is not a gated
// contribution, so guests can do it: no GateSheet here. The text carries an
// attribution line so a forwarded testimony still credits its author and branch.

export function testimonyShareText(
  body: string,
  attribution: string | null,
  appName: string,
): string {
  const quote = `“${body}”`;
  return attribution
    ? `${quote}\n${attribution} · ${appName}`
    : `${quote}\n${appName}`;
}

/**
 * The daily verse, as words (docs/spec/07 §54).
 *
 * Folded in here at W4.15 from `VerseCard`, which composed it inline and called
 * `Share.share` directly. Two of the app's nine share points bypassed this module; this
 * closes one of them, and the sermon player closes the other in slice 3.
 *
 * The curly quotes are `testimonyShareText`'s, not the straight ones the inline version
 * used: one module, one way of quoting somebody.
 */
export function verseShareText(
  text: string,
  reference: string,
  translation: string,
): string {
  const quote = `“${text}”`;
  return `${quote}\n${reference} · ${translation}`;
}

/** The event, as words: exactly what EVENT-DETAIL sent before W4.15 slice 3. */
export function eventShareText(
  title: string,
  day: string,
  time: string,
  location: string | null,
  appName: string,
): string {
  return `${title} · ${day} ${time}${location ? ` · ${location}` : ''} · ${appName}`;
}

/** The branch, as words: exactly what BRANCH-INFO sent before W4.15 slice 3. */
export function branchShareText(
  name: string,
  city: string,
  country: string,
  sunday: string | null,
  appName: string,
): string {
  return `${name} · ${city}, ${country}${sunday ? ` · ${sunday}` : ''} · ${appName}`;
}

export function youtubeUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

/**
 * The message, as words (docs/spec/08 §25). Folded in here at W4.15 slice 3 from the
 * player, which composed it inline and called `Share.share` directly: the last of the
 * nine share points to bypass this module. The words are the player's own: the title,
 * and the YouTube link when there is one, because that is the one link a recipient can
 * tap.
 */
export function sermonShareText(
  title: string,
  youtubeId: string | null,
): string {
  return youtubeId
    ? `${title}
${youtubeUrl(youtubeId)}`
    : title;
}

/**
 * OS share sheet for words. Every picture share's "Send as text instead" lands here too.
 *
 * `shareToWhatsApp`, a wa.me link with the text prefilled, lived beside this until W4.15
 * slice 2 (Ayo, 2026-09-13): a wa.me link can only ever carry TEXT, so TESTIMONY-DETAIL's
 * green button could not send the picture every other Share now sends, and the screen
 * draws PRAYER-DETAIL's plain Share instead. WhatsApp is one tap away on the OS sheet.
 */
export async function shareText(message: string): Promise<void> {
  await Share.share({ message });
}
