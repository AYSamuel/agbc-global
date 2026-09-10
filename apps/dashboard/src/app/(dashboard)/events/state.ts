import type { SaveRefusal } from '@/server/events';

/**
 * What the event form's save can answer.
 *
 * A module of its own because `actions.ts` carries `'use server'`, and such a file may export
 * nothing but async functions: a constant beside them is a build error rather than a style
 * choice (the same reason `broadcasts/state.ts` and `verses/state.ts` exist).
 */

export type EventProblem = SaveRefusal | 'failed';

/**
 * What the leader typed, echoed back on a refusal.
 *
 * React RESETS an uncontrolled form after a form action runs, which `useActionState` does not
 * change (seen in the browser 2026-08-19, on the broadcast composer: a refused link emptied
 * every field). So the values travel back with the problem and are re-applied as defaults.
 * Telling somebody their end time is before their start time must not cost them the
 * description they wrote.
 */
export interface EventValues {
  scope: string;
  title: string;
  description: string;
  startsAtLocal: string;
  endsAtLocal: string;
  location: string;
  rsvpEnabled: boolean;
}

export type EventFormState =
  | { status: 'idle' }
  | {
      status: 'error';
      problem: EventProblem;
      values: EventValues;
      /**
       * Which attempt this is. The form is keyed on it so React REMOUNTS the inputs and
       * their new defaults actually land: changing `defaultValue` on a mounted input does
       * nothing.
       */
      attempt: number;
    };

export const NOTHING_SAVED: EventFormState = { status: 'idle' };
