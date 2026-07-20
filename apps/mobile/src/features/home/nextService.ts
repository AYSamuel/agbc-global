// Next-service selection (docs/spec/07 §3, docs/spec/02 window rule): pure
// minute-of-week math in the BRANCH's timezone, so nothing on Home assumes
// Glasgow. The window is [start - 30 min, start + duration]; inside it the card
// takes its live/imminent treatment.
//
// Wall-clock minute distance is deliberate rather than an absolute-instant
// countdown: converting a future wall-clock time back to an instant without a
// tz library is where DST bugs breed. The only cost is that a countdown
// spanning a DST change can read an hour off, which the coarse labels below
// never expose. Exact scheduling lives server-side with the reminder jobs
// (docs/spec/21 §5, W3.4).

export interface ServiceRow {
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  /** Branch-local wall clock, 'HH:MM' or 'HH:MM:SS'. */
  start_time: string;
  duration_min: number;
  kind: string;
  label: string;
}

export interface NextService {
  service: ServiceRow;
  /** Minutes until start; negative while the service is already running. */
  minutesUntil: number;
  /** Inside [start - 30, start + duration]: the card elevates. */
  isInWindow: boolean;
  /** Between start and start + duration. */
  isRunning: boolean;
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

/** The instant's minute-of-week as read on a wall clock in the given zone. */
export function localMinuteOfWeek(now: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    // Intl THROWS on an unknown zone (it does not degrade). A bad timezone
    // value must never crash Home: the caller renders the display-string
    // fallback instead.
    return -1;
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // Indexed access is unchecked in this config, so treat a miss as undefined.
  const weekday = WEEKDAY_INDEX[get('weekday')] as number | undefined;
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  if (weekday === undefined || Number.isNaN(hour) || Number.isNaN(minute)) {
    // An unknown zone must never crash Home: the caller renders the
    // display-string fallback instead.
    return -1;
  }
  return weekday * 1440 + hour * 60 + minute;
}

function startMinute(service: ServiceRow): number | null {
  const [hh, mm] = service.start_time.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return service.weekday * 1440 + hh * 60 + mm;
}

/**
 * The next service to show, or null when the branch has no usable schedule
 * (zero rows, or every row unparseable) so the caller falls back to the
 * `service_times` display strings (docs/spec/07 zero-rows rule).
 */
export function resolveNextService(
  services: ServiceRow[],
  timeZone: string,
  now: Date,
): NextService | null {
  const nowMin = localMinuteOfWeek(now, timeZone);
  if (nowMin < 0) return null;

  let best: NextService | null = null;
  for (const service of services) {
    const start = startMinute(service);
    if (start === null) continue;

    // Distance forward to this week's occurrence...
    const untilStart = (start - nowMin + WEEK_MIN) % WEEK_MIN;
    // ...but a service that started recently and is still running (or inside
    // its 30-minute lead) is the one to show, not the same slot next week.
    const sinceStart = (nowMin - start + WEEK_MIN) % WEEK_MIN;
    const isRunning = sinceStart > 0 && sinceStart <= service.duration_min;
    const isInLead = untilStart > 0 && untilStart <= WINDOW_LEAD_MIN;
    const atStart = untilStart === 0;

    const minutesUntil = isRunning || atStart ? -sinceStart : untilStart;
    const candidate: NextService = {
      service,
      minutesUntil,
      isInWindow: isRunning || isInLead || atStart,
      isRunning: isRunning || atStart,
    };

    // Running/imminent wins outright; otherwise the soonest upcoming start.
    if (best === null) {
      best = candidate;
      continue;
    }
    if (candidate.isInWindow && !best.isInWindow) {
      best = candidate;
      continue;
    }
    if (!best.isInWindow && !candidate.isInWindow) {
      if (candidate.minutesUntil < best.minutesUntil) best = candidate;
    }
  }
  return best;
}

/** Coarse day bucket for the eyebrow; exact countdowns are not attempted. */
export function dayBucket(
  minutesUntil: number,
): 'now' | 'today' | 'tomorrow' | 'later' {
  if (minutesUntil <= 0) return 'now';
  if (minutesUntil < 24 * 60) return 'today';
  if (minutesUntil < 48 * 60) return 'tomorrow';
  return 'later';
}

/** 'HH:MM[:SS]' branch-local wall clock rendered for the user's locale. */
export function formatServiceTime(startTime: string, locale: string): string {
  const [hh, mm] = startTime.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return '';
  // A fixed UTC instant carrying the wall-clock parts, formatted in UTC: no
  // zone conversion happens, so the branch-local time renders as written.
  const carrier = new Date(Date.UTC(2000, 0, 2, hh, mm));
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(carrier);
}

/** Weekday name for the service's slot, in the user's locale. */
export function formatServiceDay(weekday: number, locale: string): string {
  // 2000-01-02 was a Sunday: adding the index lands on the right weekday.
  const carrier = new Date(Date.UTC(2000, 0, 2 + weekday));
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(carrier);
}
