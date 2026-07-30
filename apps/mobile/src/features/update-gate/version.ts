// The pure logic of the forced-update gate (docs/spec/21 §8): which floor applies
// to this platform, and whether the running binary is below it. Kept free of
// react-native and supabase imports so it is testable without mocks.
//
// Deliberately minimal: app versions are plain x.y.z (app.config.js); anything
// unparseable FAILS OPEN (never lock users out on a bad config value).

/**
 * Which minimum version applies to this platform, from the raw `app_config`
 * jsonb value.
 *
 * THE FLOOR IS PER-PLATFORM, and that is not tidiness. iOS and Android review on
 * independent timelines, so a single global floor can be raised the moment one
 * store goes live and hard-block every user of the other platform on a version
 * whose replacement is still in review, with no update available to install. The
 * shape makes that impossible rather than relying on whoever cuts the release to
 * remember to wait (decided 2026-07-30).
 *
 * Accepts a bare string too, meaning "both platforms". That is exactly what a bare
 * string meant before this change, so an environment whose row has not been
 * migrated yet keeps gating rather than silently stopping.
 *
 * Anything else resolves to null, which fails open, consistent with the rest of
 * this file: a malformed remote config must never be able to lock the app.
 */
export function resolveMinimumVersion(
  value: unknown,
  platform: string,
): string | null {
  if (typeof value === 'string') return value;
  // Arrays excluded explicitly: typeof [] is 'object', and indexing one by
  // platform name would quietly yield undefined rather than reading as malformed.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const forPlatform = (value as Record<string, unknown>)[platform];
  return typeof forPlatform === 'string' ? forPlatform : null;
}

export function parseVersion(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isBelowMinimum(
  current: string | null | undefined,
  minimum: string | null | undefined,
): boolean {
  if (!current || !minimum) return false;
  const cur = parseVersion(current);
  const min = parseVersion(minimum);
  if (!cur || !min) return false;
  for (let i = 0; i < 3; i += 1) {
    if (cur[i] !== min[i]) return cur[i] < min[i];
  }
  return false;
}
