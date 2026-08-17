// The v1 analytics tracking plan (W2.10; docs/spec/22 §5 is the source of the list and the
// north stars, `20` the consent rules, ADR 0020 the decisions).
//
// This file is the whole plan, including the events nothing fires yet. A name that only
// appears at a call site is a name nobody agreed to: `mobile.md` asks for a versioned
// tracking plan with one naming convention, and `18` is explicit that launch week is the
// only chance to baseline the wedge, so the list is not trimmed to what is convenient to
// send today. `EVENT_SOURCE` below records, per event, whether the app fires it, whether a
// later work item owns it, or whether it is answered from the database instead.
//
// Conventions: snake_case names, past tense for things that happened, and properties are
// flat scalars. Every event also carries the four standard properties, attached once by the
// client rather than per call site (`AnalyticsStandardProperties`).

/**
 * Which feed the member was looking at. Structurally the same union as the app's
 * `FamilyScope`, deliberately re-stated: `@agbc/shared` cannot import from `apps/`, and
 * the app passes its own values straight in.
 */
export type AnalyticsScope = 'branch' | 'everywhere';

/** `profile_role` plus the state that has no row: a visitor with no account. */
export type AnalyticsRole = 'guest' | 'member' | 'leader' | 'admin';

/**
 * The gated actions, mirroring `GateActionKind` in the app's gate store, which stays the
 * authority. The app asserts at compile time that every kind it can raise appears here
 * (see `assertGateActionsCovered` in apps/mobile/src/lib/analytics), so adding a gate
 * without deciding what it is called in the funnel fails typecheck rather than shipping.
 */
export type AnalyticsGateAction =
  | 'glory'
  | 'intercede'
  | 'compose'
  | 'rsvp'
  | 'save_sermon'
  | 'sermon_notes'
  | 'resume_playback'
  | 'notifications'
  | 'im_here'
  | 'my_posts'
  | 'my_list'
  | 'rhythm'
  | 'report'
  | 'block'
  | 'course_register'
  | 'course_interest';

/**
 * Attached to every event by the client, from the live sources rather than a copy of them
 * (the app's one-visible-fact-one-owner rule). `branch_id` is the browsed branch, which is
 * not always the member's home branch, and that difference is the point of north star 3.
 *
 * Note what is NOT here: no member id, no email, no name. Analytics identity is the device
 * and only the device (ADR 0020), so a phone and a tablet are two people to PostHog.
 *
 * `scope` defaults to null and is filled in by the CALL SITE on the surfaces that have one,
 * which is why it also appears on those events' own properties below. The app keeps the
 * Family feed's scope in component state (`app/(tabs)/family.tsx`), and mirroring it into a
 * store so this file could read it globally would give one displayed fact two owners: the
 * bug W2.4 paid for four times. A tap that knows its scope passes it; nothing else guesses.
 */
export interface AnalyticsStandardProperties {
  branch_id: string | null;
  scope: AnalyticsScope | null;
  locale: string;
  role: AnalyticsRole;
  /**
   * A fifth standard property, beyond `22` §5's four (added 2026-08-13, ADR 0020 amended).
   *
   * PostHog's free plan allows ONE project, and a second one needs a card on file, so dev
   * traffic and real member activity share a dataset. Rather than leave the wedge's north
   * stars quietly contaminated by our own testing, every event says which build it came
   * from, and every insight filters on it. Derived from the build, never configured: nobody
   * can forget to set it, and nobody can set it wrongly.
   */
  environment: 'development' | 'production';
}

/** No properties of its own. Present so `track()` can refuse a second argument. */
export type NoProperties = Record<string, never>;

/**
 * Every v1 event and the properties it carries. Adding a key here is the decision; wiring
 * the call site is the consequence.
 */
export interface AnalyticsEventProperties {
  /** ONB-3 Continue, the end of first run. Fires for guests: most of them are guests. */
  onboarding_completed: NoProperties;
  /** AUTH-3 completed, so the account exists and has a name and a branch. */
  signup_completed: NoProperties;
  /** A gate sheet was shown, naming the action the guest was reaching for. */
  gate_shown: { action_type: AnalyticsGateAction };
  /** The same action completed after sign-in: the gate-return promise, measured. */
  gate_converted: { action_type: AnalyticsGateAction };
  /** Sent for review, not published. Approval is a leader's act, see EVENT_SOURCE. */
  testimony_posted: { from_answered_prayer: boolean };
  /** A leader approved one. Database-derived; see EVENT_SOURCE for why. */
  testimony_approved: NoProperties;
  prayer_posted: NoProperties;
  /**
   * North star 3 lives on `own_branch`: false means the tap crossed a border. `scope` is
   * optional because Glory is tappable from Home's inline card too, where no scope exists.
   */
  glory_tapped: { own_branch: boolean; scope?: AnalyticsScope };
  i_prayed_tapped: {
    own_branch: boolean;
    stage: 'will_pray' | 'prayed';
    scope?: AnalyticsScope;
  };
  prayer_marked_answered: NoProperties;
  /** The wedge's conversion: an answered prayer became a testimony (north star 2). */
  answered_converted_to_testimony: NoProperties;
  map_opened: { scope?: AnalyticsScope };
  scope_toggled: { to: AnalyticsScope };
  attendance_marked: {
    source: 'here_button' | 'live_watch';
    visiting: boolean;
  };
  plan_day_completed: { plan_id: string };
  devotional_purchased_matched: NoProperties;
  sermon_played: { mode: 'video' | 'audio' };
  sermon_resumed: { mode: 'video' | 'audio' };
  rsvp_set: { status: 'going' | 'interested' | 'cancelled' };
  give_tapped: { method: 'website' | 'paypal' | 'bank' };
  broadcast_received: NoProperties;
  broadcast_opened: NoProperties;
  notification_opened: { type: string };
  reader_opened: { format: 'pdf' | 'epub' };
}

export type AnalyticsEventName = keyof AnalyticsEventProperties;

/**
 * Where each event comes from.
 *
 * - `app`: a call site in apps/mobile fires it (W2.10 slice 2).
 * - `deferred`: the surface does not exist yet, and `owner` names the work item that lands
 *   it. Nothing fires, and that is a schedule, not an omission.
 * - `database`: the fact is already recorded server-side and is answered in SQL. Moderation
 *   approval is the case: it happens in the dashboard, a staff tool with no PostHog in it
 *   and no consent story of its own, and north star 4 (moderation latency p50/p95) reads
 *   the timestamps the moderation tables already keep. Sending it from a leader's browser
 *   would add a second, worse source for a number we can already compute exactly.
 */
export type AnalyticsEventSource =
  | { fires: 'app' }
  | { fires: 'deferred'; owner: string }
  | { fires: 'database'; note: string };

export const EVENT_SOURCE: Record<AnalyticsEventName, AnalyticsEventSource> = {
  onboarding_completed: { fires: 'app' },
  signup_completed: { fires: 'app' },
  gate_shown: { fires: 'app' },
  gate_converted: { fires: 'app' },
  testimony_posted: { fires: 'app' },
  testimony_approved: {
    fires: 'database',
    note: 'moderation timestamps; north star 4 is a SQL question',
  },
  prayer_posted: { fires: 'app' },
  glory_tapped: { fires: 'app' },
  i_prayed_tapped: { fires: 'app' },
  prayer_marked_answered: { fires: 'app' },
  answered_converted_to_testimony: { fires: 'app' },
  map_opened: { fires: 'app' },
  scope_toggled: { fires: 'app' },
  attendance_marked: { fires: 'app' },
  plan_day_completed: {
    fires: 'deferred',
    owner: 'Phase 4 · devotional plans',
  },
  devotional_purchased_matched: {
    fires: 'deferred',
    owner: 'Phase 4 · entitlement pipeline',
  },
  sermon_played: { fires: 'app' },
  sermon_resumed: { fires: 'app' },
  rsvp_set: { fires: 'app' },
  give_tapped: { fires: 'app' },
  broadcast_received: { fires: 'app' },
  broadcast_opened: { fires: 'app' },
  notification_opened: { fires: 'app' },
  reader_opened: { fires: 'deferred', owner: 'Phase 4 · library + reader' },
};
