import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// The member's rhythm (docs/spec/10), read through ONE function.
//
// `rhythm_state()` answers for auth.uid() and takes no profile id, so there is no
// foreign id to probe. It also owns "today", in the timezone of the branch being
// browsed: the app must never work that out for itself, because a wrong device
// clock would make "not checked in yet" indistinguishable from a broken tap, and
// because the streak maths (grace weeks, DST) is settled in SQL and asserted in
// pgTAP 030. Nothing here recomputes any of it.

/** The four states a screen renders (docs/spec/10). */
export type RhythmPhase = 'none' | 'active' | 'grace' | 'lapsed';

export interface RhythmState {
  /** The date in the BROWSED branch's timezone, decided by the server. */
  today: string;
  checkedIn: boolean;
  phase: RhythmPhase;
  /** The live streak: 0 when lapsed. */
  currentWeeks: number;
  /** Monotonic; never taken away. */
  longestWeeks: number;
  lastServiceDate: string | null;
}

/** The RPC's row, before it is given app-shaped names. */
interface RhythmRow {
  today: string;
  checked_in: boolean;
  state: string;
  current_weeks: number;
  longest_weeks: number;
  last_service_date: string | null;
}

const PHASES: readonly string[] = ['none', 'active', 'grace', 'lapsed'];

/** Unknown values read as `none`, which is the state that promises least. */
function toPhase(raw: string): RhythmPhase {
  return PHASES.includes(raw) ? (raw as RhythmPhase) : 'none';
}

export function toRhythmState(row: RhythmRow): RhythmState {
  return {
    today: row.today,
    checkedIn: row.checked_in,
    phase: toPhase(row.state),
    currentWeeks: row.current_weeks,
    longestWeeks: row.longest_weeks,
    lastServiceDate: row.last_service_date,
  };
}

/** One key per browsed branch: "today" and `checked_in` are answered in that
 * branch's timezone, so Berlin's answer is not Glasgow's. */
export function rhythmQueryKey(branchId: string | null) {
  return ['rhythm', branchId] as const;
}

export function rhythmQueryOptions(branchId: string | null, enabled: boolean) {
  return {
    queryKey: rhythmQueryKey(branchId),
    queryFn: async (): Promise<RhythmState | null> => {
      if (branchId === null) return null;
      const { data, error } = await supabase.rpc('rhythm_state', {
        p_branch_id: branchId,
      });
      if (error) throw new Error(error.message);
      const row = data.at(0);
      return row ? toRhythmState(row) : null;
    },
    enabled,
    // Short: "today" is the server's, and a member who leaves the app open over
    // midnight should not keep yesterday's answer. The date-keyed Home queries
    // re-key at local midnight anyway (useLocalDate), and a stale-by-minutes
    // streak is harmless where a stale-by-a-day one is a lie.
    staleTime: 5 * 60_000,
    // DELIBERATELY NOT PERSISTED. lib/queryPersist is opt-in precisely so member
    // reads never land in unencrypted storage, and this row is as personal as the
    // app gets. It also must not outlive the session that fetched it: a streak
    // read from a week-old cache is a claim about somebody, possibly somebody
    // else on a shared phone. Offline, the strip simply does not appear rather
    // than showing a number the app cannot stand behind.
  };
}

export function useRhythmQuery(branchId: string | null, enabled: boolean) {
  return useQuery(rhythmQueryOptions(branchId, enabled));
}
