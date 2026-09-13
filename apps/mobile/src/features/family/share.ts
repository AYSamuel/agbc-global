import { Linking, Share } from 'react-native';

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

/** OS share sheet (the "Share" affordance on cards and detail screens). */
export async function shareText(message: string): Promise<void> {
  await Share.share({ message });
}

/**
 * The mockup's "Share to WhatsApp" button. wa.me opens WhatsApp with the text
 * prefilled, or web WhatsApp if the app is not installed; if even that cannot
 * open, fall back to the OS share sheet so the button is never a dead end.
 */
export async function shareToWhatsApp(message: string): Promise<void> {
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  } else {
    await shareText(message);
  }
}
