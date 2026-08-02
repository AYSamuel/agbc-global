import { copy } from '@/copy/en';

/**
 * The two things every verse surface has to render: a language, and a day.
 *
 * Shared rather than repeated, because the schedule, the form and the edit route all show
 * the same date in the same two shapes, and a list that said "14 August" beside a form that
 * said "08/14/2026" would read as two different products.
 */

/** The reader's word for a language code, falling back to the code itself. */
export function nameOf(language: string): string {
  return copy.verses.languageNames[language] ?? language;
}

/** "14 August", the form the frames use. Year omitted: the queue is months, not years. */
export function humanDate(iso: string | null): string {
  if (!iso) return '';
  return format(iso, { day: 'numeric', month: 'long' });
}

/** "14 August 2026": one verse, so the year is worth the room a list row denies it. */
export function fullDate(iso: string): string {
  return format(iso, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * `en-GB`, not `en`. Plain `en` is US-ordered and renders "August 14"; the frames say
 * "14 August", and so does everyone in Glasgow, Berlin, Emmen and Ogbomosho.
 *
 * UTC throughout: a `date` column is a calendar day with no time in it, and parsing one in
 * the machine's own zone moves it backwards a day for anybody west of Greenwich.
 */
function format(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    ...options,
    timeZone: 'UTC',
  });
}
