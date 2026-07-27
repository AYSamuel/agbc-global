// Query keys for the Family domain, in their own module so that code which needs
// to ADDRESS a cached surface does not have to import the code that FETCHES it.
// gloryCache reaches for these while queries.ts reaches for gloryCache, and
// without this split that pair is a runtime import cycle.

import type { FamilyScope } from './queries';

export function testimonyFeedKey(scope: FamilyScope, branchId: string | null) {
  return ['family', 'testimonies', scope, scope === 'branch' ? branchId : null];
}

export function prayerFeedKey(scope: FamilyScope, branchId: string | null) {
  return ['family', 'prayers', scope, scope === 'branch' ? branchId : null];
}

// Every cached surface that shows one kind of content, so a write or a broadcast
// can refresh exactly what it changed.
//
// Invalidating the whole `['family']` prefix used to be the shortcut, and it
// reached further than anyone intended: it also swept each photo's signed URL,
// so one member saying Glory made unrelated images reload on every device
// watching (found on device 2026-07-27). Naming the surfaces is the fix, and
// keeping the lists here means the next work item inherits it.

export const TESTIMONY_SURFACE_KEYS: readonly (readonly string[])[] = [
  ['family', 'testimonies'],
  ['family', 'testimony'],
  ['family', 'latest-testimony'],
];

export const PRAYER_SURFACE_KEYS: readonly (readonly string[])[] = [
  ['family', 'prayers'],
  ['family', 'prayer'],
];
