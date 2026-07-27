// Maps a failed compose submit to the copy the author should see. The server
// refusals here are real invariants, not edge cases: the daily sharing quota
// (docs/spec/09) and the consent-version check (docs/spec/20) both raise
// check_violation from a trigger, and the FK underneath the latter raises
// foreign_key_violation. Everything that is not a recognised refusal is treated
// as transport, because the honest thing to tell someone whose testimony did not
// send is that it did not send and their words are safe.

export type ComposeErrorKey =
  'errorLimit' | 'errorConsentStale' | 'errorOffline' | 'errorGeneric';

/** Shape of the PostgrestError supabase-js returns; narrowed, not imported,
 * so a transport failure (a bare Error, or nothing at all) maps too. */
interface MaybePostgrestError {
  code?: unknown;
  message?: unknown;
}

function textOf(error: MaybePostgrestError): string {
  return typeof error.message === 'string' ? error.message : '';
}

export function mapComposeError(error: unknown): ComposeErrorKey {
  if (typeof error !== 'object' || error === null) return 'errorGeneric';
  const candidate = error as MaybePostgrestError;
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = textOf(candidate);

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
  // supabase-js surfaces transport failures with no pg code: a bounded fetch
  // that aborted, a dropped connection, no network at all.
  if (code === '') return 'errorOffline';
  return 'errorGeneric';
}

// Same idea one layer out: why a photo could not be attached. Kept here rather
// than in photo.ts so it stays a pure decision with no client to mock, and
// beside its sibling so the two failure vocabularies are read together.
export type PhotoErrorKey =
  | 'photoErrorPermission'
  | 'photoErrorTooLarge'
  | 'photoErrorNotAnImage'
  | 'photoErrorGeneric';

/** Every failure gets a line that says what the author can do next; a cancelled
 * pick is not a failure and never reaches here (docs/spec/04, error handling). */
export function photoFailureKey(
  failure:
    'permission' | 'too_large' | 'not_an_image' | 'unavailable' | 'failed',
): PhotoErrorKey {
  switch (failure) {
    case 'permission':
      return 'photoErrorPermission';
    case 'too_large':
      return 'photoErrorTooLarge';
    case 'not_an_image':
      return 'photoErrorNotAnImage';
    default:
      return 'photoErrorGeneric';
  }
}
