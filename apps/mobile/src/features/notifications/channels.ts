// The six Android notification channels (docs/spec/15).
//
// ORDERING IS THE POINT. Android 13+ will not show the notification permission prompt
// until a channel exists, so all six are created at FIRST APP START, before anything asks
// the member for anything. `15` states the rule and this is the only place that obeys it;
// if channel creation ever moves after the ask, the prompt silently stops appearing.
//
// IMPORTANCE IS ONE-SHOT. Android fixes a channel's importance at creation and remembers
// it even if the channel is deleted and recreated, so this list is effectively immutable.
// Decided with Ayo on 2026-08-15: only service reminders interrupt (heads-up + sound),
// because a service reminder seen late is a reminder that failed. Everything else makes a
// sound and waits in the shade. The member can override any of it in Android's own
// settings, which is the point of having six channels rather than one.
//
// NAMES ARE NOT ONE-SHOT, and that is useful. `setNotificationChannelAsync` updates a
// channel's name and description in place, so re-running this on every start (and after a
// language change) relocalises what the member sees in system settings. Importance is the
// only field the OS refuses to change.
//
// THE IDS ARE DUPLICATED, deliberately and unavoidably: the server names the same six in
// `supabase/functions/_shared/pushChannels.ts` and the two cannot import each other (pnpm
// workspace vs Deno import map). A channel the server names and the app never created is
// dropped SILENTLY by Android on API 26+, so both sides assert the same literals in tests.

import type { TFunction } from 'i18next';
import { Platform } from 'react-native';

import { notificationsModule } from './expoNotifications';

/** Must match `ROUTING`'s channel values in `_shared/pushChannels.ts`. */
export const CHANNEL_IDS = {
  ministry: 'ministry',
  branch: 'branch',
  serviceReminders: 'service_reminders',
  prayer: 'prayer',
  testimony: 'testimony',
  transactional: 'transactional',
} as const;

export type ChannelId = (typeof CHANNEL_IDS)[keyof typeof CHANNEL_IDS];

/** `true` = heads-up over whatever the member is doing. Exactly one channel gets it. */
interface ChannelSpec {
  id: ChannelId;
  /** Key under the `notifications:channels` namespace. */
  key: string;
  interrupts: boolean;
}

export const CHANNEL_SPECS: readonly ChannelSpec[] = [
  { id: CHANNEL_IDS.ministry, key: 'ministry', interrupts: false },
  { id: CHANNEL_IDS.branch, key: 'branch', interrupts: false },
  // The one that interrupts: useless if seen after the service started.
  {
    id: CHANNEL_IDS.serviceReminders,
    key: 'serviceReminders',
    interrupts: true,
  },
  { id: CHANNEL_IDS.prayer, key: 'prayer', interrupts: false },
  { id: CHANNEL_IDS.testimony, key: 'testimony', interrupts: false },
  { id: CHANNEL_IDS.transactional, key: 'transactional', interrupts: false },
];

/**
 * Create (or relocalise) all six channels.
 *
 * Android only: iOS has no channel concept and the call would be a no-op at best.
 * Never throws. A failure here must not stop the app launching, and the consequence of
 * failing is that notifications arrive on Android's own fallback channel rather than not
 * at all.
 */
export async function ensureNotificationChannels(
  t: TFunction,
): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const Notifications = notificationsModule();
  if (!Notifications) return false;

  const { HIGH, DEFAULT } = Notifications.AndroidImportance;

  try {
    await Promise.all(
      CHANNEL_SPECS.map((spec) =>
        Notifications.setNotificationChannelAsync(spec.id, {
          name: t(`notifications:channels.${spec.key}.name`),
          description: t(`notifications:channels.${spec.key}.description`),
          importance: spec.interrupts ? HIGH : DEFAULT,
        }),
      ),
    );
    return true;
  } catch (error) {
    // Logged, never thrown: see the doc comment.
    console.warn(
      'notifications: channel setup failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return false;
  }
}
