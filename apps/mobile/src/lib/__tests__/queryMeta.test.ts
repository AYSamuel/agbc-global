import type { Query } from '@tanstack/react-query';

import { PERSIST_META, shouldPersistQuery } from '../queryMeta';

// shouldPersistQuery reads only state.status and meta; a minimal stand-in suffices.
function fakeQuery(status: string, meta?: Record<string, unknown>): Query {
  return { state: { status }, meta } as unknown as Query;
}

// The allowlist is a security boundary as much as an offline feature: only queries
// that explicitly opt in are written to unencrypted AsyncStorage, so member/PII
// reads added in Phase 2 never leak to disk unless deliberately flagged.
describe('shouldPersistQuery (offline persistence allowlist)', () => {
  test('persists a successful, opted-in query', () => {
    expect(shouldPersistQuery(fakeQuery('success', PERSIST_META))).toBe(true);
  });

  test('never persists a query that did not opt in', () => {
    expect(shouldPersistQuery(fakeQuery('success'))).toBe(false);
    expect(shouldPersistQuery(fakeQuery('success', { persist: false }))).toBe(
      false,
    );
  });

  test('never persists a pending or errored query (no useless/stale snapshot)', () => {
    expect(shouldPersistQuery(fakeQuery('pending', PERSIST_META))).toBe(false);
    expect(shouldPersistQuery(fakeQuery('error', PERSIST_META))).toBe(false);
  });
});
