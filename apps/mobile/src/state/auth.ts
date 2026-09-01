import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useNotificationAskStore } from '@/features/notifications/ask';
import { unregisterPushToken } from '@/features/notifications/token';
import { useCelebratedStore } from '@/features/rhythm/celebrated';
import { useNoteDraftStore } from '@/features/watch/notes';
import { isPersonalQuery } from '@/lib/queryMeta';
import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import { useWriteQueueStore } from '@/lib/writeQueue';
import { useGateStore } from '@/state/gate';
import { resolveEntryRoute } from '@/state/launch';

// Session state (docs/spec/03). Server truth: profiles.onboarded_at decides
// member vs half-created; this store only mirrors it. The persisted snapshot
// (non-sensitive: no tokens) lets a returning member route to Home without a
// network read; the session itself lives in LargeSecureStore via the supabase
// client.

export type AuthStatus = 'loading' | 'guest' | 'onboarding' | 'member';

export interface ProfileSnapshot {
  displayName: string;
  branchId: string;
  language: string;
  role: string;
}

interface AuthState {
  status: AuthStatus;
  /** The session's email (AUTH-2 masking, profile screens). */
  email: string | null;
  profile: ProfileSnapshot | null;
  /**
   * Why a session ended WITHOUT the user asking, or null when none did. The root layout
   * shows a non-blocking toast for it (docs/spec/03).
   *
   * `signed-out` is the refresh failure. `deleted` is the account being erased somewhere
   * ELSE, which `03` gives its own words because they are a different fact: not "sign in
   * again", but "there is nothing to sign in to".
   */
  endedSession: 'signed-out' | 'deleted' | null;
  hydrated: boolean;
  setHydrated: () => void;
  clearEndedSession: () => void;
  /** The account was erased elsewhere: same transition as a refresh failure, other words. */
  markAccountDeleted: () => void;
  /** Launch + auth-event reconciliation; safe to call repeatedly. */
  syncFromSession: () => Promise<void>;
  /** AUTH-2 success: decides AUTH-3 vs AUTH-4. */
  completeSignIn: () => Promise<'onboarding' | 'member'>;
  /** AUTH-3 success: the profile now exists with onboarded_at set. */
  markOnboarded: (profile: ProfileSnapshot) => void;
  signOut: () => Promise<void>;
}

interface ProfileRow {
  // Null once the account has been erased (W4.5). See MyProfile in features/profile/queries.
  display_name: string | null;
  branch_id: string;
  language: string;
  role: string;
  onboarded_at: string | null;
  /**
   * Set when this account has been erased, from this device or another one (W4.5).
   *
   * IT IS READ RATHER THAN INFERRED. `03` describes noticing when "a write is rejected for
   * a deleted profile", and a rejection is a 42501 that half a dozen other policies also
   * produce, so acting on one would mean telling somebody their account is gone on the
   * strength of a guess. The erased member can still SELECT their own row (the erasure
   * strips it rather than removing it, because the audit trail points at it), so the app
   * can ask the question outright and get an answer that cannot mean anything else.
   */
  deleted_at: string | null;
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, branch_id, language, role, onboarded_at, deleted_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function toSnapshot(row: ProfileRow): ProfileSnapshot {
  return {
    // The snapshot is a persisted ROUTING mirror, so it keeps a plain string rather than
    // learning about erasure: an empty name routes exactly like any other and nothing draws
    // it. The one caller that shows a name reads the live profile, not this (W4.5).
    displayName: row.display_name ?? '',
    branchId: row.branch_id,
    language: row.language,
    role: row.role,
  };
}

/** Set while OUR sign-out runs so the SIGNED_OUT event is not read as a
 * refresh failure. Module-level: events outlive the calling component. */
let userInitiatedSignOut = false;

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'loading',
      email: null,
      profile: null,
      endedSession: null,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      clearEndedSession: () => set({ endedSession: null }),

      // The same transition a refresh failure takes (guest in place, personal caches gone,
      // any pending gate action dropped), with the other banner. Idempotent: a second
      // caller finding the store already guest changes nothing.
      markAccountDeleted: () => {
        if (get().status === 'guest' || get().status === 'loading') return;
        set({
          status: 'guest',
          email: null,
          profile: null,
          endedSession: 'deleted',
        });
        useGateStore.getState().clearPending();
        forgetWhoeverThatWas();
        void supabase.auth.signOut().catch(() => undefined);
      },

      syncFromSession: async () => {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) {
          set({ status: 'guest', email: null, profile: null });
          return;
        }
        const email = session.user.email ?? null;
        // A persisted member snapshot routes instantly; the profile refresh
        // runs in the background and self-corrects.
        if (get().profile !== null) {
          set({ status: 'member', email });
          fetchProfile(session.user.id)
            .then((row) => {
              // THE SECOND DEVICE NOTICES HERE (docs/spec/03, W4.5). A phone whose owner
              // deleted the account from somewhere else still holds an access token good
              // for up to an hour, so it keeps rendering a member shell over data that is
              // gone. The refresh failure catches it eventually; this catches it on the
              // next look, which is what somebody staring at the screen experiences.
              if (row?.deleted_at != null) {
                get().markAccountDeleted();
                return;
              }
              if (row?.onboarded_at) set({ profile: toSnapshot(row) });
            })
            .catch(() => undefined); // stale snapshot is acceptable offline
          return;
        }
        try {
          const row = await fetchProfile(session.user.id);
          if (row?.deleted_at != null) {
            get().markAccountDeleted();
            return;
          }
          if (row?.onboarded_at) {
            set({ status: 'member', email, profile: toSnapshot(row) });
          } else {
            // No row, or one without onboarded_at: killed mid-AUTH-3
            // (docs/spec/03 routes this straight back to AUTH-3).
            set({ status: 'onboarding', email, profile: null });
          }
        } catch {
          // Session but the profile read failed (offline launch, no snapshot).
          // AUTH-3 is the safe destination: its submit resolves the truth
          // (an already-onboarded profile surfaces via the one-time trigger
          // and is treated as success there).
          set({ status: 'onboarding', email, profile: null });
        }
      },

      completeSignIn: async () => {
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (!session) throw new Error('completeSignIn without a session');
        const email = session.user.email ?? null;
        const row = await fetchProfile(session.user.id);
        if (row?.onboarded_at) {
          set({ status: 'member', email, profile: toSnapshot(row) });
          return 'member';
        }
        set({ status: 'onboarding', email, profile: null });
        return 'onboarding';
      },

      markOnboarded: (profile) => set({ status: 'member', profile }),

      signOut: async () => {
        userInitiatedSignOut = true;
        try {
          // BEFORE signOut, and that order is load-bearing (W3.3 slice 4): the DELETE
          // policy on `devices` is `profile_id = auth.uid()`, so once the session is gone
          // the delete matches nothing and this phone keeps receiving the departing
          // member's notifications until the receipts sweep or the 180-day prune happens
          // to collect the row. It deletes THIS device by its token, never every device
          // on the account (docs/spec/15, features/notifications/token.ts).
          await unregisterPushToken();
          // Local scope suffices; personal caches are cleared by the event
          // handler below. (Offline write queue: W2.4.)
          await supabase.auth.signOut();
        } finally {
          userInitiatedSignOut = false;
        }
        set({ status: 'guest', email: null, profile: null });
      },
    }),
    {
      name: 'agbc-auth',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the snapshot persists; status is derived per launch.
      partialize: (state) => ({ profile: state.profile, email: state.email }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/**
 * Everything a session leaves behind when it stops being the current one.
 *
 * CACHED READS that were answered for that member: the query cache is keyed by
 * what was asked (a branch, a testimony), never by who asked, so without this
 * the next person on the same phone meets the last one's data until each query
 * happens to refetch: their rhythm on the strip, their `reacted_by_me` on a feed
 * card. Found on device with two seeded members, W2.8.
 *
 * The public reads STAY, which is what `03` and `16` ask for ("keeps
 * guest-browsable caches"): losing a session should not also cost you the
 * offline verse and service card. `isPersonalQuery` is the existing persistence
 * flag read backwards, so this is one declaration rather than a list of keys to
 * keep in step, and its default drops rather than keeps.
 *
 * UNSENT WRITES, which belonged to that member and could not be replayed as
 * anyone else (docs/spec/01 §8).
 *
 * WHICH MILESTONES HAVE BEEN CELEBRATED, which is a fact about a person who has
 * been told something, not about a device. Without this the next member on the
 * phone would be silently robbed of their own first service, because the last
 * one had already "seen" that kind (W2.8 slice 4).
 *
 * AND WHETHER THIS APP HAS ASKED ABOUT NOTIFICATIONS. The OS permission belongs
 * to the install and survives on purpose, but the in-context ask is a promise
 * made to one member at one value moment, and the next member has been promised
 * nothing (`06`).
 *
 * AND ANY UNSENT NOTE DRAFTS (W3.1 slice 4): the most private words in this
 * app, persisted on the device precisely so writing offline is never lost, and
 * for exactly that reason they must not wait on a shared phone for whoever
 * signs in next.
 */
function forgetWhoeverThatWas(): void {
  queryClient.removeQueries({ predicate: isPersonalQuery });
  void useWriteQueueStore.getState().reset();
  useCelebratedStore.getState().reset();
  useNotificationAskStore.getState().reset();
  useNoteDraftStore.getState().reset();
}

/**
 * Whose answers the caches currently hold, as opposed to who the app thinks is
 * signed in. Module-level, maintained only by the listener below.
 */
let cachedIdentity: string | null = null;

// Two things end a member's claim on this device's caches, and only one of them
// is a sign-out.
//
// SIGNED_OUT is the ordinary one: a permanent refresh failure (supabase-js
// clears the session and emits it; network blips retry silently and never land
// here) or Settings' Sign out. Transition to guest in place with the banner
// (docs/spec/03); "account deleted" detection arrives with the first member
// writes (W2.3).
//
// A SIGN-IN AS SOMEBODY ELSE is the other, and it emits SIGNED_IN rather than
// SIGNED_OUT, so hanging the cleanup off the event was not enough: the access
// token of the previous session stays valid for its full hour even once the
// refresh token is gone, so the app can fetch one member's rhythm at launch,
// have a second member sign in, and keep serving the first one's answer until
// the entry goes stale. Seen on the phone at W2.8 slice 3, where Anke opened
// RHYTHM and read Marieke's streak. Identity, not the event, is the thing to
// watch.
supabase.auth.onAuthStateChange((event, session) => {
  const userId = session?.user.id ?? null;

  if (event === 'SIGNED_OUT') {
    cachedIdentity = null;
    const store = useAuthStore.getState();
    if (store.status === 'guest' || store.status === 'loading') return;
    useAuthStore.setState({
      status: 'guest',
      email: null,
      profile: null,
      endedSession: userInitiatedSignOut ? null : 'signed-out',
    });
    // A session ending in any way orphans a pending gate action (W2.2).
    useGateStore.getState().clearPending();
    forgetWhoeverThatWas();
    return;
  }

  if (userId === null || userId === cachedIdentity) return;
  // A different person now. The first identity of a launch clears nothing,
  // because a cold cache has nothing of anyone's in it; every later change does.
  const previous = cachedIdentity;
  cachedIdentity = userId;
  if (previous !== null) forgetWhoeverThatWas();
});

/** SPLASH routing (docs/spec/03 + 06): a half-created profile resumes AUTH-3;
 * everything else follows the launch store. Pure for unit tests. */
export function resolveAuthEntryRoute(
  hasOnboarded: boolean,
  status: AuthStatus,
): '/home' | '/onboarding/welcome' | '/auth/profile' {
  if (status === 'onboarding') return '/auth/profile';
  return resolveEntryRoute(hasOnboarded);
}
