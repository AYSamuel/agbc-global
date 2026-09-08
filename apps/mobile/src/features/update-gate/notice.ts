import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UpdateCheck } from './inAppUpdates';

// When the app may mention that a newer version exists, and when it stops asking
// and simply updates (W4.10 slices 1 and 2).
//
// AT MOST ONCE A DAY (Ayo, 2026-09-08), and the sheet's own footnote says so out loud, so
// "Not now" is a promise rather than a brush-off. Only ONE fact is persisted: the local
// date the notice was last put in front of the member. `available` is a fact about right
// now and is deliberately not restored, exactly as `notifications/ask.ts` keeps `asked`
// and drops `pending`: a member who backgrounds the app mid-sheet is not met by it again
// on the next launch out of nowhere.
//
// THE DAY IS BURNT WHEN THE NOTICE IS ANSWERED, not when the check runs, and the
// difference matters in both directions. A check that finds nothing must NOT burn the
// day, or a version published at lunchtime would go unmentioned until tomorrow for
// everyone who opened the app that morning. And every way out of the sheet burns it,
// including Update: Play's flexible flow can be cancelled at its own dialog, and asking
// again an hour later would be nagging somebody who has already been asked.
//
// The date key is the DEVICE-LOCAL one (`features/home/queries.ts` `localDateKey`), for
// the same reason Home's rollover is local: "today" is the member's day, not UTC's.
//
// DELIBERATELY NOT CLEARED ON SIGN-OUT, which is why it has no `reset` and is absent from
// `state/auth.ts`'s `forgetWhoeverThatWas()`. Everything that function clears is a promise
// made to one member (their milestones, their notification ask, their unsent drafts). An
// update is a fact about the PHONE, so clearing it would mean a shared device asks the
// next person the same question the same day.

interface UpdateNoticeState {
  /** Local date key (YYYY-MM-DD) of the day the notice was last answered. */
  lastShownDay: string | null;
  /** The store version the last check found. Not persisted. */
  available: string | null;
  /** A check found something newer. */
  found: (storeVersion: string) => void;
  /** Any way out of the sheet: Update, Not now, the scrim, the back button. */
  answered: (today: string) => void;
}

export const useUpdateNoticeStore = create<UpdateNoticeState>()(
  persist(
    (set) => ({
      lastShownDay: null,
      available: null,
      found: (storeVersion) => set({ available: storeVersion }),
      answered: (today) => set({ lastShownDay: today, available: null }),
    }),
    {
      name: 'agbc-update-notice',
      storage: createJSONStorage(() => AsyncStorage),
      // `available` is a fact about the store right now, not a state to restore.
      partialize: (state) => ({ lastShownDay: state.lastShownDay }),
    },
  ),
);

/**
 * Whether the store is worth asking today.
 *
 * Pure, and separated from the component for the obvious reason: this one comparison IS
 * the "once a day" promise, and it should be provable without mounting anything.
 */
export function mayCheckToday(
  lastShownDay: string | null,
  today: string,
): boolean {
  return lastShownDay !== today;
}

/**
 * The threshold at which the app stops asking and lets Play take the screen: 28 days
 * since this device learnt a newer version existed.
 *
 * WHY DAYS AND NOT A COUNT OF RELEASES, since "two releases behind" is what was decided
 * (Ayo, 2026-09-08). Because no count exists to read, and the two candidates are both
 * wrong in ways that would misfire. `versionCode` counts BUILDS, not releases: 21 and 22
 * were two builds of the same 1.0.0 release, so a member perfectly up to date would be
 * told they were a release behind. Semver distance is not a count either: 1.0.0 to 1.0.1
 * to 1.1.0 is two releases and 1.0.0 to 1.2.0 might be one. The remaining option was a
 * release counter carried in the binary and mirrored in `app_config`, which was written up
 * as the recommendation and then dropped: it buys a unit that reads the same on both
 * platforms, and THE ESCALATION IS ANDROID-ONLY (Apple has no takeover flow at all), so
 * that generality would never be used. What it would cost is a second `app_config` key, a
 * hand-bumped integer that every store train has to remember, and a lockout if anyone ever
 * forgets it twice.
 *
 * `clientVersionStalenessDays` is Play's own answer to Play's own question and needs no
 * state anywhere. The arithmetic that makes it mean "two releases": `21` §122 puts the
 * store train at a fortnight, and the counter starts the day the NEXT version became
 * visible on this device, so 28 days of staleness means that version has been out for two
 * trains and at least one more has shipped behind it.
 *
 * If the cadence ever changes, this number changes with it, and that is the whole
 * maintenance burden.
 */
export const STALE_DAYS_FOR_TAKEOVER = 28;

/**
 * Whether to skip the sheet entirely and hand the screen to Play's IMMEDIATE flow.
 *
 * IT CAN NEVER FIRE ON ITS OWN, and that is the safety property worth stating out loud: an
 * immediate update takes the member's screen until the install finishes, so every arm of
 * this reads Play rather than anything of ours. Play must say an update EXISTS, Play must
 * ALLOW the immediate flow for it, and Play must supply the staleness. A missing
 * `daysSinceRelease` is "no information" and never a zero, so an unknown answer declines to
 * escalate, which is the same fail-open rule the floor is built on.
 *
 * `serverUpdateType` is the church's own lever, ahead of any staleness: setting an update
 * priority of 4 or higher on a Play release says "this one cannot wait", and Play hands
 * that straight back here.
 */
export function shouldTakeOver(check: UpdateCheck): boolean {
  if (!check.updateAvailable) return false;
  // Already downloading from an earlier tap: let it finish.
  if (check.updateInProgress === true) return false;
  // Android-only by construction. iOS never sets it, so iOS never escalates.
  if (check.immediateAllowed !== true) return false;
  if (check.serverUpdateType === 'IMMEDIATE') return true;
  const stale = check.daysSinceRelease;
  return typeof stale === 'number' && stale >= STALE_DAYS_FOR_TAKEOVER;
}
