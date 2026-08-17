// `expo-notifications`, behind one guarded require.
//
// WHY GUARDED AT ALL. The dev clients on the physical devices contain only the native
// modules linked at their last EAS build (CLAUDE.md, the dev-client native fence). A
// top-level `import` of a module a client does not carry crashes the ROUTE rather than
// degrading it, which is how `expo-clipboard` took down GIVE-BANK at W1.6. The current
// client (built 2026-08-14, W3.1 slice 2) does carry it: `dumpsys package` shows
// POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED and VIBRATE in the installed manifest, which
// are expo-notifications' own additions. The guard stays anyway, because it also covers
// Jest (where the native module is absent unless a test mocks it) and any older client
// still installed somewhere.
//
// WHY ONE FILE. `permission.ts` had its own copy of this require; channels and token
// registration would have made three. One loader, one place to widen the interface, and
// one answer to "is this build able to do notifications at all".

/** Only what this app calls. Widened deliberately, never with `any`. */
export interface NotificationsModule {
  getPermissionsAsync: () => Promise<PermissionAnswer>;
  requestPermissionsAsync: () => Promise<PermissionAnswer>;
  getExpoPushTokenAsync: (options: {
    projectId: string;
  }) => Promise<{ data: string }>;
  setNotificationChannelAsync: (
    channelId: string,
    channel: AndroidChannel,
  ) => Promise<unknown>;
  getLastNotificationResponseAsync: () => Promise<NotificationResponse | null>;
  addNotificationResponseReceivedListener: (
    listener: (response: NotificationResponse) => void,
  ) => { remove: () => void };
  addNotificationReceivedListener: (
    listener: (notification: ReceivedNotification) => void,
  ) => { remove: () => void };
  setNotificationHandler: (handler: unknown) => void;
  AndroidImportance: { HIGH: number; DEFAULT: number; LOW: number };
}

export interface PermissionAnswer {
  status: string;
  canAskAgain?: boolean;
}

export interface AndroidChannel {
  name: string;
  importance: number;
  description?: string;
  sound?: string | null;
  vibrationPattern?: number[] | null;
  enableVibrate?: boolean;
  showBadge?: boolean;
}

/** The shape the app reads off a tapped notification. Everything else is ignored. */
export interface NotificationResponse {
  notification: ReceivedNotification;
}

export interface ReceivedNotification {
  request: {
    content: {
      data?: Record<string, unknown> | null;
      title?: string | null;
      body?: string | null;
    };
  };
}

/**
 * LAZY, and that is not a micro-optimisation.
 *
 * `require('expo-notifications')` HAS IMPORT-TIME SIDE EFFECTS: its
 * `DevicePushTokenAutoRegistration.fx` module runs on import and registers a device
 * push-token listener. Loading at module scope meant that merely importing this file
 * started that machinery, and because `state/auth.ts` imports token registration, the
 * whole notification stack was being pulled into anything that touched the auth store.
 * That reached `lib/analytics`, whose tests then failed on the timing (found 2026-08-16,
 * five red tests that had nothing to do with notifications).
 *
 * Loading on first USE keeps the side effects where they belong: in the app that asked
 * for notifications, not in every importer of the auth store.
 */
let cached: NotificationsModule | null | undefined;

/**
 * Null when this build cannot do notifications at all.
 *
 * Callers branch on this rather than throwing: a member on an old dev client should find
 * the app working and the notification features quietly absent, not a red screen.
 */
export function notificationsModule(): NotificationsModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-notifications') as NotificationsModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

export function notificationsAvailable(): boolean {
  return notificationsModule() !== null;
}

/** Tests only: forget the cached module so a fresh mock can be installed. */
export function resetNotificationsModuleForTests(): void {
  cached = undefined;
}
