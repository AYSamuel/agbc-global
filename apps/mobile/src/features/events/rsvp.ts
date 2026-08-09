import { useQuery } from '@tanstack/react-query';

import { useNotificationAskStore } from '@/features/notifications/ask';
import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import { pushWrite, usePendingWrite } from '@/lib/writeQueue';

// The member's own answer to an event (docs/spec/11 §EVENT-DETAIL).
//
// `rsvps` keeps ONE row per member per event and changing your mind is an
// UPDATE, so there are three answers and no fourth: going, interested, and
// cancelled, which is a value rather than a deletion. The row survives a
// cancellation on purpose, because "you were going and changed your mind" is
// something the member's own list should still show (docs/spec/11).
//
// Not persisted to disk: an RSVP is a fact about a person, and `isPersonalQuery`
// drops anything unflagged when the session ends, so the next member on a shared
// phone never meets the last one's answer.

export type RsvpStatus = 'going' | 'interested' | 'cancelled';

/** No row at all reads the same as cancelled on screen: nothing has been said. */
export type RsvpAnswer = RsvpStatus | null;

export function rsvpQueryKey(eventId: string | null) {
  return ['rsvp', eventId] as const;
}

export function rsvpQueryOptions(eventId: string | null, enabled: boolean) {
  return {
    queryKey: rsvpQueryKey(eventId),
    queryFn: async (): Promise<RsvpAnswer> => {
      if (eventId === null) return null;
      const { data, error } = await supabase
        .from('rsvps')
        .select('status')
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null ? null : data.status;
    },
    enabled,
    staleTime: 5 * 60_000,
  };
}

export function useRsvpQuery(eventId: string | null, enabled: boolean) {
  return useQuery(rsvpQueryOptions(eventId, enabled));
}

/**
 * The optimistic half: the answer is on screen before the wire hears about it,
 * the same shape `gloryCache` and `rhythmCache` use. One store, so there is no
 * second render to get wrong.
 */
export function applyRsvpToCache(eventId: string, status: RsvpStatus): void {
  queryClient.setQueryData<RsvpAnswer>(rsvpQueryKey(eventId), status);
}

/** A queued answer the server refused: only it can say what is true now. */
export function invalidateRsvp(eventId: string): void {
  void queryClient.invalidateQueries({ queryKey: rsvpQueryKey(eventId) });
}

/**
 * Say it, then queue it. Not a hook, so the gate-return executor can call it
 * too: an RSVP made before signing in and one made after are the same act
 * (docs/spec/03 rule 9).
 */
export function queueRsvp(eventId: string, status: RsvpStatus): void {
  applyRsvpToCache(eventId, status);
  pushWrite('rsvp', eventId, status);
  // A value moment (docs/spec/06), raised HERE rather than in the screen so the
  // gate-return path raises it too: the commonest first RSVP in the whole app is
  // a guest who taps "I'm going", signs in, and lands back with it done, and
  // that member would otherwise never be asked. Same place `queueCheckIn` puts
  // it, for the same reason.
  //
  // Cancelling is not one: somebody withdrawing their name is the last person to
  // ask for permission to send them things.
  if (status !== 'cancelled') {
    useNotificationAskStore.getState().reachedValueMoment('rsvp');
  }
}

/**
 * What the screen should show, which is the queued wish when there is one and
 * the server's answer otherwise.
 *
 * The queue IS the app's record of an unsent intention (docs/spec/01 §8), so
 * reading it here is what makes an RSVP tapped on a train stay answered on the
 * screen until the signal comes back.
 */
export function useRsvpAnswer(
  eventId: string | null,
  serverAnswer: RsvpAnswer,
): RsvpAnswer {
  // Returns the STATE itself, not a wrapper (lib/writeQueue).
  const pending = usePendingWrite('rsvp', eventId ?? '');
  return pending ?? serverAnswer;
}
