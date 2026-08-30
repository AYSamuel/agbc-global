import { applyGloryToCaches } from '@/features/family/gloryCache';
import {
  PRAYER_SURFACE_KEYS,
  TESTIMONY_SURFACE_KEYS,
} from '@/features/family/keys';
import { invalidateRsvp } from '@/features/events/rsvp';
import { invalidateSaved, savedListQueryKey } from '@/features/watch/saved';
import { announceCheckIn } from '@/features/rhythm/announce';
import { toRhythmState } from '@/features/rhythm/queries';
import {
  applyRhythmAnswer,
  invalidateMilestones,
  invalidateRhythm,
} from '@/features/rhythm/rhythmCache';
import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import {
  useWriteQueueStore,
  type QueuedWrite,
  type ReplayOutcome,
  type WriteHandlers,
} from '@/lib/writeQueue';

// The composition root for the write queue: what each queued wish actually does
// when it reaches the server.
//
// It lives in state/ rather than lib/ because it is the one place allowed to
// know about both. lib/writeQueue owns the machinery and imports no feature;
// this module wires features into it, which keeps the dependency arrow pointing
// one way (~/.claude/standards/frontend.md: lower layers never import higher).
//
// Handlers land here as their work items build the surface that queues them:
// glory and intercession (W2.4), rsvp (W2.9), attendance (W2.8), playback
// (W3.1), plan_day (Phase 4).

/**
 * Postgres codes that mean "and it will still say no next time": a check
 * violation from a guard trigger (the testimony was removed, so it is no longer
 * published), a foreign key that no longer resolves (it was deleted outright),
 * or an RLS refusal. Anything else, including no code at all, is transport.
 */
const FINAL_CODES = new Set(['23514', '23503', '42501', 'PGRST301']);

function outcomeFor(error: { code?: string | null } | null): ReplayOutcome {
  if (error === null) return 'done';
  return FINAL_CODES.has(error.code ?? '') ? 'refused' : 'retry';
}

async function handleGlory(write: QueuedWrite): Promise<ReplayOutcome> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  // Signed out between the tap and the replay. The queue is cleared on sign-out,
  // so this is a race rather than a state; keep the wish and let that clear win.
  if (!userId) return 'retry';

  const error =
    write.state === 'on'
      ? // Conflict-tolerant on purpose (docs/spec/02): a repeat replay, or a
        // reaction that already exists, must leave the count exactly as it is.
        // The counter trigger is written around this: a skipped conflicting
        // insert fires no trigger.
        (
          await supabase
            .from('glory_reactions')
            .upsert(
              { testimony_id: write.entityId, profile_id: userId },
              { onConflict: 'testimony_id,profile_id', ignoreDuplicates: true },
            )
        ).error
      : // Deleting something already gone is a success: the member's wish is
        // that there be no reaction, and there is none.
        (
          await supabase
            .from('glory_reactions')
            .delete()
            .eq('testimony_id', write.entityId)
            .eq('profile_id', userId)
        ).error;

  const outcome = outcomeFor(error);

  // Nothing to do on success. The card was patched the moment the member tapped
  // (features/family/useGlory), which is the whole reason there is no second
  // render here to get wrong.
  //
  // A refusal is the one case that has to touch the screen: the server will keep
  // saying no (the testimony was removed, or deleted outright), so the optimistic
  // change is put back rather than left standing as a promise the app cannot
  // keep. `01` §8 asks for exactly this, quietly and with no toast.
  if (outcome === 'refused') {
    applyGloryToCaches(write.entityId, write.state !== 'on');
  }
  return outcome;
}
async function handleIntercession(write: QueuedWrite): Promise<ReplayOutcome> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return 'retry';

  let error;
  if (write.state === 'none') {
    // The undo. Deleting is already the member's own right, and the counter
    // trigger takes them out of whichever count they were in. Deleting something
    // already gone is success: the wish is that no commitment exist, and none
    // does.
    ({ error } = await supabase
      .from('prayer_intercessions')
      .delete()
      .eq('prayer_id', write.entityId)
      .eq('profile_id', userId));
  } else if (write.state === 'committed') {
    // "I will pray". Conflict-tolerant: a repeated replay must not enrol the
    // member twice, which would double the praying count the author sees. The
    // insert guard forces profile_id, state and the reminder schedule
    // server-side whatever this sends (docs/spec/02).
    ({ error } = await supabase
      .from('prayer_intercessions')
      .upsert(
        { prayer_id: write.entityId, profile_id: userId },
        { onConflict: 'prayer_id,profile_id', ignoreDuplicates: true },
      ));
  } else {
    // "I prayed", in TWO statements, because the queue keeps only the last wish
    // per request and this one may be the only thing left of a whole sequence.
    // A member who undoes and then taps through again can collapse "commit" and
    // "fulfil" into this single wish, and by then the undo may already have
    // deleted their row on the server. The insert guard forces every new
    // intercession to `committed` (a member can never insert one fulfilled), so
    // reaching `prayed` from nothing genuinely takes both steps.
    //
    // Both are idempotent, so this is also correct when the row already exists,
    // and when it is already fulfilled: the upsert conflicts and does nothing,
    // and the update matches no still-committed row.
    ({ error } = await supabase
      .from('prayer_intercessions')
      .upsert(
        { prayer_id: write.entityId, profile_id: userId },
        { onConflict: 'prayer_id,profile_id', ignoreDuplicates: true },
      ));
    if (!error) {
      ({ error } = await supabase
        .from('prayer_intercessions')
        .update({ state: 'prayed' })
        .eq('prayer_id', write.entityId)
        .eq('profile_id', userId)
        // Scoped to a row still committed, so a replay landing after the first
        // success matches nothing and is a success rather than an error.
        .eq('state', 'committed'));
    }
  }

  const outcome = outcomeFor(error);

  // As with Glory: the card was patched when the member tapped, so success
  // changes nothing on screen. A refusal is the one case that must, and there is
  // only one honest thing to show then. The prayer was answered, deleted or
  // removed while the tap was in flight, so the commitment the member reached
  // for no longer exists; refetching is the only way to learn what replaced it.
  if (outcome === 'refused') {
    for (const queryKey of PRAYER_SURFACE_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }
  return outcome;
}

/**
 * The window the server will believe a device clock for (`20260807120000`): a
 * `client_taken_at` older than this, or in the future, is replaced by the
 * server's own now(). That protects the server from fabricated history, and it
 * is exactly why a stale wish must not be SENT: replayed on day eight, a tap
 * made last Sunday would be clamped forward and recorded as attendance today, a
 * week the member was never there. The queue knows when the tap happened, so it
 * is the queue's job to stop.
 */
const CLIENT_CLOCK_TRUSTED_MS = 72 * 60 * 60_000;

async function handleAttendance(write: QueuedWrite): Promise<ReplayOutcome> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.id) return 'retry';

  const takenAt = new Date(write.queuedAt);
  if (Date.now() - write.queuedAt > CLIENT_CLOCK_TRUSTED_MS) {
    // Nothing to send and nothing to retry: this wish can no longer be recorded
    // as the day it belonged to. Dropped rather than clamped forward, and the
    // optimistic tick goes with it.
    console.warn('writeQueue: dropped an attendance older than 72h');
    invalidateRhythm();
    return 'refused';
  }

  // One call does the write and answers with the resulting rhythm, so the toast
  // and the streak strip come from the same answer (docs/spec/10). The insert is
  // idempotent by the unique constraint: a second replay records nothing and
  // says so through `recorded`.
  const { data: rows, error } = await supabase.rpc('record_attendance', {
    p_branch_id: write.state,
    p_client_taken_at: takenAt.toISOString(),
  });

  const outcome = outcomeFor(error);
  if (outcome === 'done') {
    const row = rows?.at(0);
    if (row) {
      // The server's whole answer replaces the row: this is where the week
      // counts arrive, and the app has not guessed one of them.
      applyRhythmAnswer(write.state, toRhythmState(row));
      // ...and the server may have awarded a milestone on the way past, which
      // no part of that answer mentions. Asking again is what turns a fourth
      // Sunday into a celebration (W2.8 slice 4).
      invalidateMilestones();
      // The one thing the tap could not know (docs/spec/10): the day was
      // already recorded, on another device or by a replay this app forgot.
      if (!row.recorded) announceCheckIn('already');
    }
  } else if (outcome === 'refused') {
    // The member is not onboarded, or the branch is gone. Only the server can
    // say what is true now, so the tick comes off by refetching.
    invalidateRhythm();
  }
  return outcome;
}

/**
 * The member's answer to an event (docs/spec/11, W2.9).
 *
 * An upsert rather than an insert-or-update dance, because `rsvps` is unique per
 * (event, profile) and the queue carries an END STATE: whatever the member last
 * chose is what should be true, and replaying it twice must land in the same
 * place. `profile_id` is sent so the conflict target resolves, and the guard
 * overwrites it with `auth.uid()` anyway, so a forged one buys nothing
 * (`rsvps_insert_guard`).
 *
 * REFUSALS ARE EXPECTED HERE, more than for any other kind. The event may have
 * been cancelled or may have started since the tap, and `assert_event_accepts_rsvps`
 * raises for going/interested in either case. That is a final answer, not a
 * transport failure, so the wish is dropped and the row refetched: `11` asks for
 * exactly this, "RSVP against a cancelled event rejected server-side and
 * reconciled quietly". Cancelling is never refused, which is why a member can
 * always take their name off a list.
 */
async function handleRsvp(write: QueuedWrite): Promise<ReplayOutcome> {
  const { data } = await supabase.auth.getSession();
  const profileId = data.session?.user.id;
  if (!profileId) return 'retry';

  const { error } = await supabase.from('rsvps').upsert(
    {
      event_id: write.entityId,
      profile_id: profileId,
      status: write.state as 'going' | 'interested' | 'cancelled',
    },
    { onConflict: 'event_id,profile_id' },
  );

  const outcome = outcomeFor(error);
  if (outcome !== 'done') {
    // Quietly: the screen simply shows what the server says, with no scolding
    // about an event that moved out from under them (docs/spec/11).
    invalidateRsvp(write.entityId);
  }
  return outcome;
}

/**
 * My List membership (docs/spec/08, W3.1 slice 4). Glory's two branches with
 * one difference worth noticing: nothing here names `profile_id`. Since
 * `20260815120000` identity is not an input on `saved_items`: the column
 * defaults to auth.uid(), the INSERT grant excludes it (sending it would be
 * refused), and the delete needs no profile filter because RLS already scopes
 * the rows. The conflict target still resolves by name alone.
 */
async function handleSaved(write: QueuedWrite): Promise<ReplayOutcome> {
  const { data } = await supabase.auth.getSession();
  // Signed out between the tap and the replay: a race, not a state. The queue
  // is cleared on sign-out, so keep the wish and let that clear win.
  if (!data.session?.user.id) return 'retry';

  const error =
    write.state === 'on'
      ? // Conflict-tolerant: a repeat replay, or a message already saved on
        // another device, must leave the list exactly as it is.
        (
          await supabase
            .from('saved_items')
            .upsert(
              { sermon_id: write.entityId },
              { onConflict: 'profile_id,sermon_id', ignoreDuplicates: true },
            )
        ).error
      : // Removing something already gone is a success: the member's wish is
        // that the message not be listed, and it is not.
        (
          await supabase
            .from('saved_items')
            .delete()
            .eq('sermon_id', write.entityId)
        ).error;

  const outcome = outcomeFor(error);

  // Success changes nothing on screen: the bookmark and the list were patched
  // at the tap (features/watch/saved.ts). A refusal (the sermon row was
  // deleted outright) is the one case that must, quietly (docs/spec/01 §8).
  if (outcome === 'refused') {
    invalidateSaved(write.entityId);
  }
  return outcome;
}

export const writeHandlers: WriteHandlers = {
  glory: handleGlory,
  intercession: handleIntercession,
  attendance: handleAttendance,
  rsvp: handleRsvp,
  saved: handleSaved,
};

/**
 * Puts an entity's rows back to server truth. The queue calls this for wishes it
 * has to drop to stay under its cap: `01` §8 requires eviction to revert the
 * optimistic UI, and since the tap wrote that state into the cache, only a
 * refetch can say what is actually true now.
 *
 * The callback carries no entity (the queue can drop several at once), so this
 * refetches the surfaces a dropped wish could have painted. My List joined at
 * W3.1 slice 4: without it an evicted save leaves a filled bookmark and a listed
 * row with nothing left to deliver either, which is the exact promise `01` §8
 * forbids breaking silently.
 */
function revertEvicted(): void {
  for (const queryKey of TESTIMONY_SURFACE_KEYS) {
    void queryClient.invalidateQueries({ queryKey });
  }
  // The prayer surfaces were missing here until #183 (found in the W3.1 slice 4
  // review, fixed 2026-08-30). An evicted `intercession` left "I will pray"
  // showing on a card with nothing left to deliver it, which is precisely the
  // silent broken promise `01` §8 makes eviction responsible for undoing. The
  // refused-intercession handler above already invalidates exactly this list.
  for (const queryKey of PRAYER_SURFACE_KEYS) {
    void queryClient.invalidateQueries({ queryKey });
  }
  void queryClient.invalidateQueries({ queryKey: savedListQueryKey });
  void queryClient.invalidateQueries({ queryKey: ['saved'] });
}

/** Called once from the root layout, before the queue starts draining. */
export function installWriteHandlers(): void {
  useWriteQueueStore.getState().setHandlers(writeHandlers, revertEvicted);
}
