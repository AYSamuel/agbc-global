// Pure semver-shaped comparison for the forced-update gate (docs/spec/21 §8).
// Deliberately minimal: app versions are plain x.y.z (app.config.js); anything
// unparseable FAILS OPEN (never lock users out on a bad config value).

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
