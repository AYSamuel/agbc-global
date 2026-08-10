import { useMutation } from '@tanstack/react-query';

import { invalidateInterest } from './queries';
import { supabase } from '@/lib/supabase';

// "Notify me" on an upcoming level (docs/spec/13): a course_interest row, the
// one member write in the Academy domain (ADR 0017 decision 6). ONLINE-ONLY by
// decision (Ayo, 2026-08-10): it does not join the W2.4 write queue, so an
// offline tap fails honestly with a retry instead of replaying later. The
// interest list is what the church's manual "the level is open" emails read;
// delivery stays manual until the Phase C dashboard automates it (17 §4).
//
// Not hooks all the way down: the gate-return executor (replay.ts) registers
// interest for a member who signed in to do exactly that, and it has no
// component to host a hook (the queueRsvp precedent).

export async function addInterest(courseId: string): Promise<void> {
  // The insert guard overwrites profile_id with auth.uid() whatever is sent;
  // the session's own id is passed because the column is NOT NULL and the
  // generated Insert type (rightly) demands a value.
  const { data } = await supabase.auth.getSession();
  const profileId = data.session?.user.id;
  if (profileId === undefined) throw new Error('not signed in');
  const { error } = await supabase
    .from('course_interest')
    .insert({ course_id: courseId, profile_id: profileId });
  // The unique pair makes a second tap a conflict; that is the state the
  // member asked for, not a failure.
  if (error && error.code !== '23505') throw new Error(error.message);
  invalidateInterest();
}

export async function removeInterest(courseId: string): Promise<void> {
  const { error } = await supabase
    .from('course_interest')
    .delete()
    .eq('course_id', courseId);
  if (error) throw new Error(error.message);
  invalidateInterest();
}

/** The screen's toggle; `interested` is the CURRENT state being changed. */
export function useToggleInterest() {
  return useMutation({
    mutationFn: async (input: { courseId: string; interested: boolean }) => {
      if (input.interested) {
        await removeInterest(input.courseId);
      } else {
        await addInterest(input.courseId);
      }
      return !input.interested;
    },
  });
}
