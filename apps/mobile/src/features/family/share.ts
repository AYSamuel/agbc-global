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
