// Registering this device to receive push, and letting it go on sign-out (docs/spec/15,
// `02` §devices).
//
// THREE RULES, all from the spec and all easy to get subtly wrong:
//
//   1. NEVER FOR A GUEST. `02` and `06` settle it: v1 push is member-oriented and a token
//      is registered on or after sign-in only. A guest browsing the app leaves no device
//      row behind.
//   2. AFTER THE GRANT, NEVER BEFORE. This module does not ask for permission; it reads
//      what the OS already decided. The asking is `NotificationAsk`'s, at a value moment,
//      because iOS shows its dialog once per install (`06`).
//   3. SIGN-OUT DELETES THIS DEVICE'S ROW, not the member's other devices. Deleting by
//      `profile_id` would silently unsubscribe their other phone, so the row is found by
//      THIS device's token, which is why the token is remembered locally.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { notificationsModule } from './expoNotifications';

/** Where the last registered token is kept so sign-out can delete the right row. */
const TOKEN_KEY = 'agbc-push-token';

export type RegistrationResult =
  | 'registered'
  | 'unavailable'
  | 'not-signed-in'
  | 'not-granted'
  | 'no-project'
  | 'error';

function platform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * The EAS project id, which `getExpoPushTokenAsync` needs to mint a token bound to THIS
 * project. Read from the app config rather than hardcoded: it is the same frozen id in
 * `app.config.js` (docs/spec/19), and a mismatch would produce tokens the push service
 * cannot route.
 */
function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as
    { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

/**
 * Register this device, if everything is in place. Safe to call on every start.
 *
 * Returns WHY it did nothing rather than a bare boolean, because the caller (and the
 * device test) needs to tell "this build has no native module" from "the member said no".
 * Never throws: a push registration failure must not break a launch.
 */
export async function registerPushToken(): Promise<RegistrationResult> {
  const Notifications = notificationsModule();
  if (!Notifications) return 'unavailable';

  const id = projectId();
  if (!id) return 'no-project';

  try {
    // Rule 1, read from the SESSION rather than a store snapshot: the row's owner has to
    // be `auth.uid()` for the INSERT policy to accept it, so the session is the only
    // source that cannot disagree with the database.
    const { data: session } = await supabase.auth.getSession();
    const profileId = session.session?.user.id ?? null;
    if (!profileId) return 'not-signed-in';

    // Rule 2: read, never request.
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') return 'not-granted';

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: id,
    });

    // `expo_push_token` is unique (`02`), so this converges whether the row is new, the
    // same device signing in again, or a token that moved to another account. Upserting
    // on the token rather than inserting is what makes "same phone, second member" work:
    // the row's owner is rewritten instead of colliding.
    const { error } = await supabase.from('devices').upsert(
      {
        profile_id: profileId,
        expo_push_token: token,
        platform: platform(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'expo_push_token' },
    );
    if (error) throw new Error(error.message);

    await AsyncStorage.setItem(TOKEN_KEY, token);
    return 'registered';
  } catch (error) {
    // Never rethrown: see the doc comment. No token in the log (docs/spec/20: a push
    // token is a device identifier).
    console.warn(
      'notifications: token registration failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return 'error';
  }
}

/**
 * Drop this device's row.
 *
 * MUST RUN BEFORE `supabase.auth.signOut()`. The DELETE policy on `devices` is
 * `profile_id = auth.uid()`, so after the session is gone the delete matches nothing and
 * the row survives: the phone would keep receiving a stranger's notifications until the
 * receipts sweep or the 180-day prune happened to remove it. `state/auth.ts` calls this
 * first, deliberately.
 *
 * Never throws: failing to sign out because a delete failed would be a worse bug than a
 * stale device row, which the 180-day prune eventually collects anyway (`21` §5).
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;

    // By TOKEN, not by profile: rule 3. The member's other phone keeps its registration.
    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('expo_push_token', token);
    if (error) throw new Error(error.message);

    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.warn(
      'notifications: token removal failed',
      error instanceof Error ? error.message : 'unknown',
    );
  }
}

/** Exposed for the device check and tests; never for display. */
export async function currentPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
