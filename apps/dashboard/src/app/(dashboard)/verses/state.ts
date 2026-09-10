import type { ImportResult } from '@/server/verses';

/**
 * What the preview action can answer, and what the import screen starts from.
 *
 * A module of its own because `actions.ts` carries `'use server'`, and such a file may
 * export nothing but async functions: a constant next to them is a build error, not a
 * style choice (the same reason `people/state.ts` exists).
 */

export type CheckProblem =
  /** Nothing pasted, or nothing in the paste that looks like a row. */
  | 'empty'
  /** Not an admin any more, or never was. */
  | 'refused'
  | 'offline'
  | 'failed';

export type CheckState =
  | { status: 'idle' }
  | {
      status: 'checked';
      /** Rows the parser found, which is what "360 rows pasted" counts. */
      rows: number;
      result: ImportResult;
    }
  | { status: 'failed'; reason: CheckProblem };

export type CheckAction = (
  previous: CheckState,
  formData: FormData,
) => Promise<CheckState>;

/** The apply step redirects instead of answering, so it is a plain form action. */
export type ApplyAction = (formData: FormData) => void | Promise<void>;

export const NOTHING_CHECKED: CheckState = { status: 'idle' };
