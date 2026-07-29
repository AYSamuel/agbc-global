/**
 * The CSRF defense for route handlers.
 *
 * Cookies authenticate every request here, and SameSite is defense in depth, not the
 * defense (~/.claude/standards/security.md). Server Actions get an Origin check from
 * Next for free; route handlers do not, so state-changing handlers call this first.
 *
 * Fetch Metadata (`Sec-Fetch-Site`) is the primary signal, with an Origin/Host
 * comparison as the fallback for anything that does not send it. Fails closed: no
 * usable signal means no.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';

  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    // `host` carries the port, which matters: localhost:3000 and localhost:3001 are
    // different origins even though the hostname matches.
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}
