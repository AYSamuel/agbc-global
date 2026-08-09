// Adding an event to the device calendar (docs/spec/11 §EVENT-DETAIL).
//
// `expo-calendar` is a NATIVE module added at W2.9, so a dev client built before
// that build does not contain it, and importing it at the top of a file would
// crash the route rather than degrade it. Loaded through the same guarded
// require `features/give/CopyRow` and `features/notifications/permission` use.
//
// The event's INSTANT is computed here from its wall clock and its own timezone,
// not from the device's: an event stores "Saturday 19:00 in Europe/Berlin" and a
// calendar entry needs the moment that actually is (docs/spec/02, and the same
// `wallClockToInstant` the "your time" line uses).
//
// Written against expo-calendar 57's API, which is NOT the one most examples
// show: there is no `requestCalendarPermissionsAsync`, no `createEventAsync`,
// and `getDefaultCalendarAsync` is gone. Events are created on a calendar
// OBJECT, and Android has no single default calendar to create them on, so one
// has to be chosen. The first version of this file called the old names, the
// guarded require still succeeded, and every call threw into the catch below as
// "we couldn't add it" (found on device, 2026-08-09).

import { Platform } from 'react-native';

import { wallClockToInstant } from './format';

interface CalendarObject {
  id: string;
  title: string;
  allowsModifications: boolean;
  /** Android's nearest thing to a default: the account's primary calendar. */
  isPrimary?: boolean;
  createEvent: (details: Record<string, unknown>) => Promise<unknown>;
}

interface CalendarModule {
  requestCalendarPermissions: () => Promise<{ status: string }>;
  getCalendars: () => Promise<CalendarObject[]>;
  /** iOS only; throws on Android, which is why it is never called there. */
  getDefaultCalendarSync?: () => CalendarObject;
}

/**
 * The require stays guarded (the native fence), but the cast goes through the
 * REAL module's types rather than straight to ours. That one hop is what makes
 * a renamed or removed API a compile error here instead of a silent `failed`
 * toast on somebody's phone, which is exactly how this file shipped wrong the
 * first time. `typeof import(...)` is erased at build time, so nothing is
 * loaded that the fence would not allow.
 */
function load(): CalendarModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('expo-calendar') as typeof import('expo-calendar');
    return module;
  } catch {
    return null;
  }
}

const Calendar = load();

export type CalendarOutcome = 'added' | 'denied' | 'unavailable' | 'failed';

export function calendarAvailable(): boolean {
  return Calendar !== null;
}

export interface CalendarEvent {
  title: string;
  /** Wall clock in the event's own zone, 'YYYY-MM-DDTHH:MM'. */
  startsAtLocal: string;
  endsAtLocal: string | null;
  timeZone: string;
  location: string | null;
  notes: string | null;
}

/**
 * The calendar to write into.
 *
 * iOS has a real default. Android does not: it exposes one calendar per account
 * (work, personal, birthdays, holidays), some of them read-only, so the choice
 * is ours to make. Primary and writable first, then merely writable, and never
 * a read-only one, because writing there fails at the native layer.
 */
async function writableCalendar(
  module: CalendarModule,
): Promise<CalendarObject | null> {
  if (Platform.OS === 'ios' && module.getDefaultCalendarSync) {
    try {
      return module.getDefaultCalendarSync();
    } catch {
      // Fall through to the list: a missing default is not a dead end.
    }
  }

  const calendars = await module.getCalendars();
  const writable = calendars.filter((entry) => entry.allowsModifications);
  // `.at` rather than `[0]`: an empty list is a real possibility here (a device
  // with only read-only calendars), and it should read as "none" rather than as
  // an index the types promise is always there.
  return (
    writable.find((entry) => entry.isPrimary === true) ?? writable.at(0) ?? null
  );
}

/**
 * Writes the event to the member's calendar.
 *
 * `denied` is a real answer and not a failure: `06` says a refused permission
 * degrades gracefully and the action it accompanies still stands, so the RSVP
 * is untouched either way and the screen says so rather than apologising.
 */
export async function addEventToCalendar(
  event: CalendarEvent,
): Promise<CalendarOutcome> {
  if (Calendar === null) return 'unavailable';

  const start = wallClockToInstant(event.startsAtLocal, event.timeZone);
  if (start === null) return 'failed';
  const end =
    event.endsAtLocal === null
      ? null
      : wallClockToInstant(event.endsAtLocal, event.timeZone);

  try {
    const permission = await Calendar.requestCalendarPermissions();
    if (permission.status !== 'granted') return 'denied';

    const calendar = await writableCalendar(Calendar);
    if (calendar === null) return 'failed';

    await calendar.createEvent({
      title: event.title,
      startDate: start,
      // An event with no end still needs one: an hour is the least surprising
      // guess, and the entry says the branch's own start time either way.
      endDate: end ?? new Date(start.getTime() + 60 * 60_000),
      timeZone: event.timeZone,
      location: event.location ?? undefined,
      notes: event.notes ?? undefined,
    });
    return 'added';
  } catch {
    return 'failed';
  }
}
