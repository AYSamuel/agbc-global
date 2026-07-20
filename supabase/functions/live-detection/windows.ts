// Pure service-window math (docs/spec/02: window = [start - 30 min,
// start + duration] in the BRANCH's timezone). Computed via Intl so DST is the
// platform's problem, not ours; minute-of-week arithmetic wraps midnight and
// Saturday-to-Sunday windows correctly. Deno-tested incl. DST transition days.

export interface ServiceWindow {
  /** 0 = Sunday .. 6 = Saturday (matches branch_services.weekday). */
  weekday: number;
  /** Branch-local wall clock, 'HH:MM' or 'HH:MM:SS'. */
  startTime: string;
  durationMin: number;
}

export const WINDOW_LEAD_MIN = 30;
const WEEK_MIN = 7 * 24 * 60;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// The instant's minute-of-week as read on a wall clock in the given zone.
export function localMinuteOfWeek(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekday = WEEKDAY_INDEX[get('weekday')];
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  if (weekday === undefined || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error(`unresolvable time zone: ${timeZone}`);
  }
  return weekday * 1440 + hour * 60 + minute;
}

export function isWithinServiceWindow(
  now: Date,
  timeZone: string,
  services: ServiceWindow[],
): boolean {
  const nowMin = localMinuteOfWeek(now, timeZone);
  return services.some((service) => {
    const [hh, mm] = service.startTime.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
    const start = service.weekday * 1440 + hh * 60 + mm;
    // Window relative to start; modulo arithmetic makes lead-across-midnight
    // (e.g. a 00:15 Sunday service leading into Saturday night) just work.
    const offset = (nowMin - (start - WINDOW_LEAD_MIN) + WEEK_MIN) % WEEK_MIN;
    return offset <= WINDOW_LEAD_MIN + service.durationMin;
  });
}
