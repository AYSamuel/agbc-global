import type { PhotoFailure } from './photo';

// Maps a failed compose submit to what the author should see. The server
// refusals here are real invariants, not edge cases: the daily sharing quota
// (docs/spec/09) and the consent-version check (docs/spec/20) both raise
// check_violation from a trigger, and the FK underneath the latter raises
// foreign_key_violation.
//
// TWO ANSWERS ARE NOT COPY (W4.18 slice 2). A unique violation means the post
// is already there: the composer sends each post with an id it minted itself,
// so a retry of a request that had already landed conflicts on the primary
// key, and a linked testimony conflicts on the one-live-answer index. Until
// this, 23505 fell through to "please try again", and an author whose
// testimony had in fact been published could press Post for ever. And a
// failure with NO code is not "offline": postgrest-js gives an aborted
// request an empty code, and a gateway error with a non-JSON body arrives as
// a bare message. The database never spoke, so the request may have run, and
// the copy says exactly that much and no more.

export type ComposeErrorKey =
  'errorLimit' | 'errorConsentStale' | 'errorUnconfirmed' | 'errorGeneric';

/** What a failed insert means: copy to show, or the news that it did not fail. */
export type ComposeOutcome = ComposeErrorKey | 'alreadyPosted';

/** Shape of the PostgrestError supabase-js returns; narrowed, not imported,
 * so a transport failure (a bare Error, or nothing at all) maps too. */
interface MaybePostgrestError {
  code?: unknown;
  message?: unknown;
}

function textOf(error: MaybePostgrestError): string {
  return typeof error.message === 'string' ? error.message : '';
}

export function mapComposeError(error: unknown): ComposeOutcome {
  if (typeof error !== 'object' || error === null) return 'errorUnconfirmed';
  const candidate = error as MaybePostgrestError;
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = textOf(candidate);

  // The primary key (a retry of a post that landed) or the one-live-answer index
  // (a second testimony for the same answered prayer): either way, it is there.
  if (code === '23505') return 'alreadyPosted';

  if (code === '23514') {
    if (message.includes('daily sharing limit')) return 'errorLimit';
    if (message.includes('consent wording')) return 'errorConsentStale';
    return 'errorGeneric';
  }
  // The consent_version FK: this build is pointed at a version the database has
  // never heard of, which means the app is older than the schema.
  if (code === '23503' && message.includes('consent_version')) {
    return 'errorConsentStale';
  }
  // No code at all: a bounded fetch that aborted, a dropped connection, no
  // network, or a gateway answering for a database that never got the request.
  // Not one of those says the row is absent, so the copy does not either.
  if (code === '') return 'errorUnconfirmed';
  return 'errorGeneric';
}

// Same idea one layer out: why a photo could not be attached. Kept here rather
// than in photo.ts so it stays a pure decision with no client to mock, and
// beside its sibling so the two failure vocabularies are read together. The
// import above is TYPE-ONLY and erases at compile time, so this file still pulls
// in no client; what it buys is that the reason list lives in one place.
export type PhotoErrorKey =
  | 'photoErrorPermission'
  | 'photoErrorCouldNotOpen'
  | 'photoErrorCouldNotPrepare'
  | 'photoErrorTooLarge'
  | 'photoErrorNotAnImage'
  | 'photoErrorRateLimited'
  | 'photoErrorUnconfirmed'
  | 'photoErrorSignedOut'
  | 'photoErrorGeneric';

/**
 * Every failure gets a line that says what the author can do next; a cancelled
 * pick is not a failure and never reaches here (docs/spec/04, error handling).
 *
 * ONLY `unconfirmed` MENTIONS THE CONNECTION (W4.19). The generic line used to,
 * and it was the line every unclassified failure reached, so for the app's whole
 * life a server that answered and refused told the member their network was at
 * fault. The reason is taken from `PhotoFailure` rather than re-listed here, so
 * a new one cannot be added without this switch being confronted with it.
 */
export function photoFailureKey(
  failure: Exclude<PhotoFailure, 'cancelled'>,
): PhotoErrorKey {
  switch (failure) {
    case 'permission':
      return 'photoErrorPermission';
    case 'too_large':
      return 'photoErrorTooLarge';
    case 'could_not_open':
      return 'photoErrorCouldNotOpen';
    case 'could_not_prepare':
      return 'photoErrorCouldNotPrepare';
    case 'not_an_image':
      return 'photoErrorNotAnImage';
    case 'signed_out':
      return 'photoErrorSignedOut';
    case 'rate_limited':
      return 'photoErrorRateLimited';
    case 'unconfirmed':
      return 'photoErrorUnconfirmed';
    default:
      return 'photoErrorGeneric';
  }
}
