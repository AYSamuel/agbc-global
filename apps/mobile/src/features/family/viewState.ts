import { create } from 'zustand';

import type { FamilyScope } from './queries';

export type FamilySubTab = 'testimonies' | 'prayer' | 'map';

/**
 * What the Family feed is currently SHOWING: which sub-tab, and whose posts.
 *
 * WHY THIS IS A STORE AND NOT COMPONENT STATE. It was two `useState`s inside the
 * Family tab, which was right while the feed had exactly one place to live. The
 * tablet gives it two: opening a testimony draws the feed again in the list pane
 * beside it (W4.7 slice 4). With local state the pane would start on its own
 * defaults, so a member reading their branch's prayer requests would tap one and
 * find testimonies from everywhere beside it.
 *
 * That is the project's own "one visible fact, one owner" rule, which W2.4 paid
 * for in four device-only bugs: a value on screen has exactly one source, and
 * deriving it from two stores that update independently is the bug rather than
 * an implementation detail.
 *
 * Deliberately NOT persisted. Scope is a glance, not a preference: `09` has the
 * feed open on Everywhere each time, and a remembered scope would quietly hide
 * the rest of the family from somebody who narrowed it once.
 */
interface FamilyViewState {
  tab: FamilySubTab;
  scope: FamilyScope;
  setTab: (tab: FamilySubTab) => void;
  setScope: (scope: FamilyScope) => void;
}

export const useFamilyViewStore = create<FamilyViewState>((set) => ({
  tab: 'testimonies',
  scope: 'everywhere',
  setTab: (tab) => {
    set({ tab });
  },
  setScope: (scope) => {
    set({ scope });
  },
}));
