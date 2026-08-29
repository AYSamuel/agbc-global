import { useQuery } from '@tanstack/react-query';

import { PERSIST_META } from '@/lib/queryMeta';
import { supabase } from '@/lib/supabase';

// Events reads (docs/spec/11): the browsing branch's events PLUS ministry-wide
// rows (branch_id null), never hard-coded to one branch. Reads are public
// (guest-first); RSVPs are Phase 2 (W2.9).

export type EventStatus = 'scheduled' | 'cancelled';

export interface EventListItem {
  id: string;
  branch_id: string | null;
  title: string;
  /** Wall-clock in `timezone` (docs/spec/02), e.g. '2026-08-24T19:00:00'. */
  starts_at_local: string;
  timezone: string;
  location: string;
  /** Object PATH in the public-read `event-images` bucket; `image.ts` builds the URL. */
  image_path: string | null;
  status: EventStatus;
  rsvp_enabled: boolean;
}

export interface EventDetail extends EventListItem {
  description: string;
  ends_at_local: string | null;
}

const LIST_FIELDS =
  'id, branch_id, title, starts_at_local, timezone, location, image_path, status, rsvp_enabled';

// How far back the list reaches for the Past toggle. A bounded window keeps
// the read cheap forever; anything older is history, not navigation.
const PAST_WINDOW_DAYS = 60;
const LIST_LIMIT = 100;

function pastCutoff(now: Date): string {
  const cutoff = new Date(now.getTime() - PAST_WINDOW_DAYS * 24 * 3600 * 1000);
  return `${cutoff.toISOString().slice(0, 10)}T00:00:00`;
}

export function eventsQueryOptions(branchId: string | null) {
  return {
    queryKey: ['events', 'list', branchId] as const,
    queryFn: async (): Promise<EventListItem[]> => {
      let query = supabase
        .from('events')
        .select(LIST_FIELDS)
        .gte('starts_at_local', pastCutoff(new Date()))
        .order('starts_at_local', { ascending: true })
        .limit(LIST_LIMIT);
      if (branchId !== null) {
        // My branch + ministry-wide (docs/spec/11); with no branch context the
        // guest sees everything.
        query = query.or(`branch_id.eq.${branchId},branch_id.is.null`);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 60_000,
    // Events list paints from cache offline (docs/spec/04 offline state).
    meta: PERSIST_META,
  };
}

export function useEventsQuery(branchId: string | null) {
  return useQuery(eventsQueryOptions(branchId));
}

export function eventDetailQueryOptions(id: string | null) {
  return {
    queryKey: ['events', 'detail', id] as const,
    queryFn: async (): Promise<EventDetail | null> => {
      if (id === null) return null;
      const { data, error } = await supabase
        .from('events')
        .select(`${LIST_FIELDS}, description, ends_at_local`)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 60_000,
    meta: PERSIST_META,
  };
}

export function useEventDetailQuery(id: string | null) {
  return useQuery(eventDetailQueryOptions(id));
}
