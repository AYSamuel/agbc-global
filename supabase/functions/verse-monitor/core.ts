// What the daily verse-queue alert says (docs/spec/21 §5 "verse queue monitor", `22` §1).
// Pure decisions; index.ts owns the database and the wire.
//
// The failure this exists for is named in `22` §1 and is worth restating, because it is not
// the one people expect: a missing day does NOT blank the verse card. The app asks for the
// newest verse dated on or before today, so a gap silently repeats an older verse. Every
// member sees a stale card for weeks, nobody gets an error, and the daily touchpoint dies
// quietly. Which is why this alert leads with the DATE it runs out and the verse members
// would be stuck on, rather than with a count of rows.

import type { OutgoingEmail } from '../_shared/email.ts';

/** One row of `public.verse_alert_batch()`. */
export interface DepthRow {
  recipient_id: string;
  recipient_email: string;
  recipient_name: string;
  /** The day this alert speaks for; the ledger dedupes on it. */
  subject: string;
  language: string;
  days_queued: number;
  runs_out_on: string | null;
  stale_from: string | null;
}

export interface LedgerEntry {
  recipient_id: string;
  kind: string;
  subject: string;
}

export interface Alert {
  recipientId: string;
  email: OutgoingEmail;
  entry: LedgerEntry;
}

export interface AlertOptions {
  from: string;
  dashboardUrl: string | null;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'German',
  nl: 'Dutch',
  fr: 'French',
};

/** One email per admin, listing every language below the floor. */
export function buildVerseAlerts(
  rows: DepthRow[],
  options: AlertOptions,
): Alert[] {
  const byRecipient = new Map<string, DepthRow[]>();
  for (const row of rows) {
    const existing = byRecipient.get(row.recipient_id);
    if (existing) existing.push(row);
    else byRecipient.set(row.recipient_id, [row]);
  }

  return [...byRecipient.values()].map((depths) => ({
    recipientId: depths[0].recipient_id,
    email: {
      from: options.from,
      to: depths[0].recipient_email,
      subject: subjectFor(depths),
      text: bodyFor(depths, options),
    },
    entry: {
      recipient_id: depths[0].recipient_id,
      kind: 'verse_depth',
      subject: depths[0].subject,
    },
  }));
}

function subjectFor(depths: DepthRow[]): string {
  const soonest = Math.min(...depths.map((depth) => depth.days_queued));
  const languages = depths.length === 1 ? 'The' : `${depths.length}`;
  const noun = depths.length === 1 ? 'verse queue' : 'verse queues';

  if (soonest <= 0) {
    return `AGBC verses: ${languages} ${noun} ${depths.length === 1 ? 'has' : 'have'} run out`;
  }
  return `AGBC verses: ${languages} ${noun} ${depths.length === 1 ? 'runs' : 'run'} out in ${soonest} ${soonest === 1 ? 'day' : 'days'}`;
}

function bodyFor(depths: DepthRow[], options: AlertOptions): string {
  const lines: string[] = [
    `Hello${greeting(depths[0].recipient_name)},`,
    '',
    'The daily verse queue is running low:',
    '',
  ];

  for (const depth of depths) {
    lines.push(`  - ${lineFor(depth)}`);
  }

  lines.push(
    '',
    // The consequence, spelled out, because it is the part that is not obvious.
    'A day with no verse does not show an error. The app falls back to the newest verse on or before today, so members simply keep seeing an old one.',
    '',
  );

  lines.push(
    options.dashboardUrl
      ? `Add the next batch: ${options.dashboardUrl.replace(/\/+$/, '')}/verses/import`
      : 'Add the next batch from the AGBC dashboard.',
  );

  return lines.join('\n');
}

function lineFor(depth: DepthRow): string {
  const language = LANGUAGE_NAMES[depth.language] ?? depth.language;
  const when =
    depth.days_queued <= 0
      ? 'has no verse for today'
      : `runs out on ${depth.runs_out_on} (${depth.days_queued} ${depth.days_queued === 1 ? 'day' : 'days'} left)`;
  const stuck = depth.stale_from
    ? `, and members would then be left on the verse for ${depth.stale_from}`
    : ', and there is no earlier verse to fall back on at all';

  return `${language} ${when}${stuck}`;
}

function greeting(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0];
  return first ? ` ${first}` : '';
}
