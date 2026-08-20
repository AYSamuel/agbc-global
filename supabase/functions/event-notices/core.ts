// What an event notice says, with no network and no database in sight (docs/spec/11,
// docs/spec/15; W3.5 slice 4).
//
// Same split as every other job here: SQL decides WHO is owed a notice and under which key
// (`due_event_notices`, `event_notice_recipients`, asserted in pgTAP `046`), and this decides
// how it is said. The two halves meet on the dedupe key, which is minted in SQL precisely
// once and carried through untouched.

import type { NotificationEntry } from '../_shared/notify.ts';

/** The four things that can happen to an event's plan, per docs/spec/11. */
export type NoticeKind = 'posted' | 'cancelled' | 'moved' | 'reinstated';

/** A row of `due_event_notices`. */
export interface DueEventRow {
  event_id: string;
  kind: NoticeKind;
  dedupe_key: string;
  status: 'scheduled' | 'cancelled';
  /** NULL is ministry-wide, which changes both the audience and the tier it arrives on. */
  branch_id: string | null;
  title: string;
  starts_at_local: string;
  location: string;
  timezone: string;
}

/**
 * The catalogue keys, rendered per recipient language at send time and again in the centre.
 *
 * A posting has two, because a branch event and a ministry-wide one are not the same news:
 * one is "your branch has something on", the other is the whole family in one room, and
 * `11` gives the second its own treatment everywhere else in the app.
 */
export const NOTICE_TEMPLATES = {
  posted: 'event.posted',
  postedMinistry: 'event.posted_ministry',
  cancelled: 'event.cancelled',
  moved: 'event.moved',
  reinstated: 'event.reinstated',
} as const;

export function templateFor(row: DueEventRow): string {
  if (row.kind === 'posted') {
    return row.branch_id === null
      ? NOTICE_TEMPLATES.postedMinistry
      : NOTICE_TEMPLATES.posted;
  }
  return NOTICE_TEMPLATES[row.kind];
}

/**
 * Which tier it arrives on, and therefore what can suppress it.
 *
 * A POSTING IS NEWS AND A CHANGE IS AN ANSWER, which is the whole of this function. `15`
 * gates news on the member's own switch (`branch_updates`, or `ministry_announcements` for
 * a ministry-wide event: the types `branch`/`ministry`/`event` carry those gates), and
 * classes anything answering an action the member took as transactional and always on.
 * Nobody RSVPs to an event and then opts out of hearing it was cancelled.
 *
 * The gate itself is NOT applied here: `event_notice_recipients` applies it in SQL, on the
 * column `15` names, exactly as W3.4's reminder jobs do. This picks the Android channel.
 */
export function typeFor(row: DueEventRow): string {
  if (row.kind !== 'posted') return 'event_change';
  return row.branch_id === null ? 'ministry' : 'event';
}

/**
 * One entry per member who has not been told yet.
 *
 * PARAMS CARRY THE TITLE AND THE START, and nothing else. Both are things the church
 * published itself, so `15`'s payload rule holds: no member's name, nothing
 * special-category, nothing that would embarrass anyone off a lock screen. `when` is the
 * RAW wall clock, not a formatted date, because the words are chosen per recipient language
 * at render time and a pre-formatted string would freeze one language for everybody
 * (`pushTemplates.formatWhen`, and the same treatment in the app's notification centre).
 *
 * The deep link is the event's own route, which `15`'s table gives as EVENT-DETAIL and the
 * app's allowlist accepts as `/event/<id>`. `11` requires it to keep working after a
 * cancellation, which is why a published event is cancelled and never deleted.
 */
export function buildEntries(
  row: DueEventRow,
  profileIds: readonly string[],
): NotificationEntry[] {
  const template = templateFor(row);
  const type = typeFor(row);

  return profileIds.map((profileId) => ({
    profile_id: profileId,
    type,
    template_key: template,
    params: { event: row.title, when: row.starts_at_local },
    deep_link: `/event/${row.event_id}`,
    dedupe_key: row.dedupe_key,
  }));
}
