// Tile initial for a branch (ONB-2 rows, BRANCH-SWITCH sheet). Naive
// first-letter logic made every "AGBC …" branch read "A" (found on device
// 2026-07-20): the org prefix is dropped so siblings stay distinguishable,
// giving Glasgow G, Lighthouse Berlin L, Emmen E, Miracle Centre M.
const ORG_PREFIX = 'agbc';

export function branchInitial(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0];
  if (words.length > 1 && first.toLowerCase() === ORG_PREFIX) {
    return words[1].charAt(0).toUpperCase();
  }
  return first.charAt(0).toUpperCase();
}
