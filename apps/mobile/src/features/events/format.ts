// Event time handling (docs/spec/11, docs/spec/02): events store wall-clock
// local time plus an IANA zone (`starts_at_local` + `timezone`), never a
// pre-converted instant. Display stays in the EVENT's zone (rendered via the
// UTC-carrier trick, no conversion); "is it past" compares wall clocks in the
// event's zone (safe direction through Intl, like home/nextService.ts); only
// the ministry-wide "your time" line converts wall → instant, via the standard
// two-pass offset technique (exact except inside a DST jump, where the coarse
// label never shows the difference).

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** PostgREST timestamp shape: 'YYYY-MM-DDTHH:MM:SS' (no zone suffix). */
export function parseWallClock(value: string): WallClock | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
}

/** The instant's wall clock as read in the given zone; null on a bad zone. */
export function instantWallClock(
  now: Date,
  timeZone: string,
): WallClock | null {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // Intl throws on unknown zones; a bad value must never crash Events.
    return null;
  }
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wall = {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
  return Object.values(wall).some(Number.isNaN) ? null : wall;
}

function wallKey(wall: WallClock): number {
  return (
    wall.year * 1e8 +
    wall.month * 1e6 +
    wall.day * 1e4 +
    wall.hour * 100 +
    wall.minute
  );
}

/**
 * Started/past = the event's wall-clock start is behind the current wall clock
 * in the event's own zone. Unparseable input counts as upcoming (fail open;
 * the server-side RSVP trigger is the boundary that matters, docs/spec/02).
 */
export function isPastEvent(
  startsAtLocal: string,
  timeZone: string,
  now: Date,
): boolean {
  const start = parseWallClock(startsAtLocal);
  const current = instantWallClock(now, timeZone);
  if (start === null || current === null) return false;
  return wallKey(start) < wallKey(current);
}

/** A fixed UTC instant carrying the wall-clock parts (format-only, no zone math). */
function carrier(wall: WallClock): Date {
  return new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute),
  );
}

/** { day: '24', month: 'Aug' } for the mockup's date block / badge. */
export function eventDateParts(
  startsAtLocal: string,
  locale: string,
): { day: string; month: string } | null {
  const wall = parseWallClock(startsAtLocal);
  if (wall === null) return null;
  const date = carrier(wall);
  return {
    day: new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      timeZone: 'UTC',
    }).format(date),
    month: new Intl.DateTimeFormat(locale, {
      month: 'short',
      timeZone: 'UTC',
    }).format(date),
  };
}

/** '7:00 PM', in the event's own zone. */
export function formatEventTime(startsAtLocal: string, locale: string): string {
  const wall = parseWallClock(startsAtLocal);
  if (wall === null) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(carrier(wall));
}

/** 'Saturday', in the event's own zone. */
export function formatEventDay(startsAtLocal: string, locale: string): string {
  const wall = parseWallClock(startsAtLocal);
  if (wall === null) return '';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(carrier(wall));
}

/**
 * The event's start as a real instant, for the viewer-local line on
 * ministry-wide events. Two passes: read the zone's offset at a UTC guess,
 * adjust, and re-read so a DST boundary between guess and truth is absorbed.
 */
export function wallClockToInstant(
  startsAtLocal: string,
  timeZone: string,
): Date | null {
  const wall = parseWallClock(startsAtLocal);
  if (wall === null) return null;
  const guess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  );

  const offsetAt = (ms: number): number | null => {
    const zoned = instantWallClock(new Date(ms), timeZone);
    if (zoned === null) return null;
    return (
      Date.UTC(
        zoned.year,
        zoned.month - 1,
        zoned.day,
        zoned.hour,
        zoned.minute,
      ) - ms
    );
  };

  const first = offsetAt(guess);
  if (first === null) return null;
  const second = offsetAt(guess - first);
  if (second === null) return null;
  return new Date(guess - second);
}

/** 'Saturday, 6:00 PM' in the DEVICE's zone (the "your time" line). */
export function formatViewerDayTime(instant: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(instant);
}
