/**
 * Narrows a caller-supplied `?next=` to a same-origin path.
 *
 * Anything else becomes '/'. Without this, `?next=https://evil.example` turns the
 * sign-in screen into an open redirect: a convincing AGBC-branded page that hands the
 * visitor to somebody else the moment they authenticate.
 */
export function safeNext(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return '/';

  // Must be a rooted path, and must not be protocol-relative ('//host' is another origin).
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/';
  // A backslash is treated as a slash by some browsers when resolving URLs.
  if (candidate.includes('\\')) return '/';

  return candidate;
}
