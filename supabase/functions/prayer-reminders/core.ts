// What the prayer job turns a due commitment into (docs/spec/09 §Prayer commitment, `15`;
// W3.4 slice 2).
//
// Every stop condition and the whole cadence live in SQL (20260819140000), which is where
// they can be tested against a fake clock. What is left here is the shape of the nudge, and
// it is the most privacy-sensitive payload in the app: a prayer request is special-category
// data, and this notification is about one.

import type { NotificationEntry } from '../_shared/notify.ts';

/** A row of `prayer_reminder_batch`. */
export interface PrayerDueRow {
  intercession_id: string;
  profile_id: string;
  prayer_id: string;
  dedupe_key: string;
}

/** The catalogue key: "You said you'd pray for a request / Take a moment now". */
export const PRAYER_TEMPLATE = 'prayer.reminder';

/**
 * One entry per due commitment.
 *
 * NO PARAMS AT ALL, and that is the design rather than an omission. The template is
 * deliberately written to need none: not the request, not a word of it, not the author's
 * name, not even how many days ago the promise was made. `15`'s payload rule says a push
 * body is read off a lock screen by whoever is holding the phone and crosses Expo, then
 * APNs or FCM, then the OS; `20` says this class of content never travels. The member taps,
 * signs in if they must, and reads the request in the app.
 *
 * The deep link is the request itself (`15`'s table: PRAYER-DETAIL), which is also where the
 * "I prayed" tap lives, so the nudge lands exactly where it can be answered and stopped.
 */
export function buildEntries(rows: readonly PrayerDueRow[]): NotificationEntry[] {
  return rows.map((row) => ({
    profile_id: row.profile_id,
    type: 'prayer',
    template_key: PRAYER_TEMPLATE,
    params: {},
    deep_link: `/prayer/${row.prayer_id}`,
    dedupe_key: row.dedupe_key,
  }));
}

/**
 * The ids to advance: EVERY commitment in the batch, not only the ones that produced a new
 * notification.
 *
 * A run that dies between the write and the advance would otherwise sit on the same rung
 * forever, because the second run's dedupe key is already claimed and would create nothing.
 * Advancing the whole batch converges; the dedupe key is what stops the repeat becoming a
 * second nudge.
 */
export function advancingIds(rows: readonly PrayerDueRow[]): string[] {
  return rows.map((row) => row.intercession_id);
}
