// `expo-in-app-updates`, behind one guarded require (W4.10 slice 1).
//
// WHY GUARDED. Same reason as `features/notifications/expoNotifications.ts`: the dev
// clients on the physical devices carry only the native modules linked at their last EAS
// build, and a top-level `import` of one they do not have crashes the ROUTE rather than
// degrading it (CLAUDE.md, the dev-client native fence). This module is brand new, so NO
// client in existence carries it: every dev client, and the versionCode 22 binary in
// review, will take the null branch until the next EAS build. The guard also covers Jest,
// where `requireNativeModule('ExpoInAppUpdates')` throws.
//
// WHAT EACH PLATFORM ACTUALLY DOES, because "in-app updates" means two different things:
//
// - **Android** is the real thing: Play's own in-app updates library. A FLEXIBLE update
//   downloads in the background while the member carries on, and the module's own install
//   listener calls `completeUpdate()` the moment the download lands, which is what
//   restarts the app into the new version. That is the flow Ayo asked for.
// - **iOS** has no install API at all, so the package uses the iTunes Search API to learn
//   the App Store's version and `SKStoreProductViewController` to open the listing in a
//   modal. Same sheet, same words, a different ending, and that ceiling is Apple's rather
//   than ours.
//
// IOS IS INERT UNTIL THE APP STORE ID IS KNOWN, deliberately and safely. The native check
// reads `AppStoreID` out of the Info.plist; the app has never had it (the numeric id lives
// only in App Store Connect, see the TODO in `lib/links.ts`), so the lookup runs with an
// empty id, matches nothing, and RESOLVES `updateAvailable: false`. No crash, no notice,
// no false promise. Add `ios.infoPlist.AppStoreID` in `app.config.js` when the id is in
// hand and this starts working with no code change.

/** Only the two calls this app makes. Widened deliberately, never with `any`. */
export interface InAppUpdatesModule {
  checkForUpdate: () => Promise<UpdateCheck>;
  startUpdate: (isImmediate?: boolean) => Promise<boolean>;
}

export interface UpdateCheck {
  /** A newer build exists in the store this device installed from. */
  updateAvailable: boolean;
  /** Android: a flexible download is already running from an earlier tap. */
  updateInProgress?: boolean;
  /**
   * Android: the store's `versionCode`, as a string. iOS: the store's version
   * STRING. The two are not the same kind of number, which is why nothing here
   * compares them: this slice only needs to know that something newer exists.
   * "Two releases behind" needs a unit both platforms share and is slice 2's.
   */
  storeVersion: string;
  /** Android only. */
  flexibleAllowed?: boolean;
  /** Android only. */
  immediateAllowed?: boolean;
  /**
   * Android only: Play's `clientVersionStalenessDays`, the number of days since the
   * Play Store app ON THIS DEVICE learnt that a newer version existed. Null whenever
   * Play has no staleness information, which is a "do not escalate", never a zero.
   */
  daysSinceRelease?: number | null;
  /**
   * Android only: what Play itself suggests, derived from the update priority set on
   * the release. IMMEDIATE means priority 4 or higher.
   */
  serverUpdateType?: 'FLEXIBLE' | 'IMMEDIATE';
}

let cached: InAppUpdatesModule | null | undefined;

/**
 * Null when this build cannot do in-app updates at all.
 *
 * Callers branch on it rather than throwing: a member on a client without the native
 * module should find the app working and this feature quietly absent.
 */
export function inAppUpdatesModule(): InAppUpdatesModule | null {
  if (cached === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-in-app-updates') as InAppUpdatesModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

/**
 * What the store has, or null if the question could not be asked.
 *
 * NULL AND "NOTHING NEW" ARE THE SAME OUTCOME HERE and are deliberately not
 * distinguished by callers: Play rejects when the device has no Play Store, when the app
 * was sideloaded, and when there is simply no network, and none of those is worth a word
 * on screen. An update notice is the least urgent thing this app says.
 */
export async function checkForUpdate(): Promise<UpdateCheck | null> {
  const module = inAppUpdatesModule();
  if (module === null) return null;
  try {
    return await module.checkForUpdate();
  } catch {
    return null;
  }
}

/**
 * Hand over to the platform. `isImmediate` is Android's choice of flow and is ignored on
 * iOS, which only ever opens the App Store.
 *
 * @returns whether the platform actually took over. False means the member is still
 *   looking at our sheet, so the caller must not pretend anything is happening.
 */
export async function startUpdate(isImmediate: boolean): Promise<boolean> {
  const module = inAppUpdatesModule();
  if (module === null) return false;
  try {
    return await module.startUpdate(isImmediate);
  } catch {
    return false;
  }
}

/** Tests only: forget the cached module so a fresh mock can be installed. */
export function resetInAppUpdatesModuleForTests(): void {
  cached = undefined;
}
