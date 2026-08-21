import { create } from 'zustand';

/**
 * Has the re-home prompt already interrupted this launch?
 *
 * IN MEMORY ON PURPOSE, and it is the whole of the "once per launch" rule. Persisting it
 * would make the prompt a once-ever event, which is exactly wrong: the decision (with Ayo,
 * 2026-08-20) is that the prompt can be put off, and a member who puts it off should meet it
 * again next time they open the app. Between launches, Home's card is what carries it.
 *
 * A store rather than a module-level flag so a test can reset it, and so Fast Refresh cannot
 * leave a stale `true` behind mid-session.
 */
interface RehomePromptState {
  prompted: boolean;
  markPrompted: () => void;
  reset: () => void;
}

export const useRehomePromptStore = create<RehomePromptState>()((set) => ({
  prompted: false,
  markPrompted: () => {
    set({ prompted: true });
  },
  reset: () => {
    set({ prompted: false });
  },
}));
