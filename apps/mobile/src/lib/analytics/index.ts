import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
  AnalyticsGateAction,
  AnalyticsRole,
  AnalyticsStandardProperties,
} from '@agbc/shared';

import i18n from '@/i18n';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import type { GateActionKind } from '@/state/gate';

import { analyticsClient } from './client';
import { hasAnalyticsConsent } from './consent';

// The one way the app records anything (W2.10; the plan itself is in @agbc/shared).
//
// Call sites pass the event and its own properties. The four standard properties are
// attached here, once, read from the stores that already own them rather than from a copy
// kept for analytics: `branch_id` is the BROWSED branch (docs/spec/07), which is why north
// star 3 can tell an own-branch tap from a cross-branch one at all.
//
// `scope` is the exception and is passed by the call sites that have one, because the
// Family feed keeps its scope in component state and mirroring it into a store would give
// one displayed fact two owners (the W2.4 lesson).

export { hasAnalyticsConsent, useAnalyticsConsentStore } from './consent';
export { shutdownAnalytics } from './client';

/**
 * Every gate the app can raise must have a name in the tracking plan. This is a type-level
 * assertion, not a runtime one: `@agbc/shared` cannot import from `apps/`, so adding a
 * kind to `GateAction` without adding it to `AnalyticsGateAction` fails `pnpm typecheck`
 * instead of quietly landing a gate that is invisible in the funnel.
 */
type AssertGateActionsCovered = GateActionKind extends AnalyticsGateAction
  ? true
  : never;
export const assertGateActionsCovered: AssertGateActionsCovered = true;

/** 'onboarding' is a half-created account (docs/spec/03): not yet a member, so a guest. */
function currentRole(): AnalyticsRole {
  const { status, profile } = useAuthStore.getState();
  if (status !== 'member' || !profile) return 'guest';
  return profile.role === 'leader' || profile.role === 'admin'
    ? profile.role
    : 'member';
}

function standardProperties(): AnalyticsStandardProperties {
  return {
    branch_id: useBranchStore.getState().branch?.id ?? null,
    scope: null,
    locale: i18n.language,
    role: currentRole(),
  };
}

/**
 * Record one event. A no-op without consent, without a project key, or in tests, and it
 * never throws: analytics failing is never a reason for a tap to fail.
 *
 * The second argument is required exactly when the event has required properties, so
 * `track('map_opened')` and `track('glory_tapped', { own_branch: true })` both typecheck
 * and neither can drift from the plan.
 */
export function track<N extends AnalyticsEventName>(
  name: N,
  ...args: Record<string, never> extends AnalyticsEventProperties[N]
    ? [properties?: AnalyticsEventProperties[N]]
    : [properties: AnalyticsEventProperties[N]]
): void {
  if (!hasAnalyticsConsent()) return;
  const client = analyticsClient();
  if (!client) return;
  try {
    client.capture(name, { ...standardProperties(), ...args[0] });
  } catch {
    // Deliberately swallowed: a failed capture is not a user-visible failure, and there
    // is nothing actionable to show. Sentry sees the SDK's own errors.
  }
}
