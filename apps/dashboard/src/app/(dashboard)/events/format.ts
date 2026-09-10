/**
 * An event's wall clock, in words (W3.5 slice 4).
 *
 * `02` stores an event as a wall clock plus an IANA zone, precisely so a change in that
 * zone's law cannot move a church service, and `11` shows every event in ITS OWN zone. So
 * the parts are carried into a UTC instant and formatted as UTC: no conversion, no offset,
 * and a Glasgow leader reading a Berlin event sees Berlin's clock rather than their own.
 * The same carrier trick the app uses (`features/events/format.ts`) and the sender uses
 * (`_shared/pushTemplates.formatWhen`), for the same reason in all three places.
 *
 * `en-GB` like every other date in this dashboard (`verses/format.ts` records why:
 * day-before-month is how every branch reads a date).
 */
export function eventWhen(startsAtLocal: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(
    startsAtLocal,
  );
  if (!match) return '';
  const [, year, month, day, hour, minute] = match;
  const carrier = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ),
  );
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(carrier);
}

/**
 * An INSTANT, in the reader's own zone: "Thu 20 Aug, 10:05".
 *
 * Deliberately not `eventWhen`, and the difference is the whole reason both exist. An
 * event's start is a wall clock in the branch's zone and is never converted; a status stamp
 * is a moment that actually happened, so it reads correctly for whoever is looking at it.
 * Passing one to the other is a category error that prints a plausible wrong time, which is
 * the worst kind.
 *
 * `en-GB` like every other date in this dashboard (`verses/format.ts` records why).
 */
export function changedOn(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTimestamp));
}
