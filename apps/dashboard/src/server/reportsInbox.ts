import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { lookupAuthorNames, lookupBranchNames } from './lookups';
import type { QueueKind } from './moderationQueue';

/**
 * Reading the reports inbox (docs/spec/17 §1, W2.7 slice 4's second half).
 *
 * GROUPED BY THE POST, not by the report (frame `REPORTS`, shape chosen 2026-08-04).
 * `reports` carries a partial unique per (reporter, item), so one post can hold several
 * reports with different reasons; a row per report would put the same testimony in front
 * of a leader three times and ask them to judge it three times.
 *
 * Through the CALLER's own client, never service-role. W1.5's `moderators read reports in
 * their branch` hangs on `can_moderate_branch()`, which reads the profiles table rather
 * than a JWT claim, so the database scopes this independently of anything here: an admin
 * sees every branch, a leader sees theirs, and a demoted leader sees nothing the moment
 * the row changes.
 *
 * It takes NO caller. The queue's loader needs one for its filters; this one has none,
 * and a `caller` parameter it never reads would suggest the scoping happens here. It does
 * not: it happens in the policy, one layer down, where a leader cannot reach it.
 *
 * The REPORTER IS NOT READ. `17` asks for review of flagged content, not for who flagged
 * it, and the frame shows no reporter. Leaving the column out of the select keeps that a
 * property of the query rather than a habit of the template.
 */

export type ReportReason =
  'at_risk' | 'private_details' | 'hurtful' | 'not_for_this_space';

/** The stored keys, in the order a leader needs them: danger first (`09`). */
export const REPORT_REASONS: ReportReason[] = [
  'at_risk',
  'private_details',
  'hurtful',
  'not_for_this_space',
];

export interface ReasonTally {
  reason: ReportReason;
  count: number;
}

export interface ReportedItem {
  kind: QueueKind;
  id: string;
  branchId: string;
  branchName: string;
  body: string;
  language: string;
  /** The version on screen, carried into any decision's compare-and-set. */
  updatedAt: string;
  /** When the FIRST report landed: how long somebody has been waiting for an answer. */
  firstReportedAt: string;
  reportCount: number;
  reasons: ReasonTally[];
  /** True when any open report on this item is flagged (`02`: leader-set, never reporter-set). */
  isSafeguarding: boolean;
  isAnonymous: boolean;
  authorName: string | null;
  /** When the author posted it, not when it was approved: there is no publish column. */
  postedAt: string;
  /** Already removed or rejected by a moderator while reports stayed open. */
  contentStatus: Database['public']['Enums']['content_status'];
}

export interface ReportsInbox {
  items: ReportedItem[];
  /** One instant for every relative time on the screen (same rule as the queue). */
  readAt: number;
  counts: { open: number; safeguarding: number; resolvedThisMonth: number };
}

type Client = SupabaseClient<Database>;

interface ReportRow {
  testimony_id: string | null;
  prayer_id: string | null;
  reason: string;
  is_safeguarding: boolean;
  created_at: string;
}

export async function loadReportsInbox(
  supabase: Client,
  now: number = Date.now(),
): Promise<ReportsInbox> {
  const { data, error } = await supabase
    .from('reports')
    .select('testimony_id, prayer_id, reason, is_safeguarding, created_at')
    .eq('status', 'open')
    // Oldest first, like the queue: the report nobody has answered yet is the one at risk
    // of being forgotten, and it is the one a member is waiting on.
    .order('created_at', { ascending: true });
  if (error) throw new Error(`could not read the reports: ${error.message}`);

  const groups = group(data);
  if (groups.size === 0) {
    return {
      items: [],
      readAt: now,
      counts: {
        open: 0,
        safeguarding: 0,
        resolvedThisMonth: await countResolvedThisMonth(supabase, now),
      },
    };
  }

  const [testimonies, prayers] = await Promise.all([
    loadContent(supabase, 'testimony', idsOf(groups, 'testimony')),
    loadContent(supabase, 'prayer', idsOf(groups, 'prayer')),
  ]);
  const content = new Map([...testimonies, ...prayers]);

  const [branchNames, authorNames] = await Promise.all([
    lookupBranchNames(
      supabase,
      [...content.values()].map((row) => row.branchId),
    ),
    lookupAuthorNames(
      supabase,
      [...content.values()].map((row) => row.authorId),
    ),
  ]);

  const items: ReportedItem[] = [];
  for (const [key, group] of groups) {
    const row = content.get(key);
    // A report whose content the caller cannot read is not theirs to act on, and a report
    // whose content is gone entirely has nothing to show. Both drop out silently rather
    // than rendering a card with an empty body. RLS is doing the first of those, which is
    // why this is a filter and not an error.
    if (!row) continue;

    items.push({
      kind: group.kind,
      id: group.id,
      branchId: row.branchId,
      branchName: branchNames.get(row.branchId) ?? '',
      body: row.body,
      language: row.language,
      updatedAt: row.updatedAt,
      postedAt: row.postedAt,
      firstReportedAt: group.firstReportedAt,
      reportCount: group.count,
      reasons: tally(group.reasons),
      isSafeguarding: group.isSafeguarding,
      isAnonymous: row.isAnonymous,
      // The promise the app makes reaches the dashboard: an anonymous request shows no
      // name here either, even though a moderator's RLS could read one.
      //
      // A null `authorId` is the third way there is no name (W4.5): the author deleted
      // their account and chose to leave the post standing. It lands on the same `null` the
      // other two produce, so the queue reads "no name" once rather than three times, and a
      // reported post whose author has gone is still reviewable, which is the point of
      // keeping it.
      authorName:
        row.isAnonymous || row.authorId === null
          ? null
          : (authorNames.get(row.authorId) ?? null),
      contentStatus: row.status,
    });
  }

  // The groups came out of an oldest-first read, so Map insertion order is already
  // first-reported-first and no second sort is needed.
  return {
    items,
    readAt: now,
    counts: {
      open: items.length,
      safeguarding: items.filter((item) => item.isSafeguarding).length,
      resolvedThisMonth: await countResolvedThisMonth(supabase, now),
    },
  };
}

interface Group {
  kind: QueueKind;
  id: string;
  count: number;
  reasons: string[];
  isSafeguarding: boolean;
  firstReportedAt: string;
}

/** `${kind}:${id}`, so a testimony and a prayer can never collide on a shared uuid. */
function keyOf(kind: QueueKind, id: string): string {
  return `${kind}:${id}`;
}

function group(rows: ReportRow[]): Map<string, Group> {
  const groups = new Map<string, Group>();

  for (const row of rows) {
    // The CHECK constraint guarantees exactly one target, so a row with neither is a
    // database that has changed under us rather than a case to render.
    const kind: QueueKind | null = row.testimony_id
      ? 'testimony'
      : row.prayer_id
        ? 'prayer'
        : null;
    const id = row.testimony_id ?? row.prayer_id;
    if (!kind || !id) continue;

    const key = keyOf(kind, id);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.reasons.push(row.reason);
      existing.isSafeguarding = existing.isSafeguarding || row.is_safeguarding;
      continue;
    }
    groups.set(key, {
      kind,
      id,
      count: 1,
      reasons: [row.reason],
      isSafeguarding: row.is_safeguarding,
      // First seen wins, and the read was oldest-first.
      firstReportedAt: row.created_at,
    });
  }

  return groups;
}

function idsOf(groups: Map<string, Group>, kind: QueueKind): string[] {
  return [...groups.values()]
    .filter((entry) => entry.kind === kind)
    .map((entry) => entry.id);
}

/**
 * Counts per reason, in the order `09` fixed rather than by frequency: a leader scanning
 * two cards should find "someone may be at risk" in the same place on both.
 */
function tally(reasons: string[]): ReasonTally[] {
  const counts = new Map<string, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return REPORT_REASONS.filter((reason) => counts.has(reason)).map(
    (reason) => ({
      reason,
      count: counts.get(reason) ?? 0,
    }),
  );
}

interface ContentRow {
  branchId: string;
  postedAt: string;
  body: string;
  language: string;
  updatedAt: string;
  isAnonymous: boolean;
  // Nullable since W4.5: the author deleted their account and chose to leave the post
  // standing, so the row survives with nobody on it (docs/spec/16).
  authorId: string | null;
  status: Database['public']['Enums']['content_status'];
}

async function loadContent(
  supabase: Client,
  kind: QueueKind,
  ids: string[],
): Promise<Map<string, ContentRow>> {
  if (ids.length === 0) return new Map();

  // Base tables rather than the feed views: a reported post may have been removed
  // already, and the views only carry what is publicly visible. Moderators have their own
  // RLS path to these rows.
  if (kind === 'prayer') {
    const { data } = await supabase
      .from('prayers')
      .select(
        'id, branch_id, body, language, created_at, updated_at, is_anonymous, author_id, status',
      )
      .in('id', ids)
      .is('deleted_at', null);
    return new Map(
      (data ?? []).map((row) => [
        keyOf('prayer', row.id),
        {
          branchId: row.branch_id,
          postedAt: row.created_at,
          body: row.body,
          language: row.language,
          updatedAt: row.updated_at,
          isAnonymous: row.is_anonymous,
          authorId: row.author_id,
          status: row.status,
        },
      ]),
    );
  }

  const { data } = await supabase
    .from('testimonies')
    .select(
      'id, branch_id, body, language, created_at, updated_at, author_id, status',
    )
    .in('id', ids)
    .is('deleted_at', null);
  return new Map(
    (data ?? []).map((row) => [
      keyOf('testimony', row.id),
      {
        branchId: row.branch_id,
        postedAt: row.created_at,
        body: row.body,
        language: row.language,
        updatedAt: row.updated_at,
        // A testimony is never anonymous (`09`): only prayer requests carry the flag.
        isAnonymous: false,
        authorId: row.author_id,
        status: row.status,
      },
    ]),
  );
}

/**
 * How many reports this branch has already resolved this month.
 *
 * The one number on the screen that is not a job to do, and the reason it is there: a
 * leader looking at two open reports should see the work they have already done rather
 * than only the work left. Counted from the first of the month in UTC, which is close
 * enough for a morale number and avoids inventing a branch timezone the schema has no
 * column for.
 */
async function countResolvedThisMonth(
  supabase: Client,
  now: number,
): Promise<number> {
  const month = new Date(now);
  const from = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  ).toISOString();

  const { count } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'open')
    .gte('updated_at', from);
  return count ?? 0;
}
