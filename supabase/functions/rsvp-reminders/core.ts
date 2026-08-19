// What the RSVP job turns a due row into (docs/spec/11, `15`; W3.4 slice 2).
//
// Same split as service-reminders: the hard part (which event, in which zone, whose RSVP)
// is SQL and is asserted in pgTAP `041`; what is left is the shape of the notification.

import type { NotificationEntry } from '../_shared/notify.ts';

/** A row of `rsvp_reminder_batch`. */
export interface RsvpDueRow {
  profile_id: string;
  event_id: string;
  event_title: string;
  starts_at_local: string;
  dedupe_key: string;
}

/** The catalogue key, rendered per recipient language at send time. */
export const RSVP_TEMPLATE = 'rsvp.reminder';

/**
 * One entry per member going.
 *
 * The only param is the event TITLE, which the church published itself, so nothing
 * special-category crosses a lock screen (`15`'s payload rule). The deep link is the
 * event's own route, which `15`'s deep-link table gives as EVENT-DETAIL and the app's
 * allowlist accepts as `/event/<id>`.
 */
export function buildEntries(rows: readonly RsvpDueRow[]): NotificationEntry[] {
  return rows.map((row) => ({
    profile_id: row.profile_id,
    // Transactional (docs/spec/15): it answers an RSVP the member made, so there is no
    // pref key and no pref gate anywhere in this job.
    type: 'rsvp_reminder',
    template_key: RSVP_TEMPLATE,
    params: { event: row.event_title },
    deep_link: `/event/${row.event_id}`,
    dedupe_key: row.dedupe_key,
  }));
}
