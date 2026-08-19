// What the service-reminder job turns a due row into, with no network and no database in
// sight (docs/spec/15; W3.4 slice 1).
//
// Same split as verse-monitor and push-receipts: `index.ts` does the lease, the reads, the
// writes and the ping; the JUDGEMENT lives here. There is less judgement in this job than
// in those, because the hard part (which occurrence, in which zone, for whom) is SQL and is
// asserted in pgTAP `040`. What is left is the shape of the notification, and that is worth
// testing on its own because it is where `15`'s payload rules land.

import type { NotificationEntry } from '../_shared/notify.ts';

/** A row of `service_reminder_batch`. */
export interface ServiceDueRow {
  profile_id: string;
  branch_id: string;
  branch_name: string;
  service_date: string;
  start_time: string;
  dedupe_key: string;
}

/** Where a tapped service reminder lands (docs/spec/15's deep-link table: HOME). */
export const SERVICE_DEEP_LINK = '/home';

/** The catalogue key, rendered per recipient language at send time. */
export const SERVICE_TEMPLATE = 'service.starts_soon';

/**
 * One entry per due member.
 *
 * The only param is the BRANCH NAME, which the church publishes itself, so nothing
 * special-category crosses Expo, APNs/FCM and a lock screen (`15`'s payload-privacy rule).
 * The date and time are already inside `dedupe_key` and stay out of the words: the title
 * says "starts in 1 hour" and a member reading it an hour before does not need the clock.
 *
 * The dedupe key comes from SQL rather than being rebuilt here, on purpose. It is the
 * no-double-send guarantee, so it has exactly one author, and that author is the same
 * function that decided the occurrence was due.
 */
export function buildEntries(
  rows: readonly ServiceDueRow[],
): NotificationEntry[] {
  return rows.map((row) => ({
    profile_id: row.profile_id,
    type: 'service_reminder',
    template_key: SERVICE_TEMPLATE,
    params: { branch: row.branch_name },
    deep_link: SERVICE_DEEP_LINK,
    dedupe_key: row.dedupe_key,
  }));
}
