import type {
  AssignFailure,
  FoundPerson,
  LookupFailure,
  Role,
} from '@/server/assignRole';

/**
 * What the two People actions can answer, and what the screen starts from.
 *
 * A module of its own because `actions.ts` carries `'use server'`, and such a file may
 * export nothing but async functions: a constant next to them is a build error, not a
 * style choice. Types are erased and could have stayed, but they belong with the
 * constants that share their shape.
 */

export type LookupProblem =
  LookupFailure | 'invalid' | 'refused' | 'offline' | 'failed';

export type LookupState =
  | { status: 'idle' }
  | { status: 'found'; email: string; person: FoundPerson; onlyLeader: boolean }
  | { status: 'failed'; email: string; reason: LookupProblem };

export type FindAction = (
  previous: LookupState,
  formData: FormData,
) => Promise<LookupState>;

export const NOTHING_LOOKED_UP: LookupState = { status: 'idle' };

export type AssignProblem = AssignFailure | 'invalid' | 'refused' | 'offline';

export type AssignState =
  | { status: 'idle' }
  | { status: 'done'; role: Role }
  | { status: 'failed'; reason: AssignProblem };

export type AssignAction = (
  previous: AssignState,
  formData: FormData,
) => Promise<AssignState>;

export const NOTHING_ASSIGNED: AssignState = { status: 'idle' };
