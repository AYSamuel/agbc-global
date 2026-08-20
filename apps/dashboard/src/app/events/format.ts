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
