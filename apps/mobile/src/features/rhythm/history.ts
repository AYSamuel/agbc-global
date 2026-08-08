import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// RHYTHM's two list reads (docs/spec/10 §RHYTHM: milestones achieved, attendance
// history). Plain RLS-scoped selects on own rows, which is all they can be: both
// tables carry a single SELECT policy of `profile_id = auth.uid()` and no client
// write path at all (20260807120000).
//
// NEITHER IS AN ARITHMETIC SOURCE. The streak, the state and "today" come from
// `rhythm_state()` and nowhere else (see queries.ts); these rows are the history
// that state is drawn from, shown as history. Counting weeks from them here would
// be the client re-deriving the one thing the server owns, and the two answers
// would disagree the first time a grace week landed between them.
//
// Not persisted, for the same reason the rhythm row is not: an attendance list is
// as personal as this app gets, and `isPersonalQuery` (lib/queryMeta) drops
// anything unflagged when a session ends, so the next member on a shared phone
// never meets the last one's history.

export type AttendanceSource = 'here_button' | 'live_watch';

export interface AttendanceEntry {
  /** The day it counted for, in the ATTENDED branch's timezone, fixed at write
   * time and immutable afterwards (docs/spec/02). A plain date, never an
   * instant: rendering it must not re-apply a timezone. */
  serviceDate: string;
  branchId: string;
  source: AttendanceSource;
}

/**
 * How much history the list shows.
 *
 * The frames draw a short list under one "Attendance" label, with no paging
 * control and nothing that counts. Twelve is about a season of Sundays: enough
 * that the recent rhythm is legible, few enough that a long-standing member does
 * not get a year of rows in a non-virtualized scroll. If a "show everything"
 * affordance is ever wanted it belongs in a frame first.
 */
export const ATTENDANCE_PAGE = 12;

export function attendanceQueryOptions(enabled: boolean) {
  return {
    queryKey: ['rhythm', 'attendance'] as const,
    queryFn: async (): Promise<AttendanceEntry[]> => {
      const { data, error } = await supabase
        .from('attendance')
        .select('service_date, branch_id, source')
        .order('service_date', { ascending: false })
        .limit(ATTENDANCE_PAGE);
      if (error) throw new Error(error.message);
      return data.map((row) => ({
        serviceDate: row.service_date,
        branchId: row.branch_id,
        source: row.source,
      }));
    },
    enabled,
    staleTime: 5 * 60_000,
  };
}

export function useAttendanceQuery(enabled: boolean) {
  return useQuery(attendanceQueryOptions(enabled));
}

export interface MilestoneRow {
  kind: string;
  achievedAt: string;
}

export function milestonesQueryOptions(enabled: boolean) {
  return {
    queryKey: ['rhythm', 'milestones'] as const,
    queryFn: async (): Promise<MilestoneRow[]> => {
      const { data, error } = await supabase
        .from('milestones')
        .select('kind, achieved_at')
        .order('achieved_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data.map((row) => ({
        kind: row.kind,
        achievedAt: row.achieved_at,
      }));
    },
    enabled,
    staleTime: 5 * 60_000,
  };
}

export function useMilestonesQuery(enabled: boolean) {
  return useQuery(milestonesQueryOptions(enabled));
}
