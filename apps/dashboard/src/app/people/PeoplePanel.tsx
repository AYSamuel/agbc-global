'use client';

import { useActionState, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import type { BranchOption } from '@/server/assignRole';

import { CONTROL, FIELD, HINT, LABEL } from './fields';
import { PersonForm } from './PersonForm';
import {
  NOTHING_LOOKED_UP,
  type AssignAction,
  type FindAction,
  type LookupProblem,
  type LookupState,
} from './state';

/**
 * Find one person by their exact address (frames: `W2.7 · PEOPLE`, lookup and not-found).
 *
 * Exact match only, and no list: `17` and `20` both mean the same thing here, that nobody
 * should be able to sweep for which addresses belong to the ministry, and that a member
 * list is not a thing this dashboard renders. So the empty state IS the lookup form, and
 * the closest thing to a result set is one card.
 *
 * The address does not travel in the URL (`backend.md`: no PII in query strings), so
 * unlike the queue this screen keeps its state in memory. What that costs is spelled out
 * in `actions.ts`; what it buys is that an admin's search for a person is not written into
 * a server log, a browser history entry, or a `Referer` header.
 */
export function PeoplePanel({
  branches,
  find,
  assign,
}: {
  branches: BranchOption[];
  find: FindAction;
  assign: AssignAction;
}) {
  const [answer, look, looking] = useActionState(
    guarded(find),
    NOTHING_LOOKED_UP,
  );
  const [email, setEmail] = useState('');
  /**
   * The answer the reader has finished with, held by identity rather than by a flag.
   * Every dispatch returns a NEW state object, so a fresh answer is never equal to a
   * dismissed one and shows immediately; a boolean would have to be unset by hand, and
   * the day somebody forgot, a lookup would silently return nothing.
   */
  const [dismissed, setDismissed] = useState<LookupState | null>(null);
  const state = answer === dismissed ? NOTHING_LOOKED_UP : answer;

  function startOver() {
    setDismissed(answer);
    setEmail('');
  }

  return (
    <>
      {state.status === 'idle' ? (
        <>
          {/* The rule sits where the work is done, like the queue's safeguarding note,
              and drops away once a lookup has happened: the frames show it only on the
              screen where nothing has been typed yet. */}
          <div className="mt-4 flex items-start gap-3 rounded-card border border-[rgba(185,134,0,0.34)] bg-[rgba(255,207,74,0.14)] px-4 py-3">
            <span
              aria-hidden="true"
              className="mt-px text-gold-deep dark:text-accent"
            >
              ⚠
            </span>
            <p className="text-body leading-relaxed text-text">
              <b className="font-extrabold">{copy.people.guideTitle}</b>{' '}
              {copy.people.guide}
            </p>
          </div>

          <form action={look}>
            <div className={FIELD}>
              <label htmlFor="people-email" className={LABEL}>
                {copy.people.emailLabel}
              </label>
              <input
                id="people-email"
                name="email"
                type="email"
                required
                // No autofill: the address being typed is somebody else's, and offering
                // the admin their own would be both useless and the one address the
                // lookup refuses.
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="people-email-hint"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                className={CONTROL}
              />
              <p id="people-email-hint" className={HINT}>
                {copy.people.emailHint}
              </p>
            </div>
            <div className="mt-4">
              <Button type="submit" disabled={looking}>
                {looking ? copy.people.finding : copy.people.find}
              </Button>
            </div>
          </form>
        </>
      ) : (
        // After a lookup the address is a record of what was asked, not a field to edit:
        // the frames drop the hint and the button, and the way back is Cancel or Look
        // again. Read-only rather than removed, so what was searched stays on screen.
        <div className={FIELD}>
          <label htmlFor="people-searched" className={LABEL}>
            {copy.people.emailLabel}
          </label>
          <input
            id="people-searched"
            type="email"
            readOnly
            value={state.email}
            className={CONTROL}
          />
        </div>
      )}

      {state.status === 'found' ? (
        <>
          <h2 className="pt-5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
            {copy.people.personLabel}
          </h2>
          <PersonForm
            // Keyed on the person: looking somebody else up must not inherit the last
            // one's chosen role.
            key={state.person.id}
            person={state.person}
            branches={branches}
            onlyLeader={state.onlyLeader}
            assign={assign}
            onFinished={startOver}
            onCancel={startOver}
          />
        </>
      ) : null}

      {state.status === 'failed' ? (
        <Notice
          live="polite"
          title={
            state.reason === 'no_account'
              ? copy.people.noAccountTitle(state.email)
              : PROBLEMS[state.reason].title
          }
          action={
            <Button type="button" variant="secondary" onClick={startOver}>
              {copy.people.lookAgain}
            </Button>
          }
        >
          {PROBLEMS[state.reason].body}
        </Notice>
      ) : null}
    </>
  );
}

/** Only `no_account` interpolates the address, so its title is built at the call site. */
const PROBLEMS: Record<LookupProblem, { title: string; body: string }> = {
  no_account: {
    title: copy.people.noAccountTitle(''),
    body: copy.people.noAccount,
  },
  closed: { title: copy.people.closedTitle, body: copy.people.closed },
  not_onboarded: {
    title: copy.people.notOnboardedTitle,
    body: copy.people.notOnboarded,
  },
  yourself: { title: copy.people.yourselfTitle, body: copy.people.yourself },
  invalid: { title: copy.people.invalidTitle, body: copy.people.invalid },
  refused: { title: copy.people.refusedTitle, body: copy.people.refused },
  offline: { title: copy.people.offlineTitle, body: copy.people.offline },
  failed: { title: copy.people.failedTitle, body: copy.people.failed },
};

/** See the note on the same wrapper in PersonForm: the network, told apart from a bug. */
function guarded(find: FindAction): FindAction {
  return async (previous: LookupState, formData: FormData) => {
    // `get` answers with a File for a file input, which this form does not have and
    // must not grow one: an address that is not a string is not an address.
    const entry = formData.get('email');
    const email = typeof entry === 'string' ? entry.trim() : '';
    try {
      return await find(previous, formData);
    } catch (error) {
      return {
        status: 'failed',
        email,
        reason: error instanceof TypeError ? 'offline' : 'failed',
      };
    }
  };
}
