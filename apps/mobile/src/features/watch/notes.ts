import { useCallback, useEffect, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LargeSecureStore } from '@/lib/largeSecureStore';
import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';

// SERMON-NOTES (docs/spec/08, W3.1 slice 4): ONE autosaved document per member
// per message, which the database enforces since 20260815120000. The editor
// owns three facts and their order:
//
//   - Every keystroke lands in the PERSISTED DRAFT first (decision 5 at the
//     frame gate: writing offline is never lost, even to process death).
//   - The server copy follows on a debounce, by upsert on the unique
//     (profile_id, sermon_id): the newest write wins the body, which is the
//     semantics the constraint was added FOR (two devices autosaving must
//     converge on one document rather than split it).
//   - On open, the NEWER of draft and server is the page, the same rule the
//     resume layer uses (preferredPosition, `08`): a note written through a
//     flight must not be rewound by a blind server read on landing.
//
// Deliberately NOT the write queue: notes are content, not a one-tap wish
// (`01` §8 keeps composition out of the queue), and the draft store already
// carries the offline promise. The queue's own `saved` kind is Save's.

export interface SermonNote {
  body: string;
  /** Parsed from the row's updated_at; the draft comparison needs a number. */
  updatedAt: number;
}

export function noteQueryKey(sermonId: string) {
  return ['sermonNote', sermonId] as const;
}

/** The caller's own document for this message, or null before the first word.
 * No profile filter: RLS scopes the table to the caller's own rows. */
export function useNoteQuery(sermonId: string, enabled: boolean) {
  return useQuery({
    queryKey: noteQueryKey(sermonId),
    queryFn: async (): Promise<SermonNote | null> => {
      const { data, error } = await supabase
        .from('sermon_notes')
        .select('body, updated_at')
        .eq('sermon_id', sermonId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { body: data.body, updatedAt: Date.parse(data.updated_at) };
    },
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * The autosave write: the PostgREST merge-duplicates upsert proven against the
 * local stack (20260815120000). Nothing names profile_id: the column defaults
 * to auth.uid() and the grant refuses a client that tries. Never throws, so a
 * debounce timer or an unmount flush cannot take the screen down.
 */
export async function saveNoteToServer(
  sermonId: string,
  body: string,
): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user.id) return false;
    const { error } = await supabase
      .from('sermon_notes')
      .upsert(
        { sermon_id: sermonId, body },
        { onConflict: 'profile_id,sermon_id' },
      );
    return !error;
  } catch {
    return false;
  }
}

// --- The persisted draft -----------------------------------------------------

export interface NoteDraft {
  body: string;
  updatedAt: number;
}

/** Bounded like the playback store: drafts clear on successful save, so this
 * cap only matters to someone offline across many messages. */
const MAX_DRAFTS = 50;

/**
 * The encrypted store, built on FIRST USE rather than at import.
 *
 * `new LargeSecureStore()` requires expo-secure-store and expo-crypto in its
 * constructor, and `zustand`'s storage factory runs when the store is created,
 * which is module-import time. `state/auth` imports this module for the
 * sign-out clear, so that construction reached into every module graph in the
 * app and every test that loads one: it took the analytics suite down with five
 * failures (measured 2026-08-15 by swapping the adapter back and forth, not
 * guessed). Behind this thunk, importing the module does nothing, and the
 * native modules are touched only when a draft is actually read or written.
 */
let encryptedDrafts: LargeSecureStore | null = null;
function draftStorage(): LargeSecureStore {
  encryptedDrafts ??= new LargeSecureStore();
  return encryptedDrafts;
}

interface NoteDraftsState {
  drafts: Record<string, NoteDraft>;
  setDraft: (sermonId: string, body: string, now?: number) => void;
  clearDraft: (sermonId: string) => void;
  /** Sign-out: notes are the most private thing written in this app, and a
   * draft must not wait on a shared phone for the next person (docs/spec/03
   * sign-out clears personal state; wired in state/auth). */
  reset: () => void;
}

export const useNoteDraftStore = create<NoteDraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (sermonId, body, now = Date.now()) => {
        set((state) => ({
          drafts: pruneDrafts(
            { ...state.drafts, [sermonId]: { body, updatedAt: now } },
            MAX_DRAFTS,
          ),
        }));
      },
      clearDraft: (sermonId) => {
        set((state) => ({
          drafts: Object.fromEntries(
            Object.entries(state.drafts).filter(([id]) => id !== sermonId),
          ),
        }));
      },
      reset: () => {
        set({ drafts: {} });
      },
    }),
    {
      name: 'agbc-note-drafts',
      // ENCRYPTED AT REST, not plain AsyncStorage (decided with Ayo,
      // 2026-08-15). A draft is somebody's reflection on a sermon, which is
      // religious belief about a named person: special-category data under GDPR
      // Art. 9, and `20` treats this app as higher-stakes for exactly that
      // reason. `LargeSecureStore` is the adapter the Supabase SESSION already
      // uses (`lib/supabase.ts`, docs/spec/03): a fresh AES-256 key per write in
      // Keychain/Keystore, the ciphertext in AsyncStorage. Reusing it rather
      // than inventing a second scheme is the whole point of it existing.
      //
      // Its degraded mode suits this too: on a dev client built before the
      // native modules, or after any native failure, it falls back to IN-MEMORY
      // rather than to plaintext. The cost is that a draft does not survive a
      // relaunch there, which is a dev-only condition and the safe direction.
      storage: createJSONStorage(() => ({
        getItem: (name) => draftStorage().getItem(name),
        setItem: (name, value) => draftStorage().setItem(name, value),
        removeItem: (name) => draftStorage().removeItem(name),
      })),
      // Hydration is NOT automatic, and that is about imports rather than about
      // notes. `persist` reads storage the moment the store is created, which is
      // module-import time, and `state/auth` imports this module for the
      // sign-out clear, so every module graph in the app (and in every test)
      // would reach for Keychain/Keystore just by being loaded. It broke the
      // analytics suite outright when this store moved off AsyncStorage
      // (measured 2026-08-15, not guessed: swapping the adapter back made those
      // five failures vanish).
      //
      // With this flag, importing the module does nothing at all, and the read
      // happens on the first `useDraftsHydrated()` instead: the notes screen is
      // the only thing that wants drafts, it already waits for them, and its
      // skeleton is exactly the frame that covers the wait.
      skipHydration: true,
    },
  ),
);

/**
 * Whether the persisted drafts are on hand yet.
 *
 * `persist` rehydrates from storage asynchronously (more so now that the read
 * also unlocks a Keychain/Keystore key), so on a COLD open
 * straight into this screen (a deep link, a notification) the store is briefly
 * empty. The editor decides its opening copy exactly once, at mount, from what
 * the store holds then, so mounting it early would read "no draft", open on the
 * server copy, and autosave that over the newer words the member wrote offline.
 * The screen waits for this before mounting the editor, which costs a frame of
 * skeleton and cannot cost anybody a note.
 */
export function useDraftsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useNoteDraftStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (hydrated) return;
    // Subscribe BEFORE asking, so a read that resolves immediately cannot
    // finish between the two lines and leave this waiting forever.
    const unsubscribe = useNoteDraftStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    // The store is created with `skipHydration`, so this is what actually
    // reaches for the encrypted drafts: the first screen that wants them asks,
    // and repeat calls are harmless (they re-read, they do not double-apply).
    void useNoteDraftStore.persist.rehydrate();
    return unsubscribe;
  }, [hydrated]);
  return hydrated;
}

/** Keep the most recently touched drafts only. Pure, for tests. */
export function pruneDrafts(
  drafts: Record<string, NoteDraft>,
  max: number,
): Record<string, NoteDraft> {
  const entries = Object.entries(drafts);
  if (entries.length <= max) return drafts;
  return Object.fromEntries(
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, max),
  );
}

// --- Pure decisions, for tests ----------------------------------------------

/**
 * What the page opens on: the newer of the two copies (the resume layer's rule,
 * `08`). A draft only exists while something is unsent, so when it is also the
 * newer copy the editor owes the server a write.
 */
export function openingCopy(
  draft: NoteDraft | undefined,
  server: SermonNote | null,
): { body: string; dirty: boolean } {
  if (draft && (server === null || draft.updatedAt > server.updatedAt)) {
    return { body: draft.body, dirty: true };
  }
  return { body: server?.body ?? '', dirty: false };
}

/**
 * The Add button's edit: the timestamp lands on its own line at the end of the
 * page, exactly as a hand writes the next heading in a paper notebook. The
 * frame draws the time, a line break, then the words that will follow it.
 */
export function appendTimestamp(body: string, clock: string): string {
  const trimmed = body.replace(/\s+$/u, '');
  return trimmed === '' ? `${clock}\n` : `${trimmed}\n\n${clock}\n`;
}

// --- The autosave machine ----------------------------------------------------

export type NoteStatus = 'idle' | 'saving' | 'saved' | 'unsaved';

/** How long the pen rests before the page goes up. */
const DEBOUNCE_MS = 1500;
/** Retry cadence while unsaved and the screen is open. */
const RETRY_MS = 10_000;

export interface NoteEditor {
  body: string;
  status: NoteStatus;
  setBody: (text: string) => void;
}

/**
 * The editor's state machine.
 *
 * `server` is the ANSWER, not a query: the screen mounts this only once the
 * read has come back (or failed with a draft in hand), so the opening copy is
 * decided in a lazy initializer rather than in an effect that would have to
 * setState synchronously on arrival. That is the React Compiler's rule and it
 * is also the clearer shape: this hook has no "not ready yet" state to render.
 *
 * The order inside `setBody` is the offline promise: draft first (persisted,
 * synchronous), debounce second, so the words reach disk about a second and a
 * half before they reach the wire.
 *
 * Measured on the device (2026-08-15), because encrypting the draft made the
 * disk write slower than it looks: the store is durable within roughly a second
 * of a keystroke, not instantly. Killing the app immediately after typing still
 * loses the last words; killing it a second later does not. That is the honest
 * shape of the promise, and it is the right trade for keeping a member's
 * reflections out of plaintext storage.
 */
export function useNoteEditor(
  sermonId: string,
  server: SermonNote | null,
): NoteEditor {
  // Read once, at mount: everything after this is the member's own typing.
  const [opening] = useState(() => {
    const draft = useNoteDraftStore.getState().drafts[sermonId] as
      NoteDraft | undefined;
    const chosen = openingCopy(draft, server);
    const serverBody = server?.body ?? '';
    // A draft that merely REPEATS the server (the save landed but the clear
    // did not) owes nothing, and is cleared rather than re-sent.
    return { ...chosen, dirty: chosen.dirty && chosen.body !== serverBody };
  });

  const [body, setBodyState] = useState(opening.body);
  const [status, setStatus] = useState<NoteStatus>(
    opening.dirty ? 'unsaved' : opening.body === '' ? 'idle' : 'saved',
  );

  const bodyRef = useRef(opening.body);
  const lastSavedRef = useRef(
    opening.dirty ? (server?.body ?? '') : opening.body,
  );
  const inFlightRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // One pass, looping rather than calling itself: a member who keeps typing
  // while a save is in flight is answered by the next turn of this loop, and
  // the function never has to name itself (which the compiler's immutability
  // rule forbids, and which made the retry path harder to follow anyway).
  const flush = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      while (bodyRef.current !== lastSavedRef.current) {
        const toSend = bodyRef.current;
        if (mountedRef.current) setStatus('saving');
        const ok = await saveNoteToServer(sermonId, toSend);
        if (!ok) {
          // Nothing was decided, so nothing is lost: the draft still holds the
          // words and the retry effect below tries again on its own cadence.
          if (mountedRef.current) setStatus('unsaved');
          return;
        }
        lastSavedRef.current = toSend;
        // The query's copy follows the save, so reopening does not flash the
        // stale body while refetching.
        queryClient.setQueryData<SermonNote | null>(
          noteQueryKey(sermonId),
          () => ({ body: toSend, updatedAt: Date.now() }),
        );
      }
      useNoteDraftStore.getState().clearDraft(sermonId);
      if (mountedRef.current) setStatus('saved');
    } finally {
      inFlightRef.current = false;
    }
  }, [sermonId]);

  const setBody = useCallback(
    (text: string) => {
      bodyRef.current = text;
      setBodyState(text);
      // Draft first (encrypted, on disk), wire second: the promise is in that
      // order, and the gap between them is the 1.5s below.
      useNoteDraftStore.getState().setDraft(sermonId, text);
      setStatus('unsaved');
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void flush();
      }, DEBOUNCE_MS);
    },
    [sermonId, flush],
  );

  // The opening draft that outranked the server owes a write straight away.
  // Through a timer rather than in the effect body, because `flush` sets state
  // on its first line and an effect must not do that synchronously.
  useEffect(() => {
    if (!opening.dirty) {
      // The other half of the same decision: a draft that only repeated the
      // server is stale bookkeeping, and the page it belongs to is already up.
      if (opening.body !== '')
        useNoteDraftStore.getState().clearDraft(sermonId);
      return;
    }
    const timer = setTimeout(() => {
      void flush();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [opening.dirty, opening.body, sermonId, flush]);

  // While anything is unsent, keep trying. This is the offline case and only
  // the offline case: during ordinary typing the 1.5s debounce always wins the
  // race to the wire, so this timer never gets to fire.
  useEffect(() => {
    if (status !== 'unsaved') return;
    const timer = setInterval(() => {
      void flush();
    }, RETRY_MS);
    return () => {
      clearInterval(timer);
    };
  }, [status, flush]);

  // Unmount: one last attempt, fire and forget. The draft already holds the
  // words, so a failure here loses nothing; a success means the next open
  // starts clean.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void flush();
    };
  }, [flush]);

  return { body, status, setBody };
}
