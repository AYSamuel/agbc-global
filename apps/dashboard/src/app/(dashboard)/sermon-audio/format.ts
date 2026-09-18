/**
 * The one date shape every shelf surface shows: "Sunday 9 August", and "Sunday 12 May
 * 2019" once the message is from another year.
 *
 * The weekday leads because it is the fact that matters on this screen: the weekly task
 * is "Sunday's message", and a list of bare dates makes the reader do that arithmetic.
 * `en-GB` and UTC for the reasons `verses/format.ts` records: day-before-month is how
 * every branch reads a date, and parsing in the machine's own zone moves a timestamp
 * backwards a day for anybody west of Greenwich.
 *
 * THE YEAR ARRIVED WITH THE ARCHIVE (W4.21, 2026-09-18). This function used to drop it
 * always, and said so: "the queue is months not years". That was TRUE of every shelf
 * this screen had ever drawn, because the list was the newest 30 messages and they are
 * all within a few weeks. Slice 1 makes the sync walk the whole channel and slice 2
 * lets you search it, so the very first search returned "Sunday 14 February" for a 2021
 * message sitting above a 2019 one. Found by looking at the real screen; no test could
 * have known the assumption had expired.
 *
 * Conditional rather than always-on, so the weekly job is unchanged: this year's
 * messages read the way they always have, and a year appears exactly when it carries
 * information. The clock is an argument because a function that reads the wall clock is
 * a function that cannot be tested in December.
 */
export function preachedOn(
  isoTimestamp: string,
  now: Date = new Date(),
): string {
  const when = new Date(isoTimestamp);
  const base = when.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  if (when.getUTCFullYear() === now.getUTCFullYear()) return base;

  // Appended rather than asked of Intl, which punctuates differently the moment a year
  // is present: `en-GB` gives "Sunday 12 May" but "Sunday, 12 May 2019". In a list where
  // some rows carry a year and some do not, that comma makes one column read as two
  // different shapes, which is worse than the ambiguity this was fixing.
  return `${base} ${String(when.getUTCFullYear())}`;
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
