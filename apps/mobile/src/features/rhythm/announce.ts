import { create } from 'zustand';

// A one-shot thing to say about a check-in.
//
// It exists because the answer that decides the copy arrives in a WRITE QUEUE
// HANDLER, which is a plain function with no React context and no screen. Same
// shape as the auth store's `signedOutBanner`: the non-React layer records that
// something happened, and whichever screen is mounted renders it and clears it.
//
// It is not a source of truth about anything. The card and the strip read the
// rhythm row; this only decides a sentence.

/**
 * `recorded` is said by the tap itself, because it is true the moment the member
 * taps: the app has their intention and the queue will deliver it. `already` is
 * the server's correction, and the only case the tap cannot know: the day was
 * already recorded on another device, or by a replay this app has forgotten
 * about (docs/spec/10 "You're already checked in").
 */
export type CheckInAnnouncement = 'recorded' | 'already';

interface AnnounceState {
  announcement: CheckInAnnouncement | null;
  announce: (announcement: CheckInAnnouncement) => void;
  clear: () => void;
}

export const useCheckInAnnounceStore = create<AnnounceState>()((set) => ({
  announcement: null,
  announce: (announcement) => {
    set({ announcement });
  },
  clear: () => {
    set({ announcement: null });
  },
}));

/** Announce from anywhere, including the write queue handler. */
export function announceCheckIn(announcement: CheckInAnnouncement): void {
  useCheckInAnnounceStore.getState().announce(announcement);
}
