// Display formatting for Family surfaces. Pure functions only; every user-visible
// string is composed at the call site from i18n keys, never assembled here.

/**
 * The mockup's meta lines read "2h", "5h", "1d". Returned as a unit + count pair
 * so the caller can translate it: German and French pluralize differently, and a
 * baked "2h" would be the one string that never localizes (docs/spec/16).
 */
export type RelativeAge =
  | { unit: 'now' }
  | { unit: 'minute' | 'hour' | 'day'; count: number }
  | { unit: 'date'; iso: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Past a week, "9d" stops meaning anything; the mockup's meta line gives way to a
// real date, which is also what the detail screens show.
const RELATIVE_CEILING = 7 * DAY;

export function relativeAge(iso: string, now: Date): RelativeAge {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return { unit: 'date', iso };
  // Clamp future timestamps to "now": a device clock running fast must never
  // render "in -3 hours" on a testimony.
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  if (elapsed >= RELATIVE_CEILING) return { unit: 'date', iso };
  if (elapsed < MINUTE) return { unit: 'now' };
  if (elapsed < HOUR) {
    return { unit: 'minute', count: Math.floor(elapsed / MINUTE) };
  }
  if (elapsed < DAY) return { unit: 'hour', count: Math.floor(elapsed / HOUR) };
  return { unit: 'day', count: Math.floor(elapsed / DAY) };
}

export function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

// The first whole code point of a string: correct for accented letters and
// astral characters where charAt / [0] would split a surrogate pair, and without
// spreading the string (which the lint rules flag for the same hazard).
function firstCodePoint(value: string): string {
  const cp = value.codePointAt(0);
  return cp === undefined ? '' : String.fromCodePoint(cp);
}

// The mockup's .av circle holds one or two letters: first initial for a single
// name, first + last for a full name.
export function initials(name: string | null): string {
  if (!name) return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = firstCodePoint(words[0] ?? '');
  if (words.length === 1) return first.toUpperCase();
  const last = firstCodePoint(words[words.length - 1] ?? '');
  return (first + last).toUpperCase();
}

export function joinMeta(parts: (string | null)[]): string {
  return parts.filter((p): p is string => p !== null && p !== '').join(' · ');
}
