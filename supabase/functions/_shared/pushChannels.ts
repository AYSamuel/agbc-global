// Which Android channel a notification lands in, and which preference gates it
// (docs/spec/15, and the W3.3 slice 1 decision taken with Ayo on 2026-08-15).
//
// SIX channels: five map 1:1 to a pref key, plus `transactional`, which has no pref key
// because those notifications answer an action the member took.
//
// THIS FILE IS HALF OF A PAIR. The app creates the channels (W3.3 slice 4,
// apps/mobile/src/features/notifications/channels.ts) and the server names them here.
// They cannot import each other: the app is TypeScript in the pnpm workspace and this is
// Deno with its own import map (supabase/functions/deno.json), and nothing in the repo
// bridges the two. So the channel IDS ARE DUPLICATED BY NECESSITY, and the risk is drift:
// a channel named here that the app never created means Android silently drops the
// notification into no channel at all on API 26+. The guard is a test on each side
// asserting the same six literals, and this comment naming the other half.
//
// IMPORTANCE IS THE APP'S, NOT OURS. A channel's importance is fixed at creation and the
// OS remembers it even across deletion, so it is set once by the app (decision: only
// service reminders interrupt). The server chooses only WHICH channel.

/** The six channel ids. Immutable once shipped: Android keys user settings off these. */
export const CHANNELS = {
  ministry: 'ministry',
  branch: 'branch',
  serviceReminders: 'service_reminders',
  prayer: 'prayer',
  testimony: 'testimony',
  transactional: 'transactional',
} as const;

export type ChannelId = (typeof CHANNELS)[keyof typeof CHANNELS];

/** Columns on `notification_prefs`. `null` = always-on, no pref gate (docs/spec/15). */
export type PrefKey =
  | 'ministry_announcements'
  | 'branch_updates'
  | 'service_reminders'
  | 'prayer_activity'
  | 'testimony_activity';

interface Routing {
  channel: ChannelId;
  /** null when the notification is transactional and cannot be switched off. */
  pref: PrefKey | null;
}

/**
 * `notifications.type` -> where it goes and what can suppress it.
 *
 * The keys here are exactly the CHECK constraint's values in `20260816120000`. A type
 * added there without a row here would send with no channel, so the test asserts both
 * lists match.
 */
export const ROUTING: Record<string, Routing> = {
  // Pref-gated.
  ministry: { channel: CHANNELS.ministry, pref: 'ministry_announcements' },
  branch: { channel: CHANNELS.branch, pref: 'branch_updates' },
  service_reminder: {
    channel: CHANNELS.serviceReminders,
    pref: 'service_reminders',
  },
  // `prayer` covers both "someone prayed with you" and the commitment reminders. One
  // control writes both `prayer_activity` and `prayer_reminders` (W3.3 slice 1 decision 2,
  // matching what the NOTIF-PREFS frame's caption already said), so the gate reads the
  // activity column and the two move together.
  prayer: { channel: CHANNELS.prayer, pref: 'prayer_activity' },
  testimony_glory: { channel: CHANNELS.testimony, pref: 'testimony_activity' },
  event: { channel: CHANNELS.branch, pref: 'branch_updates' },

  // Always-on: these answer something the member did (docs/spec/15).
  moderation: { channel: CHANNELS.transactional, pref: null },
  rsvp_reminder: { channel: CHANNELS.transactional, pref: null },
  // The plan an RSVP was made against changed: cancelled, moved, or back on (W3.5 slice 4).
  // Transactional rather than `event`, and the distinction is the whole reason it is its own
  // type: `event` is gated on `branch_updates`, and a member who turned branch news off
  // would turn up at a locked door. Nobody RSVPs and then opts out of hearing it is off.
  event_change: { channel: CHANNELS.transactional, pref: null },
  registration: { channel: CHANNELS.transactional, pref: null },
  purchase: { channel: CHANNELS.transactional, pref: null },
};

/**
 * Unknown types route to `transactional` rather than throwing.
 *
 * Deliberate: the database CHECK already refuses an unknown type at write time, so
 * reaching this branch means the two lists have drifted. Dropping the notification would
 * hide the drift; delivering it on the always-on channel surfaces it while still reaching
 * the member. The warning is what the fix hangs off.
 */
export function routeFor(type: string): Routing {
  const routing = ROUTING[type];
  if (routing) return routing;
  console.warn(`pushChannels: unrouted notification type "${type}"`);
  return { channel: CHANNELS.transactional, pref: null };
}

/**
 * Does this member want it?
 *
 * `02`: an ABSENT prefs row means the column defaults, which are all true, so absent is
 * treated as "yes" rather than "no". A member who has never opened settings should still
 * hear that someone prayed with them.
 */
export function allowedByPrefs(
  type: string,
  prefs: Partial<Record<PrefKey, boolean>> | null | undefined,
): boolean {
  const { pref } = routeFor(type);
  if (pref === null) return true;
  if (!prefs) return true;
  return prefs[pref] !== false;
}
