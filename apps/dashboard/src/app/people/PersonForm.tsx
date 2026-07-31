'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import type { BranchOption, FoundPerson, Role } from '@/server/assignRole';

import { CONTROL, FIELD, HINT, LABEL } from './fields';
import {
  NOTHING_ASSIGNED,
  type AssignAction,
  type AssignProblem,
  type AssignState,
} from './state';

/**
 * The person, and the change (frame: `W2.7 · PEOPLE · found`).
 *
 * Three controls and one submit, in the order the frame draws them: the role, then the
 * branch they would lead, then a code from the admin's own authenticator. The last one is
 * not ceremony. `authorize()` lets a session through for 24 hours after it clears TOTP, so
 * without this an unattended laptop could hand out authority; `17` asks for step-up on
 * role assignment specifically, and `set_member_role` refuses an aal1 session underneath
 * in case a future caller forgets.
 *
 * TWO THINGS ARE CONDITIONAL, and both are consequences of the role choice rather than
 * decoration:
 *
 *  - **The branch chooser appears only for a leader grant.** When it is not rendered no
 *    branch is submitted, and `set_member_role` then leaves `branch_id` alone. Demoting
 *    somebody must not quietly move them.
 *  - **The warning appears when this change would leave a branch with nobody leading it.**
 *    It is a warning and not a refusal, in the frame's own words: "You can still do this."
 *
 * Both need the reader's choice as it changes, which is why this is a client component
 * while the queue is not.
 */
export function PersonForm({
  person,
  branches,
  onlyLeader,
  assign,
  onFinished,
  onCancel,
}: {
  person: FoundPerson;
  branches: BranchOption[];
  /** Is this person the last leader their branch has? Read server-side at lookup. */
  onlyLeader: boolean;
  assign: AssignAction;
  onFinished: () => void;
  onCancel: () => void;
}) {
  const [state, submit, saving] = useActionState(
    guarded(assign),
    NOTHING_ASSIGNED,
  );
  const [role, setRole] = useState<Role>(person.role);
  const [branchId, setBranchId] = useState(person.branchId);
  const alertRef = useRef<HTMLDivElement>(null);

  // Our own focus move, never the framework's: a failed submit puts the keyboard on the
  // explanation, because "something is wrong somewhere above" is not recoverable for a
  // screen reader user (~/.claude/standards/frontend.md).
  useEffect(() => {
    if (state.status === 'failed') alertRef.current?.focus();
  }, [state]);

  if (state.status === 'done') {
    return (
      <div className="mt-3">
        <Alert tone="info" title={copy.people.doneTitle}>
          {done(state.role, person, branchId, branches)}
        </Alert>
        <div className="mt-4">
          <Button type="button" variant="secondary" onClick={onFinished}>
            {copy.people.findSomeoneElse}
          </Button>
        </div>
      </div>
    );
  }

  const leaderless =
    onlyLeader && (role !== 'leader' || branchId !== person.branchId);

  return (
    <article className="mt-3 rounded-card border border-cardline bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={person.displayName} />
        <div className="min-w-0">
          <p className="font-display text-[1.05rem] leading-snug font-extrabold break-words">
            {person.displayName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.78rem] text-muted">
            <span className="break-words">{person.branchName}</span>
            <span aria-hidden="true">·</span>
            <span>{copy.people.memberSince(year(person.joinedAt))}</span>
          </p>
        </div>
        {/* The mockup gives authority the gold pill and an ordinary member the quiet one,
            so who already holds something is readable before anything is chosen. */}
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold tracking-wider whitespace-nowrap uppercase ${
            person.role === 'member'
              ? 'bg-alt text-muted'
              : 'bg-[rgba(185,134,0,0.18)] text-gold-deep dark:text-accent'
          }`}
        >
          {copy.people.roleNames[person.role]}
        </span>
      </div>

      {state.status === 'failed' ? (
        <div className="mt-4">
          <Alert ref={alertRef} title={PROBLEMS[state.reason].title}>
            {PROBLEMS[state.reason].body}
          </Alert>
        </div>
      ) : null}

      <form action={submit}>
        <input type="hidden" name="targetId" value={person.id} />

        <fieldset className={FIELD}>
          <legend className={LABEL}>{copy.people.roleLabel}</legend>
          <div className="mt-1.5 inline-flex flex-wrap gap-1 rounded-control bg-alt p-1">
            {ROLES.map((option) => (
              <label
                key={option}
                className={`flex min-h-11 cursor-pointer items-center rounded-control px-4 text-body font-bold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue ${
                  role === option
                    ? 'bg-raised text-text shadow-sm'
                    : 'text-muted'
                }`}
              >
                {/* A real radio group: three buttons that look like a segmented control
                    would leave a keyboard user with no way to know they are one choice. */}
                <input
                  type="radio"
                  name="role"
                  value={option}
                  checked={role === option}
                  onChange={() => {
                    setRole(option);
                  }}
                  className="sr-only"
                />
                {copy.people.roleNames[option]}
              </label>
            ))}
          </div>
        </fieldset>

        {leaderless ? (
          <Notice
            tone="bad"
            live="polite"
            title={copy.people.leaderlessTitle(person.branchName)}
          >
            {copy.people.leaderless(person.branchName)}
          </Notice>
        ) : null}

        {role === 'leader' ? (
          <div className={FIELD}>
            <label htmlFor="people-branch" className={LABEL}>
              {copy.people.branchLabel}
            </label>
            <select
              id="people-branch"
              name="branchId"
              value={branchId}
              aria-describedby="people-branch-hint"
              onChange={(event) => {
                setBranchId(event.target.value);
              }}
              className={CONTROL}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <p id="people-branch-hint" className={HINT}>
              {copy.people.branchHint}
            </p>
          </div>
        ) : null}

        <div className={FIELD}>
          <label htmlFor="people-code" className={LABEL}>
            {copy.people.codeLabel}
          </label>
          <input
            id="people-code"
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-describedby="people-code-hint"
            aria-invalid={
              state.status === 'failed' && state.reason === 'bad_code'
            }
            className={`${CONTROL} max-w-[11.875rem] font-mono font-bold tracking-[0.34em]`}
          />
          <p id="people-code-hint" className={HINT}>
            {copy.people.codeHint}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-3.5">
          <Button type="submit" disabled={saving}>
            {saving
              ? copy.people.submitting
              : copy.people.submit(
                  firstName(person.displayName),
                  copy.people.grants[role],
                )}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {copy.people.cancel}
          </Button>
        </div>
      </form>
    </article>
  );
}

const ROLES: Role[] = ['member', 'leader', 'admin'];

/**
 * The network, told apart from a server that answered badly.
 *
 * A rejected action means the request never left or the answer never came back; a browser
 * reports that as a TypeError. Anything else got a real response and is a bug, so it is
 * not dressed up as "you appear to be offline" for somebody with a working connection.
 */
function guarded(assign: AssignAction): AssignAction {
  return async (previous: AssignState, formData: FormData) => {
    try {
      return await assign(previous, formData);
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof TypeError ? 'offline' : 'failed',
      };
    }
  };
}

function done(
  role: Role,
  person: FoundPerson,
  branchId: string,
  branches: BranchOption[],
): string {
  if (role === 'leader') {
    const branch = branches.find((option) => option.id === branchId);
    return copy.people.done.leader(
      person.displayName,
      branch?.name ?? person.branchName,
    );
  }
  return copy.people.done[role](person.displayName);
}

const PROBLEMS: Record<AssignProblem, { title: string; body: string }> = {
  bad_code: { title: copy.people.badCodeTitle, body: copy.people.badCode },
  no_factor: { title: copy.people.noFactorTitle, body: copy.people.noFactor },
  last_admin: {
    title: copy.people.lastAdminTitle,
    body: copy.people.lastAdmin,
  },
  archived_branch: {
    title: copy.people.archivedBranchTitle,
    body: copy.people.archivedBranch,
  },
  no_branch: { title: copy.people.noBranchTitle, body: copy.people.noBranch },
  // Reachable here rather than at lookup only in one way: the row went away between the
  // two requests. So it says that, instead of the lookup's "nobody has signed in yet".
  no_account: { title: copy.people.goneTitle, body: copy.people.gone },
  closed: { title: copy.people.closedTitle, body: copy.people.closed },
  not_onboarded: {
    title: copy.people.notOnboardedTitle,
    body: copy.people.notOnboarded,
  },
  yourself: { title: copy.people.yourselfTitle, body: copy.people.yourself },
  not_admin: { title: copy.people.refusedTitle, body: copy.people.refused },
  refused: { title: copy.people.refusedTitle, body: copy.people.refused },
  invalid: { title: copy.people.failedTitle, body: copy.people.failed },
  offline: { title: copy.people.offlineTitle, body: copy.people.offline },
  failed: { title: copy.people.failedTitle, body: copy.people.failed },
};

/**
 * The submit button names the person, so it needs one word of their name. No assumption
 * about which part is a family name: the first word is what a person is called in every
 * one of the four countries this ministry gathers in.
 */
function firstName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0];
  return first.length > 0 ? first : displayName;
}

function year(iso: string): string {
  return new Intl.DateTimeFormat('en', { year: 'numeric' }).format(
    new Date(iso),
  );
}
