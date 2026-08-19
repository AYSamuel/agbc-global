/**
 * What the composer's save action can answer.
 *
 * A module of its own because `actions.ts` carries `'use server'`, and such a file may
 * export nothing but async functions: a constant beside them is a build error rather than a
 * style choice (the same reason `verses/state.ts` and `people/state.ts` exist).
 */

export type ComposeProblem =
  /** The link is on no allowlist we keep. The advice is "use the WhatsApp copy". */
  | 'link_not_allowed'
  /** The link is not a link. The advice is "check it for a stray space". */
  | 'link_malformed'
  /** Empty title or body: the two things a broadcast cannot go out without. */
  | 'empty'
  /** Not a leader any more, or asking for a scope this caller does not hold. */
  | 'refused'
  | 'failed';

/**
 * What the leader typed, echoed back on a refusal.
 *
 * React RESETS an uncontrolled form after a form action runs, which `useActionState` does
 * not change (seen in the browser 2026-08-19: a refused link emptied every field). So the
 * values travel back with the problem and are re-applied as defaults. Without this, telling
 * someone their link is wrong costs them the message they wrote, which is a worse outcome
 * than the mistake.
 */
export interface ComposeValues {
  scope: string;
  title: string;
  body: string;
  bodyDe: string;
  bodyNl: string;
  bodyFr: string;
  link: string;
}

export type ComposeState =
  | { status: 'idle' }
  | {
      status: 'error';
      problem: ComposeProblem;
      values: ComposeValues;
      /**
       * Which attempt this is. The form is keyed on it so React REMOUNTS the inputs and
       * their new defaults actually land: changing `defaultValue` on a mounted input does
       * nothing. It lives in the state rather than in a ref because a ref read during
       * render is a bug the linter is right to refuse.
       */
      attempt: number;
    };

export const NOTHING_SAVED: ComposeState = { status: 'idle' };
