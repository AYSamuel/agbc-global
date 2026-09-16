// What a failed `delete_my_account` call actually tells us (W4.18 slice 1;
// docs/spec/16 §DELETE, docs/spec/plans/W4.18-a-message-sent-once.md).
//
// Until this, DELETE showed one message for every failure: "Nothing has changed."
// On a timed-out request that is a guess, and a wrong one whenever the server
// finished the job after the phone stopped listening: the account was gone, the
// member was still signed in on it, and the screen said nothing had happened.
//
// THE SECOND CALL IS THE CONFIRMATION. `erase_profile` takes the profile row
// `for update where deleted_at is null` and raises `no_data_found` ("no live
// account to erase") when there is none (20260901160000, line 121). So when the
// member presses Delete again after an unconfirmed attempt, that specific
// refusal is proof the first attempt succeeded, and nothing new had to be
// built to learn it.
//
// THE ONLY PROOF THAT NOTHING HAPPENED IS THE SERVER SAYING SO. On the FIRST
// attempt, any error carrying a code is that proof: a Postgres error means the
// transaction rolled back, and a PostgREST refusal (PGRST…) means it never ran.
// On a CONFIRMING attempt the same cannot be said, because the erasure deletes
// `auth.sessions` and `auth.refresh_tokens` (lines 393-394): a session error
// there may be the erasure's own footprint. Only the last-admin rule, which can
// come from nowhere but a live account, still proves the account is intact.
//
// NO CODE MEANS THE DATABASE NEVER SPOKE. postgrest-js gives an aborted request
// `code: ''`, and a gateway error with a non-JSON body arrives as `{ message }`
// with no code at all. Both are the unknown case: the request may have run.

export type DeleteAttempt = 'first' | 'confirm';

export type DeleteOutcome =
  /** The account is erased: by this call, or provably by an earlier one. */
  | 'erased'
  /** The server refused before doing anything; "nothing has changed" is true. */
  | 'refused'
  /** The answer never arrived and the request may have run; say neither. */
  | 'unconfirmed';

const ALREADY_ERASED = 'no live account to erase';
const LAST_ADMIN = 'last admin';

/** Narrowed rather than imported, so a bare transport Error maps too. */
interface MaybePostgrestError {
  code?: unknown;
  message?: unknown;
}

function shapeOf(error: unknown): { code: string; message: string } {
  if (typeof error !== 'object' || error === null) {
    return { code: '', message: '' };
  }
  const candidate = error as MaybePostgrestError;
  return {
    code: typeof candidate.code === 'string' ? candidate.code : '',
    message: typeof candidate.message === 'string' ? candidate.message : '',
  };
}

export function classifyDeleteError(
  attempt: DeleteAttempt,
  error: unknown,
): DeleteOutcome {
  const { code, message } = shapeOf(error);

  // `no_data_found` is P0002. The message is checked too, so a future change to
  // how the code travels cannot turn "already erased" into "could not confirm".
  if (code === 'P0002' || message.includes(ALREADY_ERASED)) return 'erased';

  // `raise_exception` is P0001, and the erasure raises it for one reason only.
  if (code === 'P0001' && message.includes(LAST_ADMIN)) return 'refused';

  if (attempt === 'first' && code !== '') return 'refused';

  return 'unconfirmed';
}
