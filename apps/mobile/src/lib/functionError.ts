// The machine hint out of an edge function's non-2xx answer.
//
// Every one of our client-called functions refuses with a small JSON body,
// `{ ok: false, error: '<code>' }`, and supabase-js hangs the raw response off
// the thrown FunctionsHttpError as `context`. Reading that code is what lets the
// app choose an honest line instead of a generic one; the line itself always
// comes from i18n, and a server string is never shown to anybody.
//
// IT IS DUCK-TYPED, AND THAT IS NOT FASTIDIOUSNESS. Both call sites used to
// begin `if (!(context instanceof Response)) return null`, and on a real device
// that check is ALWAYS FALSE. Measured on the S22 on 2026-09-17, with the object
// that failed the check sitting right there carrying `status: 429`:
//
//     name=FunctionsHttpError isHttp=true ctxIsResponse=false status=429
//
// React Native's fetch is a polyfill, and the response it constructs is not an
// instance of whatever `Response` resolves to in our module scope. So the guard
// swallowed every refusal, and the app fell through to its generic copy for all
// of them: a testimony photo refused as "not a photo" or "too large" said
// "please try again" instead, and the contact form's rate-limit line could never
// appear either. Both had shipped that way since they were written, and no test
// caught it because every test builds a real `Response`, which is exactly the
// one thing the device never produces.
//
// So: if it can be asked for JSON, ask it. Anything else is null, and the caller
// shows its generic line.

export async function functionErrorCode(
  error: unknown,
): Promise<string | null> {
  if (error === null || typeof error !== 'object') return null;
  const context: unknown = (error as { context?: unknown }).context;
  if (context === null || typeof context !== 'object') return null;

  const read: unknown = (context as { json?: unknown }).json;
  if (typeof read !== 'function') return null;

  try {
    const parsed: unknown = await (read as () => Promise<unknown>).call(
      context,
    );
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof parsed.error === 'string'
    ) {
      return parsed.error;
    }
  } catch {
    // Not JSON, already consumed, or a body that is not ours.
  }
  return null;
}
