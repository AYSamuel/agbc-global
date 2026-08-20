// A `notifications` row into words and a glyph (docs/spec/15, W3.3 slice 5).
//
// Rows come in two shapes and the centre renders both: an automated row stores a
// TEMPLATE KEY + params and is rendered here, in the member's language, from the
// same catalogue `_shared/pushTemplates.ts` renders at send time (the key and its
// params are the contract; the words live twice by design, once per runtime). A
// broadcast row (W3.5) arrives pre-rendered in the recipient's language and its
// `title`/`body` pass straight through.
//
// Like the server half, nothing here throws: an unknown key falls back to the
// generic line, because a template typo must not blank a member's log.

import type { TFunction } from 'i18next';

import { formatEventWhen } from '../events/format';

export interface RenderedNotification {
  title: string;
  body: string;
}

/**
 * Template keys are dotted (`prayer.someone_prayed`) and the locale files nest
 * them the same way, so the lookup is `notifications:templates.<key>.<part>`.
 * Params pass through i18next interpolation; `count` also drives its plural
 * rules, which is how "{{count}} people said Glory" gets DE/NL/FR's own rules
 * rather than English's.
 *
 * Unknown keys are detected by the empty `defaultValue` coming back, not by
 * `i18n.exists`: a plural key exists only as `title_one`/`title_other`, which
 * `exists` cannot see without a count, and `t` resolves either way.
 */
export function renderNotification(
  t: TFunction,
  row: {
    templateKey: string | null;
    params: Record<string, string | number> | null;
    title: string | null;
    body: string | null;
  },
  locale: string,
): RenderedNotification {
  // Pre-rendered broadcast rows: the words already happened at fan-out.
  if (row.templateKey === null) {
    if (row.title !== null && row.title !== '') {
      return { title: row.title, body: row.body ?? '' };
    }
    return generic(t);
  }

  const base = `notifications:templates.${row.templateKey}`;
  const params = localizeParams(row.params ?? {}, locale);
  const title = t(`${base}.title`, { ...params, defaultValue: '' });
  const body = t(`${base}.body`, { ...params, defaultValue: '' });
  if (title === '') return generic(t);
  return { title, body };
}

/**
 * Params holding a wall clock become words here, not at send time.
 *
 * The server writes `when` as the event's raw `starts_at_local` (W3.5 slice 4), because a
 * date formatted when the ROW was written would be frozen in one language for every reader
 * of it. So both renderers format it themselves, from the same value, with the same option
 * bag: `_shared/pushTemplates.formatWhen` for the push, this for the centre.
 *
 * The convention is the param NAME, exactly as on the server. A key that wants a second
 * date adds its name to both sides on purpose rather than by accident.
 */
function localizeParams(
  params: Record<string, string | number>,
  locale: string,
): Record<string, string | number> {
  const when = params.when;
  if (typeof when !== 'string') return params;
  return { ...params, when: formatEventWhen(when, locale) };
}

function generic(t: TFunction): RenderedNotification {
  return {
    title: t('notifications:generic.title'),
    body: t('notifications:generic.body'),
  };
}

/**
 * The frame's icon-disc vocabulary (`.nci` and its tints): prayer wears the
 * green wash, Glory the gold one, transactional confirmations the blue one,
 * and scheduled/broadcast rows sit on the plain alt disc. The TYPE decides,
 * because that is the routing key the schema already carries (20260816120000's
 * CHECK lists exactly these).
 */
export type NotificationTint = 'pray' | 'glory' | 'txn' | 'plain';

export function tintForType(type: string): NotificationTint {
  switch (type) {
    case 'prayer':
      return 'pray';
    case 'testimony_glory':
      return 'glory';
    case 'moderation':
    case 'rsvp_reminder':
    case 'registration':
    case 'purchase':
    // An event notice answers an RSVP the member made, which is what the blue disc means
    // here; the postings (`event`, `ministry`) stay on the plain disc below with the rest
    // of the church's news.
    case 'event_change':
      return 'txn';
    default:
      // service_reminder, ministry, branch, event, and anything a later
      // migration adds before this map learns it.
      return 'plain';
  }
}
