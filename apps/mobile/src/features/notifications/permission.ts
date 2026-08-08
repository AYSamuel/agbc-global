// The OS notification permission, behind one door.
//
// `expo-notifications` is a NATIVE module added at W2.8 slice 4, so any dev
// client built before that build does not contain it and importing it at the top
// of a file would crash the route rather than degrade it. Loaded through the
// same guarded require `features/give/CopyRow` uses for the clipboard: the app
// keeps working, the ask simply reports itself unavailable, and the next EAS
// build makes it real.
//
// This file deliberately stops at the permission. Token registration, the six
// Android channels and the preference toggles are W3.3's (`15`, `25` W3.3); what
// W2.8 owns is the in-context MOMENT, because that moment is a check-in and
// check-ins live here.

interface PermissionAnswer {
  status: string;
  canAskAgain?: boolean;
}

interface NotificationsModule {
  getPermissionsAsync: () => Promise<PermissionAnswer>;
  requestPermissionsAsync: () => Promise<PermissionAnswer>;
}

function load(): NotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

const Notifications = load();

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

export function notificationsAvailable(): boolean {
  return Notifications !== null;
}

/** What the OS says today, without asking the member anything. */
export async function permissionState(): Promise<PermissionState> {
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
  if (Notifications === null) return 'unavailable';
  try {
    return toState(await Notifications.requestPermissionsAsync());
  } catch {
    return 'unavailable';
  }
}
