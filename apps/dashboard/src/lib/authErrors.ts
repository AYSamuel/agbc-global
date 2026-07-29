/**
 * Is this a "the network let us down" failure rather than "the server said no"?
 *
 * The distinction is the whole difference between an actionable message and a wrong
 * one: telling someone on a dead connection that their code was invalid sends them
 * hunting for a problem that is not there.
 */
export function isNetworkError(error: {
  name?: string;
  status?: number;
}): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return error.name === 'AuthRetryableFetchError' || error.status === 0;
}
