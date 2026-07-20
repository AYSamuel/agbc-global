import { BRANCHES_SNAPSHOT, type BranchSummary } from './branches-snapshot';

// Four-states policy for ONB-2 (docs/spec/06): loading = skeleton; error OR an empty
// result falls back to the bundled snapshot WITH an offline notice (onboarding must
// never dead-end on day-one-offline); success = server list. Pure module: no client
// import, unit-testable without mocking.
export function resolveBranchList(query: {
  data: BranchSummary[] | undefined;
  isError: boolean;
}): { branches: BranchSummary[] | null; usingSnapshot: boolean } {
  if (query.data && query.data.length > 0) {
    return { branches: query.data, usingSnapshot: false };
  }
  if (query.isError || query.data) {
    return { branches: BRANCHES_SNAPSHOT, usingSnapshot: true };
  }
  return { branches: null, usingSnapshot: false };
}
