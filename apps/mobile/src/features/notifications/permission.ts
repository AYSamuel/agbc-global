// The OS notification permission, behind one door.
//
// The guarded require that makes this safe on an older dev client now lives in
// `expoNotifications.ts`, shared with channel creation and token registration
// (W3.3 slice 4); it was duplicated here first because this was the only caller.
//
// This file deliberately stops at the permission. Token registration, the six
// Android channels and the preference toggles are elsewhere; what it owns is the
// in-context MOMENT, because that moment is a check-in and check-ins live here.

import {
  notificationsModule,
  type PermissionAnswer,
} from './expoNotifications';

/**
 * `unavailable` is the dev-client case above, and it is deliberately NOT the
 * same as `denied`: nobody has refused anything, so nothing should be recorded
 * as refused.
 */
export type PermissionState =
  'granted' | 'denied' | 'undetermined' | 'unavailable';

function toState(answer: PermissionAnswer): PermissionState {
  if (answer.status === 'granted') return 'granted';
  // iOS reports `undetermined` until asked; Android reports `denied` with
  // `canAskAgain` false once the OS will no longer show the dialog.
  if (answer.status === 'undetermined') return 'undetermined';
  return answer.canAskAgain === true ? 'undetermined' : 'denied';
}

/** What the OS says today, without asking the member anything. */
export async function permissionState(): Promise<PermissionState> {
  const Notifications = notificationsModule();
  if (Notifications === null) return 'unavailable';
  try {
    return toState(await Notifications.getPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}

/**
 * The OS dialog itself. Called ONLY after the pre-permission sheet has explained
 * why (`06`: the prompt is one-shot on iOS, never waste it).
 */
export async function requestPermission(): Promise<PermissionState> {
  const Notifications = notificationsModule();
  if (Notifications === null) return 'unavailable';
  try {
    return toState(await Notifications.requestPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}
