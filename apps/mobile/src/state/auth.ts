import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
  /** True when a session ended WITHOUT the user asking (refresh failure):
   * the root layout shows the non-blocking signed-out toast (docs/spec/03). */
  signedOutBanner: boolean;
  hydrated: boolean;
  setHydrated: () => void;
  clearSignedOutBanner: () => void;
  /** Launch + auth-event reconciliation; safe to call repeatedly. */
  syncFromSession: () => Promise<void>;
  /** AUTH-2 success: decides AUTH-3 vs AUTH-4. */
  completeSignIn: () => Promise<'onboarding' | 'member'>;
  /** AUTH-3 success: the profile now exists with onboarded_at set. */
  markOnboarded: (profile: ProfileSnapshot) => void;
  signOut: () => Promise<void>;
}

interface ProfileRow {
  display_name: string;
  branch_id: string;
  language: string;
  role: string;
  onboarded_at: string | null;
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, branch_id, language, role, onboarded_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function toSnapshot(row: ProfileRow): ProfileSnapshot {
  return {
    displayName: row.display_name,
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
      signedOutBanner: false,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      clearSignedOutBanner: () => set({ signedOutBanner: false }),

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
              if (row?.onboarded_at) set({ profile: toSnapshot(row) });
            })
            .catch(() => undefined); // stale snapshot is acceptable offline
          return;
        }
        try {
          const row = await fetchProfile(session.user.id);
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
          // Local scope suffices; personal caches are cleared by the event
          // handler below. (Offline write queue: W2.4; devices rows: W3.3.)
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
 */
function forgetWhoeverThatWas(): void {
  queryClient.removeQueries({ predicate: isPersonalQuery });
  void useWriteQueueStore.getState().reset();
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
      signedOutBanner: !userInitiatedSignOut,
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
