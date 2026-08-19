// What the daily verse-queue alert says (docs/spec/21 §5 "verse queue monitor", `22` §1).
// Pure decisions; index.ts owns the database and the wire.
//
// The failure this exists for is named in `22` §1 and is worth restating, because it is not
// the one people expect: a missing day does NOT blank the verse card. The app asks for the
// newest verse dated on or before today, so a gap silently repeats an older verse. Every
// member sees a stale card for weeks, nobody gets an error, and the daily touchpoint dies
// quietly. Which is why this alert leads with the DATE it runs out and the verse members
// would be stuck on, rather than with a count of rows.

import type { EmailSender, OutgoingEmail } from '../_shared/email.ts';

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

// --- the weekly Resend canary (`21` §6.8; W3.4 slice 3) ------------------------------
//
// "Weekly, the verse-monitor job sends itself one email via Resend and pings a dedicated
// dead-man check (email verification otherwise fails silently until a buyer hits it)."
//
// It rides THIS job because this job already runs daily and already holds a Resend sender,
// and because the two failures are the same failure seen from different sides: an alert
// nobody receives and a queue nobody refills end the same way.
//
// WEEKLY WITH NO LEDGER, which is the part worth explaining. Every other repeated send in
// this project writes a `job_alerts` row so it cannot repeat, and this one deliberately does
// not: the ledger's `recipient_id` references a profile and the canary has no recipient but
// itself, so joining it would mean either a fake profile or a second mechanism. Keying off
// the WEEKDAY instead is stateless, and the cost of the alternative failure is one duplicate
// email to our own inbox on a day somebody re-ran the job by hand.

/** Monday. `getUTCDay()` rather than local time: the schedule is UTC and so is this. */
export function isCanaryDay(now: Date): boolean {
  return now.getUTCDay() === 1;
}

/**
 * The canary itself: from us, to us, saying only that the path works.
 *
 * The date is in the body so a stale message in an inbox is obvious, and the subject is
 * stable so it can be filtered. Nothing about members, nothing about the queue.
 */
export function buildCanaryEmail(from: string, now: Date): OutgoingEmail {
  const day = now.toISOString().slice(0, 10);
  return {
    from,
    to: from,
    subject: 'AGBC email canary',
    text: [
      `This is the weekly check that Resend is still delivering for AGBC (${day}).`,
      '',
      'It is sent by the verse-monitor job and pings its own healthchecks.io check.',
      'If this stops arriving, sign-in codes and staff alerts have stopped too.',
    ].join('\n'),
  };
}

export type CanaryOutcome = 'not due' | 'unconfigured' | 'sent' | 'failed';

/**
 * Run the canary, or decide it is not due.
 *
 * The whole orchestration lives HERE, with its sender and its ping injected, rather than in
 * index.ts. It was written there first and that was a mistake worth recording: the only
 * input deciding whether it runs is the wall clock, so the four branches could be reached
 * on a laptop only by editing `isCanaryDay` to return true and restarting the edge runtime.
 * A once-a-week path that can only be exercised by editing it is a path nobody exercises.
 *
 * NEVER THROWS, and it pings its OWN check rather than the verse monitor's. The verse queue
 * and the mail path are two separate facts, and an email outage must not make the queue look
 * stocked or starved.
 *
 * An unconfigured environment on a Monday pings FAILURE rather than returning quietly, which
 * is ADR 0016's rule read at its word: a run that finds email unconfigured is a failed run,
 * not a successful no-op. Locally that ping is a no-op because the URL is absent.
 */
export async function runCanary(
  now: Date,
  deps: {
    send: EmailSender | null;
    from: string | null;
    ping: (ok: boolean) => Promise<void>;
  },
): Promise<CanaryOutcome> {
  if (!isCanaryDay(now)) return 'not due';

  if (!deps.send || !deps.from) {
    console.error(
      'verse-monitor: the weekly email canary cannot send (Resend unconfigured)',
    );
    await deps.ping(false);
    return 'unconfigured';
  }

  try {
    await deps.send(buildCanaryEmail(deps.from, now));
    await deps.ping(true);
    return 'sent';
  } catch (error) {
    // No address in the line (docs/spec/20), and no rethrow: the queue check still runs.
    console.error(
      'verse-monitor: the weekly email canary failed to send:',
      error instanceof Error ? error.message : 'unknown',
    );
    await deps.ping(false);
    return 'failed';
  }
}
