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
 * The website's `format` column, shown as it was written.
 *
 * THERE IS NOTHING TO MAP, and the map that used to be here was built against the wrong
 * vocabulary. `intensive` and `part_time` are the keys of `courses.formats`, our catalogue's
 * own duration object, which the app reads (`apps/mobile/src/features/academy/queries.ts`).
 * They are not what the website writes here. `Desktop/agbc`'s RegistrationForm.astro posts
 * `value={`Intensive (${intensive})`}`, described there as "a stable, locale-independent
 * label (posted to the server + shown on the Stripe receipt)", so a real row holds
 * "Intensive (2 weeks)" or "Part-time (6 weeks)" and the duration varies per course. `online`
 * was never an option on that form at all.
 *
 * So every production row fell through the map to the raw value, which reads perfectly well:
 * the mapping was dead in life while its comment framed the raw value as the exception. Kept
 * as a function rather than inlined so the reasoning has somewhere to live, because the
 * instinct on seeing a bare website string on screen is to add exactly that map back.
 *
 * `02`'s contract forbids us constraining this column, so a value we have never seen is a
 * real possibility and must render as itself. That is now the only behaviour.
 */
export function formatName(raw: string): string {
  return raw;
}
