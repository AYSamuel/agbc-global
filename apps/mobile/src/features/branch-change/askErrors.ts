// Maps a failed branch-change write to the copy the member should see.
//
// Every refusal below is a real invariant from `022`'s guard, not an edge case: the
// 90-day settle after a completed move, the one-open-request index, asking for the branch
// they are already in, and a destination that has been archived. Anything unrecognised is
// treated as transport, because the honest thing to tell somebody whose request did not
// send is that it did not send.
//
// The COOLDOWN carries a date in its message (`YYYY-MM-DD`, from the guard). It is not
// parsed out of the string here: the screens compute the same date from the member's own
// request history, which they already hold, and use this only to know WHICH refusal
// happened. A message is a contract about what went wrong, not a data feed.

export type AskErrorKey =
  | 'errorTooSoon'
  | 'errorAlreadyAsked'
  | 'errorSameBranch'
  | 'errorBranchClosed'
  | 'errorOffline'
  | 'errorGeneric';

/** Narrowed rather than imported, so a bare transport Error maps too. */
interface MaybePostgrestError {
  code?: unknown;
  message?: unknown;
}

export function mapAskError(error: unknown): AskErrorKey {
  if (typeof error !== 'object' || error === null) return 'errorGeneric';

  const candidate = error as MaybePostgrestError;
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message =
    typeof candidate.message === 'string' ? candidate.message : '';

  // 23505 is the partial unique index on (profile_id) where status = 'pending'. It is the
  // one refusal with no message of its own, because the index has no voice.
  if (code === '23505') return 'errorAlreadyAsked';

  if (message.includes('available again from')) return 'errorTooSoon';
  if (message.includes('already your home branch')) return 'errorSameBranch';
  if (message.includes('not accepting members')) return 'errorBranchClosed';

  // A network failure reaches here as a TypeError from fetch, or as a PostgrestError with
  // no code at all when the request never completed.
  if (error instanceof TypeError) return 'errorOffline';
  if (code === '' && message.toLowerCase().includes('network')) {
    return 'errorOffline';
  }

  return 'errorGeneric';
}
