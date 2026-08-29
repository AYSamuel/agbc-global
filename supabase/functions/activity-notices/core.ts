// What the activity job turns a due row into (docs/spec/09 §Notifications, `15`; W3.6
// slice 2).
//
// Same split as every other job here: the hard part (who is owed it, which prefs apply,
// which blocks suppress it, how a burst of Glory collapses) is SQL and is asserted in
// pgTAP `051`. What is left is the shape of the notification, and one decision per arm
// about which words to use.
//
// THE PAYLOAD RULE IS AT ITS TIGHTEST HERE. These three notifications are about a
// member's own testimony or prayer request, which is exactly the special-category
// content `15` and `20` forbid on a lock screen. So:
//   * `prayed` carries NO params at all. Not the request, not a word of it, not who
//     prayed. "Someone prayed with you" and a link, nothing else. Same treatment the
//     prayer nudge already gets.
//   * `glory` carries a COUNT and nothing more. A number is not content.
//   * `moderation` carries nothing. The status picks the template; the reason, where
//     there is one the author may see, is read in the app after auth.

import type { NotificationEntry } from '../_shared/notify.ts';

/** A row of `activity_notice_batch`. */
export interface ActivityDueRow {
  kind: string;
  recipient_id: string;
  subject_id: string;
  subject_kind: string | null;
  detail: string | null;
  tally: number | null;
  dedupe_key: string;
}

/**
 * The catalogue keys this job can send, all of them already in `_shared/pushTemplates.ts`
 * and in the app's `notifications.json`, in four languages.
 *
 * `moderation.removed` is the one added in this slice, and it is added rather than reusing
 * `moderation.changes_needed` on purpose. `MyPostCard.tsx` states the product rule in a
 * comment: "rejected is a conversation the author can answer (edit and resubmit), removed
 * is not". Telling a member whose post was taken down after review to go and edit it would
 * send them to do the one thing that must not happen.
 */
export const TEMPLATES = {
  prayed: 'prayer.someone_prayed',
  glory: 'testimony.glory_batch',
  approved: 'moderation.approved',
  rejected: 'moderation.changes_needed',
  removed: 'moderation.removed',
} as const;

/**
 * Where a tap lands.
 *
 * The two activity kinds open the post itself, which is what `15`'s deep-link table gives
 * ("a 'someone prayed for you' opens PRAYER-DETAIL"). Every moderation decision opens
 * MY-POSTS instead, per `09` line 69, because that is the screen that can render all three
 * outcomes: the approved post live, the rejected one with its reason and an edit action,
 * and the removed one with the line pointing at the branch leader. A removed post's own
 * route would only be able to say it is gone.
 *
 * Every value here is on the app's allowlist in `features/notifications/deepLinks.ts`; a
 * path that is not would open the notification centre instead, which would be a silent
 * downgrade rather than a crash.
 */
export const MY_POSTS_DEEP_LINK = '/my-posts';

/** The notification type, which is the routing key that picks the Android channel. */
function typeFor(row: ActivityDueRow): string {
  if (row.kind === 'glory') return 'testimony_glory';
  if (row.kind === 'moderation') return 'moderation';
  // Both "someone prayed with you" and the commitment nudges ride the `prayer` channel.
  return 'prayer';
}

function templateFor(row: ActivityDueRow): string | null {
  if (row.kind === 'prayed') return TEMPLATES.prayed;
  if (row.kind === 'glory') return TEMPLATES.glory;
  if (row.kind === 'moderation') {
    switch (row.detail) {
      case 'approved':
        return TEMPLATES.approved;
      case 'rejected':
        return TEMPLATES.rejected;
      case 'removed':
        return TEMPLATES.removed;
      default:
        return null;
    }
  }
  return null;
}

function deepLinkFor(row: ActivityDueRow): string {
  if (row.kind === 'moderation') return MY_POSTS_DEEP_LINK;
  if (row.kind === 'glory') return `/testimony/${row.subject_id}`;
  return `/prayer/${row.subject_id}`;
}

/**
 * One entry per due row.
 *
 * A row whose kind or status this build does not know is DROPPED rather than sent on a
 * guess. It is the mirror of `routeFor`'s choice to deliver an unknown type on the
 * always-on channel, and the reason differs because the stakes do: an unrouted type still
 * has real words to show, whereas a template we cannot name would reach the member as the
 * generic fallback line about their own testimony, which is worse than silence. The
 * warning is what the fix hangs off, and the batch function's own status filter means
 * reaching this branch requires the two lists to have drifted.
 */
export function buildEntries(rows: readonly ActivityDueRow[]): NotificationEntry[] {
  const entries: NotificationEntry[] = [];

  for (const row of rows) {
    const template = templateFor(row);
    if (template === null) {
      console.warn(
        `activity-notices: no template for kind "${row.kind}" detail "${row.detail}"`,
      );
      continue;
    }

    entries.push({
      profile_id: row.recipient_id,
      type: typeFor(row),
      template_key: template,
      // A count, or nothing at all. See the payload note at the top of this file.
      params: row.kind === 'glory' ? { count: row.tally ?? 0 } : {},
      deep_link: deepLinkFor(row),
      dedupe_key: row.dedupe_key,
    });
  }

  return entries;
}
