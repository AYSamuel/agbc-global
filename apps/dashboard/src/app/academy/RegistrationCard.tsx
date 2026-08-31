import Link from 'next/link';

import { Pill } from '@/components/ui/Pill';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { copy } from '@/copy/en';
import type { QueueView, Registration } from '@/server/registrations';

import { setAsideAction } from './actions';
import { formatName, onDate } from './format';

/**
 * One registration, in whichever of the three views it belongs to (#164, frames approved
 * 2026-08-31).
 *
 * ONE COMPONENT FOR THREE VIEWS, because they are three states of one row rather than three
 * kinds of thing: the same payment record, before anybody has judged it, after somebody has
 * set it aside, and after it has found its member. Splitting them would put the "never show
 * the amount" rule in three places.
 *
 * WHAT IS NEVER DRAWN HERE: the amount, which is not even fetched (`server/registrations.ts`
 * says why), and WHO set a row aside, which is outside the column grant and so cannot be.
 *
 * NO AVATAR ON AN UNMATCHED ROW, deliberately. An initials disc is the app's mark of a
 * member, and the whole premise of the waiting queue is that this payer has no matched
 * account. Drawing one would assert the thing the screen is asking about.
 */
export function RegistrationCard({
  registration,
  view,
  now,
}: {
  registration: Registration;
  view: QueueView;
  now: number;
}) {
  const course = registration.courseName ?? registration.courseSlug;

  return (
    <article className="mt-3 rounded-card border border-cardline bg-card px-4.5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {view === 'waiting' ? (
          <Pill tone="notice">{copy.academy.notMatched}</Pill>
        ) : null}
        {view === 'aside' && registration.setAsideAt ? (
          <Pill>
            {copy.academy.setAsideOn(onDate(registration.setAsideAt, now))}
          </Pill>
        ) : null}
        {view === 'linked' ? (
          <Pill tone={registration.linkMethod === 'leader' ? 'good' : 'quiet'}>
            {methodLabel(registration)}
          </Pill>
        ) : null}
        <Pill>{course}</Pill>

        <span className="ml-auto flex items-center gap-2.5">
          <span className="text-small font-bold text-muted">
            {view === 'aside'
              ? copy.academy.registeredOn(onDate(registration.createdAt, now))
              : onDate(
                  view === 'linked' && registration.linkedAt
                    ? registration.linkedAt
                    : registration.createdAt,
                  now,
                )}
          </span>
          {/* ONE QUIET AFFORDANCE PER ROW on the read-only list, and the danger styling
              lives on the screen it opens. The VERSES rule: a destructive control repeated
              down a list somebody is only scanning is a control that gets mis-clicked, and
              the person being detached is not on screen here to see. */}
          {view === 'linked' ? (
            <Link
              href={`/academy/${registration.id}/unlink`}
              className="text-small font-semibold text-blue underline-offset-4 hover:underline"
            >
              {copy.academy.actions.unlink}
            </Link>
          ) : null}
        </span>
      </div>

      <div className="mt-2.5">
        <p className="font-display text-card font-extrabold text-text">
          {registration.fullName}
        </p>
        {view === 'linked' && registration.member ? (
          // The arrow always earns its place: on the left the name typed on the PAYMENT, on
          // the right the member it now belongs to, and the two are routinely different
          // words even when they are the same person.
          <p className="mt-1 flex flex-wrap items-center gap-2 text-body text-muted">
            <span className="break-all">{registration.email}</span>
            <span aria-hidden="true">→</span>
            <b className="font-extrabold text-text">
              {registration.member.displayName}
            </b>
          </p>
        ) : (
          <p className="mt-0.5 text-body break-all text-muted">
            {registration.email}
          </p>
        )}
      </div>

      {view === 'linked' ? null : (
        <p className="mt-2.5 flex flex-wrap items-center gap-2 text-small font-bold text-muted">
          <span>{formatName(registration.format)}</span>
          <Dot />
          <span>{registration.branch ?? copy.academy.noBranch}</span>
          {registration.courseName ? null : (
            <>
              <Dot />
              <span>{copy.academy.noCourse}</span>
            </>
          )}
        </p>
      )}

      {view === 'waiting' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-3.5">
          <Link
            href={`/academy/${registration.id}/link`}
            className="inline-flex min-h-12 items-center rounded-button bg-btn px-5 text-body font-extrabold text-btn-text hover:opacity-90"
          >
            {copy.academy.actions.find}
          </Link>
          <AsideForm id={registration.id} aside view="waiting" />
        </div>
      ) : null}

      {view === 'aside' ? (
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-3.5">
          <AsideForm id={registration.id} aside={false} view="aside" />
        </div>
      ) : null}
    </article>
  );
}

/**
 * Set aside, or bring back. One form for both, because they are one act in two directions
 * and the reversal is what makes the judgement safe to make (SPEC decision 4).
 */
function AsideForm({
  id,
  aside,
  view,
}: {
  id: string;
  aside: boolean;
  view: QueueView;
}) {
  return (
    <form action={setAsideAction}>
      <input type="hidden" name="registrationId" value={id} />
      <input type="hidden" name="aside" value={String(aside)} />
      <input type="hidden" name="view" value={view} />
      <SubmitButton
        variant="secondary"
        label={
          aside ? copy.academy.actions.setAside : copy.academy.actions.bringBack
        }
        pendingLabel={
          aside ? copy.academy.actions.setAside : copy.academy.actions.bringBack
        }
      />
    </form>
  );
}

function Dot() {
  return (
    <span
      aria-hidden="true"
      className="h-[3px] w-[3px] rounded-full bg-current opacity-60"
    />
  );
}

/**
 * How this registration came to be attached.
 *
 * Not decoration: it says whether a human judged it or a rule did, which is the first thing
 * you want to know when somebody tells you a course is not theirs.
 *
 * A NULL method is treated as the email match, and that is the truth rather than a default:
 * `link_method` was added after the first registrations existed, so the rows that predate it
 * are exactly the ones the automatic match attached. A value outside the enum cannot reach
 * here, since the enum is generated from the database.
 */
function methodLabel(registration: Registration): string {
  const method = registration.linkMethod;
  return method
    ? copy.academy.methods[method]
    : copy.academy.methods.email_auto;
}
