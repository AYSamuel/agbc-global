// What the hourly moderation digest says, and to whom (docs/spec/09 §Freshness safeguard,
// `17` §1). Pure decisions: index.ts owns the database and the wire.
//
// WHY THE EMAIL IS THIN. It carries counts, branches and ages, and never a word of what was
// written. Testimonies and prayer requests are special-category data (`20`), an inbox is a
// third party's copy of it forever, and the whole point of the dashboard is that the words
// are read where they can be acted on. The batch does not return bodies, so this cannot
// accidentally include one; the rule is restated here because the temptation ("just the first
// line, so they know what it is about") arrives with the first person who asks for it.
//
// WHY IT IS IN ENGLISH while the app carries four languages. The dashboard is a staff tool
// and is English-only by decision (W2.7 slice 1, `CLAUDE.md`); an email whose only purpose is
// to send someone to an English screen should not arrive in German. `15`'s per-recipient
// rendering rule is about MEMBER notifications, which this is not.

import type { OutgoingEmail } from '../_shared/email.ts';

export type AlertKind =
  | 'queue_new'
  | 'queue_overdue'
  | 'report_new'
  | 'report_overdue';

/** One row of `public.moderation_alert_batch()`. */
export interface AlertRow {
  recipient_id: string;
  recipient_email: string;
  recipient_name: string;
  recipient_role: string;
  kind: AlertKind;
  subject: string;
  item_kind: string;
  branch_id: string;
  branch_name: string;
  waiting_since: string;
  is_safeguarding: boolean;
}

/** What `public.record_job_alerts()` takes: only ever written after the mail is away. */
export interface LedgerEntry {
  recipient_id: string;
  kind: string;
  subject: string;
}

export interface Digest {
  recipientId: string;
  email: OutgoingEmail;
  entries: LedgerEntry[];
}

export interface DigestOptions {
  from: string;
  /** Base URL of the dashboard, or null when the deployment has not been told it. */
  dashboardUrl: string | null;
  now: Date;
}

/** Urgency order, and the order the lines appear in: reports before posts, late before new. */
const KIND_ORDER: AlertKind[] = [
  'report_overdue',
  'report_new',
  'queue_overdue',
  'queue_new',
];

const OVERDUE_KINDS: AlertKind[] = ['report_overdue', 'queue_overdue'];

/**
 * Which line an escalation replaces, for the one reader who gets both.
 *
 * An admin is the fallback moderator for a branch with no leader AND the recipient of every
 * escalation, so a single old post in such a branch reaches them twice: once as waiting, once
 * as waiting too long. Left alone the email says "1 post waiting more than 48 hours" and "1
 * post waiting for review" about the same post, which reads as two (found in the first live
 * run, 2026-08-06). The escalation is the truer sentence, so it wins the LINE. Both ledger
 * entries are still written: the reader has now been told about that item under both headings
 * and neither should come back next hour.
 */
const SUPERSEDED_BY: Partial<Record<AlertKind, AlertKind>> = {
  queue_new: 'queue_overdue',
  report_new: 'report_overdue',
};

/** How many branches a line names before it stops listing them. */
const BRANCHES_NAMED = 3;

/**
 * One email per recipient, however many things are waiting for them.
 *
 * A digest rather than a message per item, decided with Ayo 2026-08-06: a busy Sunday would
 * otherwise fill a leader's inbox with near-identical mail, which is how people learn to
 * filter the alert away, and Resend's free tier is shared with the OTP sign-in emails that
 * must never lose a slot to a nudge (`21` §9).
 */
export function buildDigests(
  rows: AlertRow[],
  options: DigestOptions,
): Digest[] {
  const byRecipient = new Map<string, AlertRow[]>();
  for (const row of rows) {
    const existing = byRecipient.get(row.recipient_id);
    if (existing) existing.push(row);
    else byRecipient.set(row.recipient_id, [row]);
  }

  return [...byRecipient.values()].map((alerts) => {
    const shown = worthSaying(alerts);
    return {
      recipientId: alerts[0].recipient_id,
      email: {
        from: options.from,
        to: alerts[0].recipient_email,
        subject: subjectFor(shown),
        text: bodyFor(shown, options),
      },
      entries: alerts.map((alert) => ({
        recipient_id: alert.recipient_id,
        kind: alert.kind,
        subject: alert.subject,
      })),
    };
  });
}

/** Drops the "waiting" line for an item this same reader is also being escalated. */
function worthSaying(alerts: AlertRow[]): AlertRow[] {
  const escalated = new Set(
    alerts
      .filter((alert) => OVERDUE_KINDS.includes(alert.kind))
      .map((alert) => alert.subject),
  );
  return alerts.filter(
    (alert) => !(SUPERSEDED_BY[alert.kind] && escalated.has(alert.subject)),
  );
}

function subjectFor(alerts: AlertRow[]): string {
  const overdue = alerts.filter((alert) => OVERDUE_KINDS.includes(alert.kind));
  const counted = overdue.length > 0 ? overdue : alerts;
  const tail =
    overdue.length > 0 ? 'waiting more than 48 hours' : 'waiting for review';

  return `AGBC dashboard: ${counted.length} ${nounFor(counted, counted.length)} ${tail}`;
}

function bodyFor(alerts: AlertRow[], options: DigestOptions): string {
  const lines: string[] = [`Hello${greeting(alerts[0].recipient_name)},`, ''];

  if (alerts.some((alert) => alert.is_safeguarding)) {
    // Said first and said plainly. A flagged report is the one thing here that cannot wait
    // for a convenient moment (`17` §1 safeguarding guideline, `20`).
    lines.push(
      'One of the reports below is flagged as a safeguarding concern. Please open that one first.',
      '',
    );
  }

  lines.push('Waiting for you in the AGBC dashboard:', '');
  for (const kind of KIND_ORDER) {
    const group = alerts.filter((alert) => alert.kind === kind);
    if (group.length > 0) lines.push(`  - ${lineFor(kind, group, options.now)}`);
  }

  lines.push('', ...destinations(alerts, options.dashboardUrl));
  lines.push(
    '',
    'This email carries no part of what was written. The words stay in the dashboard.',
  );

  return lines.join('\n');
}

function lineFor(kind: AlertKind, group: AlertRow[], now: Date): string {
  const noun = nounFor(group, group.length);
  const what =
    kind === 'queue_new'
      ? `${group.length} ${noun} waiting for review`
      : kind === 'queue_overdue'
        ? `${group.length} ${noun} waiting more than 48 hours`
        : kind === 'report_new'
          ? `${group.length} ${noun} to look at`
          : `${group.length} ${noun} open for more than 48 hours`;

  return `${what}, oldest ${waited(oldest(group), now)} (${branchesOf(group)})`;
}

/** Posts and reports are different work; say which unless the digest holds both. */
function nounFor(alerts: AlertRow[], count: number): string {
  const kinds = new Set(alerts.map((alert) => alert.item_kind));
  if (kinds.size === 1 && kinds.has('report')) {
    return count === 1 ? 'report' : 'reports';
  }
  if (kinds.size === 1) return count === 1 ? 'post' : 'posts';
  return count === 1 ? 'item' : 'items';
}

function greeting(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0];
  return first ? ` ${first}` : '';
}

function oldest(group: AlertRow[]): string {
  return group.reduce(
    (earliest, alert) =>
      alert.waiting_since < earliest ? alert.waiting_since : earliest,
    group[0].waiting_since,
  );
}

/** Whole units, rounded down: "3 days" reads as a duty, "3.4 days" reads as a metric. */
function waited(since: string, now: Date): string {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - new Date(since).getTime()) / 60_000),
  );
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return plural(hours, 'hour');
  return plural(Math.floor(hours / 24), 'day');
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

function branchesOf(group: AlertRow[]): string {
  const names = [...new Set(group.map((alert) => alert.branch_name))];
  if (names.length <= BRANCHES_NAMED) return names.join(', ');
  const rest = names.length - BRANCHES_NAMED;
  return `${names.slice(0, BRANCHES_NAMED).join(', ')} and ${rest} more`;
}

/**
 * Where to go. Two queues, two screens, and only the ones this digest is about: a link to an
 * empty reports inbox teaches the reader that the links are decorative.
 */
function destinations(alerts: AlertRow[], dashboardUrl: string | null): string[] {
  if (!dashboardUrl) return ['Open the AGBC dashboard to clear them.'];

  const base = dashboardUrl.replace(/\/+$/, '');
  const links: string[] = [];
  if (alerts.some((alert) => alert.item_kind !== 'report')) {
    links.push(`Moderation queue: ${base}/moderation`);
  }
  if (alerts.some((alert) => alert.item_kind === 'report')) {
    links.push(`Reports: ${base}/reports`);
  }
  return links;
}
