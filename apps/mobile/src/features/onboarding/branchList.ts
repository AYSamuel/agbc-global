import { BRANCHES_SNAPSHOT, type BranchSummary } from './branches-snapshot';

// States policy for the branch picker (docs/spec/06, revised 2026-07-20): the
// bundled snapshot renders IMMEDIATELY while the fetch is in flight (same rows
// and ids as the seed, so the server result swaps in without disturbing a
// selection). Error OR an empty result keeps the snapshot WITH the offline
// notice (onboarding must never dead-end on day-one-offline); success = server
// list. Users never watch this screen load. Pure module: no client import,
// unit-testable without mocking.
export function resolveBranchList(query: {
  data: BranchSummary[] | undefined;
  isError: boolean;
}): { branches: BranchSummary[]; usingSnapshot: boolean } {
  if (query.data && query.data.length > 0) {
    return { branches: query.data, usingSnapshot: false };
  }
  if (query.isError || query.data) {
    return { branches: BRANCHES_SNAPSHOT, usingSnapshot: true };
  }
  // In flight: snapshot as instant placeholder, no offline notice.
  return { branches: BRANCHES_SNAPSHOT, usingSnapshot: false };
}
