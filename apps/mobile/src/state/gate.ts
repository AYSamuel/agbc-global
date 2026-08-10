import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

// The gate-return machine (docs/spec/03 gate rules, 04 rule 9: gated action ->
// GATE -> sign-in -> the original action runs -> stay in place).
//
// Security by construction (docs/spec/03): the pending action lives ONLY in
// this in-memory store and is set ONLY by a gate sheet's Sign-in tap in the
// current session. It is never persisted, never encoded in a link, and never
// derivable from navigation, so deep links cannot mint or replay one.

export type GateAction =
  | { kind: 'glory'; testimonyId: string }
  | { kind: 'intercede'; prayerId: string }
  | { kind: 'compose'; target: 'testimony' | 'prayer' }
  | { kind: 'rsvp'; eventId: string }
  | { kind: 'save_sermon'; sermonId: string }
  | { kind: 'sermon_notes'; sermonId: string }
  | { kind: 'resume_playback'; sermonId: string }
  | { kind: 'notifications' }
  /**
   * "I'm here" (W2.8). Carries the BROWSED branch, because attendance records
   * where the member was standing when they tapped (docs/spec/07), and after
   * AUTH-4 returns them the chip could read anything. In memory only, like every
   * action here, so no link can mint a check-in at a branch of its choosing.
   */
  | { kind: 'im_here'; branchId: string }
  /**
   * Reaching MY-POSTS (W2.6). The only NAVIGATION-shaped gate so far: the others complete
   * something the member tapped, this one opens the screen they were trying to reach, which
   * is the same promise (docs/spec/04 rule 9) with nothing to write at the end of it.
   */
  | { kind: 'my_posts' }
  /**
   * Reaching RHYTHM (W2.8). Navigation-shaped like `my_posts`, and reachable
   * only by deep link: Home offers a guest the Join card, never a strip to tap.
   * A rhythm is by definition a fact about somebody, so a guest has nobody to be.
   */
  | { kind: 'rhythm' }
  /**
   * Reporting a post and blocking a member (W2.6), both of which need an account: the
   * report policy requires an onboarded caller, and a block is by definition a fact about
   * somebody, so a guest has nobody to be.
   *
   * DELIBERATELY WITHOUT AN EXECUTOR. Every other gate replays a write or a route; these
   * two replay a modal on the screen the member is already standing on, because AUTH-4
   * returns them in place (docs/spec/03). Reopening that sheet from here would mean a
   * cross-screen channel to carry it, to save one tap on a menu that is right there. They
   * are still real pending actions so the lifetime rules (background clear, sign-in
   * abandonment) hold, and `replayGateAction`'s default returns 'noop' for them.
   */
  | { kind: 'report' }
  | { kind: 'block' }
  /**
   * Register on a course (W2.9 slice 3). The gated action is "open the
   * website's registration page as me" (ADR 0017): the replay mints the
   * handoff token, which needs the session that did not exist at the tap.
   * Carries the slug, which is public catalog data, like every payload here.
   */
  | { kind: 'course_register'; courseSlug: string }
  /** Notify me on an upcoming course (docs/spec/13): the replay records the
   * interest the guest tapped for. */
  | { kind: 'course_interest'; courseId: string };

export type GateActionKind = GateAction['kind'];

/** docs/spec/03: a background stay longer than this clears the pending action. */
export const BACKGROUND_CLEAR_MS = 5 * 60_000;

interface GateState {
  pending: GateAction | null;
  /**
   * Action types dismissed with "Not now" this session. Explicit taps still
   * open the sheet (decided 2026-07-26: answering a tap is not nagging); this
   * set exists so FUTURE passive prompts never re-pitch a dismissed type.
   */
  dismissedKinds: readonly GateActionKind[];
  /** A gate sheet's Sign-in tap: remember the action, then route to /auth. */
  beginGateSignIn: (action: GateAction) => void;
  /** Any other way the sheet closes: the pending action dies with it. */
  dismissGate: (kind: GateActionKind) => void;
  /** Removes and returns the pending action: a replay can never double-fire. */
  takePending: () => GateAction | null;
  clearPending: () => void;
}

export const useGateStore = create<GateState>()((set, get) => ({
  pending: null,
  dismissedKinds: [],
  beginGateSignIn: (action) => {
    set({ pending: action });
  },
  dismissGate: (kind) => {
    set((state) => ({
      pending: null,
      dismissedKinds: state.dismissedKinds.includes(kind)
        ? state.dismissedKinds
        : [...state.dismissedKinds, kind],
    }));
  },
  takePending: () => {
    const action = get().pending;
    set({ pending: null });
    return action;
  },
  clearPending: () => {
    set({ pending: null });
  },
}));

/** Pure for tests: does a background stay of this length clear the action? */
export function backgroundStayClears(
  backgroundedAt: number,
  resumedAt: number,
): boolean {
  return resumedAt - backgroundedAt > BACKGROUND_CLEAR_MS;
}

// docs/spec/03 lifetime rule: the app backgrounded longer than 5 minutes drops
// the pending action (the moment has passed; a much-later sign-in must not
// replay it). Module-level: the listener outlives any screen.
let backgroundedAt: number | null = null;
AppState.addEventListener('change', (status: AppStateStatus) => {
  if (status === 'background') {
    backgroundedAt = Date.now();
    return;
  }
  if (status === 'active' && backgroundedAt !== null) {
    if (backgroundStayClears(backgroundedAt, Date.now())) {
      useGateStore.getState().clearPending();
    }
    backgroundedAt = null;
  }
});
