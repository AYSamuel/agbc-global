// The OS notification permission, behind one door.
//
// The guarded require that makes this safe on an older dev client now lives in
// `expoNotifications.ts`, shared with channel creation and token registration
// (W3.3 slice 4); it was duplicated here first because this was the only caller.
//
// This file deliberately stops at the permission, with one exception it earned:
// a GRANT registers the token, because the runtime only fetches one when a member
// appears and by then the member is long since here (see `requestPermission`).
// The six Android channels and the preference toggles remain elsewhere.

import {
  notificationsModule,
  type PermissionAnswer,
} from './expoNotifications';
import { registerPushToken } from './token';

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
 *
 * A GRANT REGISTERS THE TOKEN HERE, and that is not a convenience. The push
 * runtime fetches the token when a MEMBER APPEARS (`useNotifications` effect 2),
 * which for everyone asked after sign-in has already happened by the time they
 * say yes: permission was granted, nothing was registered, and no push could
 * arrive until the next cold start. Found with Ayo on the device, 2026-09-07, at
 * the end of the same chain that left him unasked in the first place.
 *
 * In here rather than at the two call sites because there will be a third (iOS
 * provisional authorisation, `15`), and a step you have to remember is a step
 * that gets forgotten.
 */
export async function requestPermission(): Promise<PermissionState> {
  const Notifications = notificationsModule();
  if (Notifications === null) return 'unavailable';
  try {
    const state = toState(await Notifications.requestPermissionsAsync());
    if (state === 'granted') await registerPushToken();
    return state;
  } catch {
    return 'unavailable';
  }
}
