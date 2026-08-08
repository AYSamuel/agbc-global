// Rendering a `service_date` (docs/spec/02: a DATE, never an instant).
//
// The timezone already acted, once, at write time, in the branch attended
// (`attendance_service_date`). Parsing "2026-07-26" with `new Date()` and
// formatting it in the DEVICE's zone would apply a second one, and west of UTC
// that silently renders the Saturday before: a member in Ogbomosho and a member
// in Glasgow would see different dates for the same gathering. So the date is
// carried as a fixed UTC instant and formatted in UTC, which is the same trick
// features/events uses for wall-clock event times, for the same reason.

/** 'YYYY-MM-DD' as a UTC-midnight instant, or null if it is not a date. */
function carrier(serviceDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDate);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // `Date.UTC` ROLLS OVER rather than refusing: month 13 day 40 is a real
  // instant in the following February, so an unusable value would render as a
  // confident, wrong date instead of as nothing. Only a round trip catches it.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * The attendance row's date line: the frame's "Sun 26 Jul".
 *
 * Field ORDER is the locale's, not the frame's: `Intl` puts the day first for
 * en-GB and the month first for en-US, and fighting that would be the one place
 * in the app that hand-rolls a date (docs/spec/16 asks for `Intl` throughout).
 */
export function formatAttendanceDate(
  serviceDate: string,
  locale: string,
): string {
  const date = carrier(serviceDate);
  if (date === null) return '';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** The lapsed hero's footnote date: the frame's "Sunday 5 July". */
export function formatGatheredDate(
  serviceDate: string,
  locale: string,
): string {
  const date = carrier(serviceDate);
  if (date === null) return '';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}
