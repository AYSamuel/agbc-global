// NOTIF-PREFS' row (docs/spec/15 tiers, W3.3 slice 5).
//
// The row exists before the screen ever reads it: a SECURITY DEFINER trigger
// creates one per profile (20260719200023), so there is no insert path here and
// an error is an error, never "make one". The member may UPDATE their own row
// and that is the whole write surface.
//
// FIVE CONTROLS, SIX COLUMNS (W3.3 decision 2): the frame captions the prayer
// toggle "When someone prays with you, and reminders to pray", so that one
// control writes BOTH `prayer_activity` and `prayer_reminders`. The columns
// stay separate in the schema so a later item can split the control without a
// migration; the cost (a member who likes the pings but not the nudges loses
// both) is recorded with the decision.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';

export interface NotificationPrefs {
  ministryAnnouncements: boolean;
  branchUpdates: boolean;
  serviceReminders: boolean;
  prayerActivity: boolean;
  prayerReminders: boolean;
  testimonyActivity: boolean;
}

/** The five switches, in the frame's order. */
export type PrefToggle =
  | 'ministry_announcements'
  | 'branch_updates'
  | 'service_reminders'
  | 'prayer_activity'
  | 'testimony_activity';

const COLUMNS =
  'ministry_announcements, branch_updates, service_reminders, prayer_activity, prayer_reminders, testimony_activity';

interface DbRow {
  ministry_announcements: boolean;
  branch_updates: boolean;
  service_reminders: boolean;
  prayer_activity: boolean;
  prayer_reminders: boolean;
  testimony_activity: boolean;
}

export function prefsKey(member: string | null) {
  return ['notifications', 'prefs', member ?? 'none'] as const;
}

export function usePrefs(enabled: boolean) {
  const member = useAuthStore((state) => state.email);
  return useQuery({
    queryKey: prefsKey(member),
    enabled: enabled && member !== null,
    queryFn: async (): Promise<NotificationPrefs> => {
      // RLS scopes to the caller's row; `.single()` because the trigger
      // guarantees exactly one.
      const { data, error } = await supabase
        .from('notification_prefs')
        .select(COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      const row = data;
      return {
        ministryAnnouncements: row.ministry_announcements,
        branchUpdates: row.branch_updates,
        serviceReminders: row.service_reminders,
        prayerActivity: row.prayer_activity,
        prayerReminders: row.prayer_reminders,
        testimonyActivity: row.testimony_activity,
      };
    },
  });
}

/** What one switch writes: the prayer control fans out to its two columns. */
export function columnsForToggle(
  toggle: PrefToggle,
  next: boolean,
): Partial<DbRow> {
  if (toggle === 'prayer_activity') {
    return { prayer_activity: next, prayer_reminders: next };
  }
  return { [toggle]: next };
}

function applyToggle(
  prefs: NotificationPrefs,
  toggle: PrefToggle,
  next: boolean,
): NotificationPrefs {
  switch (toggle) {
    case 'ministry_announcements':
      return { ...prefs, ministryAnnouncements: next };
    case 'branch_updates':
      return { ...prefs, branchUpdates: next };
    case 'service_reminders':
      return { ...prefs, serviceReminders: next };
    case 'prayer_activity':
      return { ...prefs, prayerActivity: next, prayerReminders: next };
    case 'testimony_activity':
      return { ...prefs, testimonyActivity: next };
  }
}

/**
 * Optimistic on purpose: a switch that waits for the network reads as broken.
 * On failure the row is refetched and the switch settles back to the truth.
 */
export function useSetPref() {
  const client = useQueryClient();
  const member = useAuthStore((state) => state.email);
  return useMutation({
    mutationFn: async (change: { toggle: PrefToggle; next: boolean }) => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error('no session');
      const { error } = await supabase
        .from('notification_prefs')
        .update(columnsForToggle(change.toggle, change.next))
        .eq('profile_id', userId);
      if (error) throw new Error(error.message);
    },
    onMutate: (change) => {
      client.setQueryData<NotificationPrefs>(prefsKey(member), (prefs) =>
        prefs === undefined
          ? undefined
          : applyToggle(prefs, change.toggle, change.next),
      );
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: prefsKey(member) });
    },
  });
}
