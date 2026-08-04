import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';

import { PRAYER_SURFACE_KEYS, TESTIMONY_SURFACE_KEYS } from './keys';
import { myPostsKey } from './myPosts';

/**
 * Report and block: the two things a member can do about somebody else's post
 * (docs/spec/09 §Post actions menu, docs/spec/02 §reports / §blocked_users).
 *
 * Everything that decides anything here is server-side and was already there before this
 * file: the insert guard forces `reporter_id` to auth.uid(), forces `status` to open and
 * forces `is_safeguarding` to false (a leader's classification, never the reporter's
 * claim); the partial uniques make a second report of the same post a duplicate key; the
 * 20-per-24h cap raises a check violation. This module's whole job is to send the
 * minimum and to translate what comes back into something a person should read.
 */

/**
 * The four reasons, as stable keys (frame: `REPORT · the reason, in the reporter's
 * words`). The KEY is what `reports.reason` stores and what the dashboard queue reads;
 * the English lives in the app bundle and the dashboard's own copy file, the same
 * division the verse importer's reason codes use. A leader in Berlin filtering their
 * queue must not have to match on a sentence somebody's phone happened to render.
 *
 * In the frame's order, which is the order a leader needs: the one that may mean a person
 * is in danger comes first.
 */
export const REPORT_REASONS = [
  'at_risk',
  'private_details',
  'hurtful',
  'not_for_this_space',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportTarget = { kind: 'testimony' | 'prayer'; id: string };

/**
 * What became of a report, from the reporter's point of view. All three end at the same
 * toast on purpose (frame note): telling somebody "you already reported this" only
 * invites them to wonder why nothing has happened yet, and telling a flooder they hit a
 * cap tells them exactly what to work around. The distinction is kept here rather than
 * erased so that it can be tested, and so that a future queue-health screen has it.
 */
export type ReportOutcome = 'sent' | 'already-reported' | 'capped';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

export function useReportPost() {
  return useMutation({
    mutationFn: async ({
      target,
      reason,
    }: {
      target: ReportTarget;
      reason: ReportReason;
    }): Promise<ReportOutcome> => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error('reporting without a member session');

      // `reporter_id` is not-null with no default, so the generated types require it. It
      // is sent as the caller's own id rather than a placeholder, and the guard then
      // overwrites it from auth.uid() anyway (`009` proves the forcing).
      const { error } = await supabase.from('reports').insert({
        reporter_id: userId,
        testimony_id: target.kind === 'testimony' ? target.id : null,
        prayer_id: target.kind === 'prayer' ? target.id : null,
        reason,
      });

      if (!error) return 'sent';
      if (error.code === UNIQUE_VIOLATION) return 'already-reported';
      if (error.code === CHECK_VIOLATION) return 'capped';
      throw error;
    },
  });
}

/**
 * Blocking is TWO-WAY and immediate (docs/spec/02): the feed views stop returning that
 * author's rows to this member and this member's rows to them, in the same statement.
 *
 * So every Family surface is invalidated, both kinds, not just the one the block was
 * tapped from: a block made on a testimony also takes that member's prayer requests off
 * this screen, and the reverse. This is the one write where reaching wide is right.
 */
export function useBlockMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockedId: string): Promise<void> => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error('blocking without a member session');

      const { error } = await supabase
        .from('blocked_users')
        .insert({ blocker_id: userId, blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateEverythingAuthorship(queryClient);
    },
  });
}

export function useUnblockMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockedId: string): Promise<void> => {
      // No blocker_id filter: the DELETE policy is `blocker_id = auth.uid()`, so the row
      // this reaches is this member's own or it is no row at all.
      const { error } = await supabase
        .from('blocked_users')
        .delete()
        .eq('blocked_id', blockedId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateEverythingAuthorship(queryClient);
    },
  });
}

async function invalidateEverythingAuthorship(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all(
    [
      ...TESTIMONY_SURFACE_KEYS,
      ...PRAYER_SURFACE_KEYS,
      BLOCKED_MEMBERS_KEY,
      myPostsKey(),
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

export const BLOCKED_MEMBERS_KEY = ['family', 'blocked-members'] as const;

export interface BlockedMember {
  id: string;
  displayName: string;
}

/**
 * SETTINGS > Blocked members, and the list the live feed filters against.
 *
 * Reads `blocked_members`, whose `blocker_id = auth.uid()` predicate IS the view rather
 * than a filter this query asks for (migration 20260803160000): there is no `.eq()` here
 * to forget and no id to tamper with. Names come from it because a member cannot read
 * another member's profile row, which is the whole reason the view exists.
 *
 * Not persisted to disk. Who somebody has blocked is among the most personal things this
 * app holds, and `lib/queryMeta` reserves persistence for public content (docs/spec/20).
 */
export function useBlockedMembers() {
  const signedIn = useAuthStore((state) => state.status === 'member');

  return useQuery({
    queryKey: BLOCKED_MEMBERS_KEY,
    enabled: signedIn,
    queryFn: async (): Promise<BlockedMember[]> => {
      const { data, error } = await supabase
        .from('blocked_members')
        .select('blocked_id, display_name')
        .order('display_name', { ascending: true });
      if (error) throw new Error(error.message);
      // Both columns are `T | null` through a view (Postgres cannot prove NOT NULL past
      // one), and a row missing either is a bug in the view rather than a member to draw.
      return data.flatMap((row) =>
        row.blocked_id === null
          ? []
          : [{ id: row.blocked_id, displayName: row.display_name ?? '' }],
      );
    },
  });
}

/**
 * The ids the live feed drops broadcasts for.
 *
 * A single broadcast payload goes to every subscriber and cannot be filtered per
 * recipient, so the client does that last step itself (docs/spec/02). Derived from the
 * one query above rather than stored anywhere: the Blocked members screen and the
 * realtime filter are the same fact, and two copies of it would be two chances to
 * disagree about who is blocked.
 */
export function useBlockedAuthorIds(): readonly string[] {
  const { data } = useBlockedMembers();
  return data?.map((member) => member.id) ?? EMPTY_IDS;
}

// A stable identity for the empty case: `useFamilyRealtime` joins this list by value, but
// handing it a fresh array every render is still a new dependency every render.
const EMPTY_IDS: readonly string[] = [];
