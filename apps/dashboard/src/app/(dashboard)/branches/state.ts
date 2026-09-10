import type { SaveRefusal, ServiceRow } from '@/server/branches';

/**
 * What the branch form's save can answer.
 *
 * A module of its own because `actions.ts` carries `'use server'`, and such a file may export
 * nothing but async functions: a constant beside them is a build error rather than a style
 * choice (the same reason `events/state.ts` and `broadcasts/state.ts` exist).
 */

export type BranchProblem = SaveRefusal | 'failed';

/**
 * What the admin typed, echoed back on a refusal.
 *
 * React RESETS an uncontrolled form after a form action runs, which `useActionState` does
 * not change. On a seventeen-field form that is not a nuisance, it is the whole afternoon:
 * telling somebody their timezone is misspelled must not cost them the welcome they wrote,
 * the two service rows they added and the three leaders they typed.
 */
export interface BranchValues {
  slug: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  languages: string;
  youtubeChannelId: string;
  email: string;
  lat: string;
  lng: string;
  addressLine1: string;
  addressLine2: string;
  serviceTimes: string;
  leadName: string;
  leadRole: string;
  leadBio: string;
  welcome: string;
  order: string;
  services: ServiceRow[];
  leaders: { name: string; role: string }[];
}

export type BranchFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      problem: BranchProblem;
      values: BranchValues;
      /**
       * Which attempt this is. The form is keyed on it so React REMOUNTS the inputs and
       * their new defaults actually land: changing `defaultValue` on a mounted input does
       * nothing.
       */
      attempt: number;
    };

export const NOTHING_SAVED: BranchFormState = { status: 'idle' };

/** What a confirm screen (close, re-open, move HQ) can answer. */
export type ActProblem =
  | 'name_mismatch'
  | 'bad_code'
  | 'no_factor'
  | 'has_leaders'
  | 'is_hq'
  | 'last_branch'
  | 'already'
  | 'not_found'
  | 'refused'
  | 'failed';

export type ActFormState =
  { status: 'idle' } | { status: 'error'; problem: ActProblem };

export const NOTHING_DONE: ActFormState = { status: 'idle' };
