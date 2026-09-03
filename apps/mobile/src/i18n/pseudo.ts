/**
 * Pseudo-localization (`22` §4, `18` Phase 4).
 *
 * WHAT IT IS FOR HERE, stated honestly, because this app is not the app the
 * technique was invented for. Pseudo-localization normally wins three prizes:
 * it finds strings that never went through i18n, it finds layout that breaks
 * when text grows, and it finds sentences assembled by concatenation. In this
 * repo the first is already won by `react/jsx-no-literals` plus
 * `scripts/check-i18n-keys.mjs`, and the second is partly won by the fact that
 * the app ships German, which runs about a third longer than English and is
 * driven at 1.8x text on a real device in the `21` §4 matrix.
 *
 * What is left, and what this exists for, is the third: a bracketed string makes
 * a SEAM visible. `[[Ťü ƒàïš màïñťéñàñť ƥàŕťïé ðé ]]` followed by a branch name
 * followed by `[[. Ťéš çülťéš…]]` shows instantly that one sentence was built
 * from two keys and a value, which no test and no screenshot of a real language
 * will ever point at. It also gives a reviewer a way to see EVERY screen at once
 * under text that is longer than any of the four real languages.
 *
 * DEV ONLY, and deliberately not a fifth language in the picker. It is switched
 * on with `EXPO_PUBLIC_PSEUDO_LOCALE=1` and is skipped entirely in a release
 * build, so there is no way for a member to land in it.
 */

/** Latin letters mapped to accented look-alikes: still legible, obviously not English. */
const ACCENTS: Record<string, string> = {
  a: 'à',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'ï',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'm̀',
  n: 'ñ',
  o: 'ô',
  p: 'ƥ',
  q: 'ɋ',
  r: 'ŕ',
  s: 'š',
  t: 'ť',
  u: 'ü',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'Å',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Ï',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ļ',
  M: 'M̀',
  N: 'Ñ',
  O: 'Ô',
  P: 'Ƥ',
  Q: 'Ɋ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ť',
  U: 'Ü',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

/**
 * The parts that must survive untouched, or the string stops working rather than
 * merely looking foreign: i18next interpolations (`{{name}}`, `{{count}}`) and
 * the numbered tags `Trans` reads (`<1>`…`</1>`, used by `rhythm:visiting`).
 * Accenting a placeholder does not degrade the copy, it deletes the value.
 */
const PROTECTED = /(\{\{[^}]*\}\}|<\/?\d+>)/g;

/** How much longer than English, roughly the worst case German reaches. */
const EXPANSION = 0.35;

function accent(text: string): string {
  // A regex replace rather than spreading the string: only ASCII letters are
  // mapped, so combining marks and anything non-Latin pass through whole. (It is
  // also what `no-misleading-character-class`'s sibling rule asks for: spreading
  // a string splits grapheme clusters.)
  return text.replace(
    /[a-zA-Z]/g,
    (character) => ACCENTS[character] ?? character,
  );
}

/**
 * One string, pseudo-localized. Brackets mark the ends so truncation is obvious;
 * the padding grows the string without inventing words that would wrap oddly.
 */
export function pseudoString(value: string): string {
  const accented = value
    .split(PROTECTED)
    .map((part, index) => (index % 2 === 0 ? accent(part) : part))
    .join('');
  const padding = '·'.repeat(Math.ceil(value.length * EXPANSION));
  return `[[${accented}${padding}]]`;
}

type Bag = { [key: string]: string | Bag };

/** A whole namespace bundle, pseudo-localized, keys and shape unchanged. */
export function pseudoBundle(bundle: Bag): Bag {
  const out: Bag = {};
  for (const [key, value] of Object.entries(bundle)) {
    out[key] =
      typeof value === 'string' ? pseudoString(value) : pseudoBundle(value);
  }
  return out;
}

/** Whether this build should offer the pseudo locale at all. */
export function pseudoEnabled(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_PSEUDO_LOCALE === '1';
}
