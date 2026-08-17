// The three things this app does with push at runtime (docs/spec/15, W3.3 slice 4).
//
//   1. Create the six Android channels, at first start, BEFORE anything is asked of the
//      member. Android 13+ will not show the permission prompt until a channel exists.
//   2. Register this device's token, but only once a member is signed in AND the OS has
//      already granted permission. The asking happens elsewhere, at a value moment (`06`).
//   3. Route a tapped notification, including one that launched the app from killed.
//
// ORDER MATTERS IN (1) AND (2) AND IS THE EASIEST THING HERE TO BREAK. Channels are not
// merely "setup": they are a precondition of the prompt. Registration is not merely
// "after sign-in": a token minted before the grant is a token for a device that will
// never be allowed to show anything.

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter, type Href } from 'expo-router';

import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';

import { ensureNotificationChannels } from './channels';
import {
  notificationsModule,
  type NotificationResponse,
} from './expoNotifications';
import { deepLinkFromData, notificationIdFromData } from './deepLinks';
import { usePendingDeepLinkStore } from './pendingDeepLink';
import { registerPushToken } from './token';

/** Broadcast categories, for the two broadcast-specific analytics events. */
const BROADCAST_TYPES = new Set(['ministry', 'branch']);

function typeFromData(data: unknown): string {
  if (typeof data !== 'object' || data === null) return 'unknown';
  const type = (data as Record<string, unknown>).type;
  return typeof type === 'string' ? type : 'unknown';
}

export function useNotifications(): void {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const status = useAuthStore((s) => s.status);

  // A cold-start response is delivered by BOTH getLastNotificationResponseAsync and, on
  // some platforms, the listener. Remembering what has been handled keeps one tap from
  // navigating twice.
  const handled = useRef(new Set<string>());

  // (1) Channels. Re-run on language change too: setNotificationChannelAsync updates a
  // channel's NAME and DESCRIPTION in place, so a member who switches to Deutsch sees
  // German channel names in Android settings. Importance is the one field the OS refuses
  // to change, which is why it is decided once (channels.ts).
  useEffect(() => {
    void ensureNotificationChannels(t);
  }, [t, i18n.language]);

  // (2) Registration. Runs when a member appears and on every start thereafter, which
  // also refreshes `last_seen_at` for the 180-day prune (`21` §5).
  useEffect(() => {
    if (status !== 'member') return;
    void registerPushToken();
  }, [status]);

  // (3) Routing.
  useEffect(() => {
    const Notifications = notificationsModule();
    if (!Notifications) return;

    const open = (response: NotificationResponse) => {
      const data = response.notification.request.content.data;
      const type = typeFromData(data);
      // The id doubles as the dedupe key. A notification without one still routes; it
      // just cannot be deduped against a second delivery of ITSELF, which is the right
      // trade for a payload shape we do not send.
      const id = notificationIdFromData(data);
      if (id !== null) {
        if (handled.current.has(id)) return;
        handled.current.add(id);
      }

      track('notification_opened', { type });
      if (BROADCAST_TYPES.has(type)) track('broadcast_opened');

      // The ONLY thing done with the payload: resolve a route and go there. No writes, no
      // parameters passed through, nothing else read (docs/spec/03 gate-return rule).
      const route = deepLinkFromData(data);

      // Until `app/index.tsx` has finished launch navigation, ANY push here is about to
      // be replaced by the entry route (seen on device 2026-08-16, twice: once from a
      // true cold start and once from a tap that FCM had already woken the process for).
      // Hand it to the entry router, which owns launch navigation order.
      const pending = usePendingDeepLinkStore.getState();
      if (!pending.entryDone) {
        pending.set(route);
        return;
      }

      // The cast is to expo-router's own `Href`, not to `any`: typed routes cannot
      // express a path resolved at runtime, and `deepLinkFromData` has already narrowed
      // the value to one of the allowlisted routes.
      router.push(route as Href);
    };

    // Cold start: the app was launched BY the tap, so no listener was mounted when it
    // happened (`15` names this API for exactly that).
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) open(response);
      })
      .catch(() => {
        // A cold-start lookup that fails leaves the member on Home, which is a correct
        // place to be. Never a crash on launch.
      });

    const tapped = Notifications.addNotificationResponseReceivedListener(
      (r) => {
        open(r);
      },
    );

    // Foreground arrivals: nothing is routed, but a broadcast landing while the app is
    // open is still a broadcast received.
    const received = Notifications.addNotificationReceivedListener(
      (notification) => {
        const type = typeFromData(notification.request.content.data);
        if (BROADCAST_TYPES.has(type)) track('broadcast_received');
      },
    );

    return () => {
      // Both are native subscriptions. Guarded for the same reason the audio player's
      // cleanup is (W3.1 slice 3): blur and unmount share one seam, and by unmount the
      // native object may already be gone.
      try {
        tapped.remove();
        received.remove();
      } catch {
        // Already released; nothing to do and nothing worth crashing a teardown over.
      }
    };
  }, [router]);
}
