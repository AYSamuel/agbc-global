import type { Query } from '@tanstack/react-query';

// Opt-in offline persistence flag (docs/spec/04 "offline: cached view or retry").
// A query that carries `meta: PERSIST_META` is mirrored to the on-disk cache by the
// persister in _layout, so a COLD, offline launch paints its last-seen data instead
// of a retry card. Everything flagged is PUBLIC read data; member/PII reads added in
// Phase 2 MUST NOT set this, so nothing sensitive lands in unencrypted storage.
export const PERSIST_META = { persist: true } as const;

// The persister's allowlist gate: only successful, opt-in queries are written to
// disk (a pending/errored query would persist a useless or misleading snapshot).
export function shouldPersistQuery(query: Query): boolean {
  return query.state.status === 'success' && query.meta?.persist === true;
}

/**
 * Is this cached answer somebody's, rather than everybody's?
 *
 * The same flag read the other way round, and it is what a sign-out has to act on:
 * `03` and `16` both say sign-out clears personal caches and KEEPS the
 * guest-browsable ones, so that signing out does not also cost you the offline
 * verse and service card.
 *
 * The default is "personal", which is the safe direction: a query nobody thought
 * about is dropped at sign-out and refetched, where the other default would leave
 * one member's data on screen for the next one (found on device, W2.8).
 */
export function isPersonalQuery(query: Query): boolean {
  return query.meta?.persist !== true;
}
