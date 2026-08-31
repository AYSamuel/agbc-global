/**
 * The dates on the Academy screens (#164, frames approved 2026-08-31).
 *
 * `en-GB` like every other date in this dashboard (`verses/format.ts` records why:
 * day-before-month is how every branch reads a date).
 *
 * Day and month, with the YEAR added only when it is not this one. The frames show
 * "29 August", which is right for the rows an admin works this week and quietly wrong for
 * the permanent residents: a registration from two Julys ago reading "3 July" invites
 * somebody to treat a two-year-old payment as a fortnight old, and this queue is exactly
 * where old rows accumulate (SPEC decision 4).
 */
export function onDate(isoTimestamp: string, now: number = Date.now()): string {
  const when = new Date(isoTimestamp);
  const sameYear = when.getFullYear() === new Date(now).getFullYear();

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(when);
}

/**
 * The website's `format` column, in words.
 *
 * A website value rather than one of ours, so it is mapped rather than trusted: `02` names
 * the column as the site's and the contract forbids us constraining it, which means a value
 * we have never seen is a real possibility and must render as itself instead of as blank.
 */
export function formatName(raw: string): string {
  const known: Record<string, string> = {
    intensive: 'Intensive',
    part_time: 'Part time',
    online: 'Online',
  };
  return known[raw] ?? raw;
}
