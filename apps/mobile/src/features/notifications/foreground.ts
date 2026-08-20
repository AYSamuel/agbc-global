// What a notification does when it arrives while the app is OPEN (docs/spec/15).
//
// Until now the app set no handler at all, so expo-notifications applied its default and
// showed nothing in the foreground. That was an omission rather than a decision, and it was
// invisible: the push arrives, Expo's receipt says ok, FCM delivers it, and the member sees
// nothing. Found on device 2026-08-20 while verifying the broadcast fan-out, by which point
// two earlier "a real push landed" claims in this project had been made on the strength of
// Expo accepting a ticket, which is a different thing entirely.
//
// THE RULE IS PER CATEGORY, because `15` has already made this judgement once. It says only
// service reminders interrupt, and `channels.ts` creates that channel at IMPORTANCE_HIGH for
// exactly that reason. A blanket "show everything in the foreground" would contradict a
// decision the project has already taken; a blanket "show nothing" is what we had.
//
// The banner and the tray are separate answers, which is what makes the middle ground
// possible: EVERYTHING reaches the tray, so nothing is ever lost, and the only question is
// whether it interrupts what the member is doing right now.
//
// Note `shouldShowAlert` is deprecated in expo-notifications 57 in favour of the
// banner/list pair; it is deliberately not set here.

/** Mirrors `NotificationBehavior` in expo-notifications 57, which is what the handler owes. */
export interface ForegroundBehaviour {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
}

/**
 * The one category that interrupts (`15`, and `channels.ts`'s `interrupts: true`).
 *
 * "Service starts in 1 hour" is useless seen late, and a member who is already reading the
 * app is exactly the person who should see it.
 */
const INTERRUPTS = new Set(['service_reminder']);

/**
 * News from the church. They were not looking for it, so a banner is right; a sound is not,
 * because they are already holding the phone.
 *
 * `event_change` is here rather than with the quiet transactional confirmations, and it is
 * the one exception to the rule below (W3.5 slice 4). It IS an answer to something the member
 * did, which is why it is always-on and gates on no preference; but unlike a registration
 * confirmed or a post approved, the screen they are looking at is not the one showing it, and
 * an event they are about to leave for being cancelled is news whatever else is open.
 */
const ANNOUNCEMENTS = new Set(['ministry', 'branch', 'event', 'event_change']);

/**
 * Decide what an arriving notification does while the app is open.
 *
 * Pure and total: an unknown type falls to the quiet end rather than throwing, because the
 * handler has THREE SECONDS to answer or expo-notifications discards the notification
 * entirely. Nothing here may fetch, wait, or fail.
 *
 * Activity (`prayer`, `testimony_glory`) and transactional confirmations (`moderation`,
 * `rsvp_reminder`, `registration`, `purchase`) deliberately get no banner: they are about
 * something the member just did or something their own screen already shows, and a banner
 * over the thing it is announcing is noise.
 */
export function foregroundBehaviour(type: string): ForegroundBehaviour {
  if (INTERRUPTS.has(type)) {
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  }

  if (ANNOUNCEMENTS.has(type)) {
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    };
  }

  return {
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  };
}
