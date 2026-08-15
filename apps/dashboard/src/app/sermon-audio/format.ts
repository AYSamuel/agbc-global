/**
 * The one date shape every shelf surface shows: "Sunday 9 August".
 *
 * The weekday leads because it is the fact that matters on this screen: the weekly task
 * is "Sunday's message", and a list of bare dates makes the reader do that arithmetic.
 * `en-GB` and UTC for the reasons `verses/format.ts` records: day-before-month is how
 * every branch reads a date, and parsing in the machine's own zone moves a timestamp
 * backwards a day for anybody west of Greenwich.
 */
export function preachedOn(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "4 August", for "shelved 4 August": the day alone, the queue is months not years. */
export function shortDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** Whole minutes for display: 42, never 41.7. Display metadata, not authority. */
export function wholeMinutes(durationSec: number): number {
  return Math.max(1, Math.round(durationSec / 60));
}

/** Whole MB for display, from bytes. */
export function wholeMb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1048576));
}

/**
 * Whole KB, the unit artwork actually lives in (W3.1 slice 5). A cover is ~400 KB, and
 * `wholeMb` would print every one of them as "1 MB", which is a number that teaches the
 * reader nothing about the file they just chose.
 */
export function wholeKb(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024));
}
