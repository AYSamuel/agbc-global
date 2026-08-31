import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { FocusOnArrival } from '@/components/ui/FocusOnArrival';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadRegistration } from '@/server/registrations';

import { unlinkAction } from '../../actions';
import { onDate } from '../../format';

export const dynamic = 'force-dynamic';

/**
 * Detaching a registration from the member it was attached to (#164, UNLINK frame, approved
 * 2026-08-31).
 *
 * A TYPED NAME HERE AND NOT ON THE LINK, and the pair is deliberate. Linking tells somebody
 * something true and welcome and is reversed by the person doing it; unlinking detaches a
 * member from a course they have PAID for, and what it hands back to the queue is a
 * stranger's payment record again. A code from the authenticator is still not asked for:
 * nothing leaves for a phone, and linking it again restores it exactly. That is the same
 * scale the branches module set (`17` §5): the gate follows the blast radius, not the drama.
 *
 * OFFERED ON EVERY LINKED ROW, not only the ones a human attached. A wrong hand-link PROVES
 * the address, so the next payment from it attaches to the wrong member automatically, as
 * `email_auto`. Restricting this to `link_method = 'leader'` would make the one error this
 * tool can cause the one error it cannot repair.
 *
 * NOTHING IS SENT, which is a decision rather than an omission (SPEC §The notification):
 * there is no kind way to push "that course is not yours after all", and the admin who
 * unlinked knows why and can reach the member as a person.
 */
export default async function UnlinkRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'link_registrations' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    redirect('/academy');
  }

  const { id } = await params;
  const { registration, readAt } = await loadRegistration(supabase, id);
  if (!registration) notFound();

  // A row that is not attached to anybody has nothing to detach. `unlink_registration` says
  // so too; sending the reader back is kinder than a confirm that can only end in an error.
  if (!registration.member) redirect('/academy');

  const mismatch = readParam((await searchParams).problem) === 'name_mismatch';
  const member = registration.member;
  const course = registration.courseName ?? registration.courseSlug;

  return (
    <DashboardShell caller={verdict.caller} current="academy">
      <PageHeader
        title={copy.academy.unlink.title(member.displayName)}
        scope={copy.academy.unlink.scope(
          course,
          registration.linkedAt
            ? onDate(registration.linkedAt, readAt)
            : onDate(registration.createdAt, readAt),
        )}
      />

      <article className="mt-4 rounded-card border border-cardline bg-card px-4.5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[min(14rem,100%)] flex-1">
            <p className="font-display text-card font-extrabold text-text">
              {registration.fullName}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-body text-muted">
              <span className="break-all">{registration.email}</span>
              <span aria-hidden="true">→</span>
              <b className="font-extrabold text-text">{member.displayName}</b>
            </p>
          </div>
          <Pill>{course}</Pill>
        </div>
      </article>

      <Notice
        tone="off"
        title={copy.academy.unlink.silenceTitle(member.displayName)}
      >
        {copy.academy.unlink.silenceBody(course)}
      </Notice>

      {/* The one thing an admin is most likely to assume this undoes, and does not. */}
      <Notice tone="bad" title={copy.academy.unlink.addressTitle}>
        {copy.academy.unlink.addressBody(
          registration.email,
          member.displayName,
        )}
      </Notice>

      <Notice tone="off" title={copy.academy.unlink.backTitle}>
        {copy.academy.unlink.backBody}
      </Notice>

      <form action={unlinkAction} className="mt-4 max-w-[520px]">
        <input type="hidden" name="registrationId" value={registration.id} />

        {/* Focused on arrival: this is a FAILED SUBMIT rendered by a redirect, so the
            button that was focused is gone and, without this, a keyboard user lands on
            `<body>` eleven tab stops above the field they have to correct
            (~/.claude/standards/frontend.md: move focus to the error summary). */}
        {mismatch ? (
          <FocusOnArrival signal="name_mismatch">
            <Notice
              tone="bad"
              title={copy.academy.unlink.nameMismatch}
              live="assertive"
            >
              {copy.academy.unlink.nameMismatchBody(member.displayName)}
            </Notice>
          </FocusOnArrival>
        ) : null}

        <div className="mt-4">
          <label
            htmlFor="confirmName"
            className="block text-label font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.academy.unlink.typeLabel}
          </label>
          <input
            id="confirmName"
            name="confirmName"
            required
            autoComplete="off"
            aria-invalid={mismatch || undefined}
            aria-describedby="confirmName-hint"
            placeholder={member.displayName}
            className={`mt-1.5 min-h-12 w-full rounded-input border bg-card px-3.5 py-3 text-body text-text ${
              mismatch ? 'border-danger' : 'border-cardline'
            }`}
          />
          <p id="confirmName-hint" className="mt-1.5 text-small text-muted">
            {copy.academy.unlink.typeHint}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-3.5">
          <SubmitButton
            variant="danger"
            label={copy.academy.unlink.submit}
            pendingLabel={copy.academy.unlink.pending}
          />
          <Link
            href="/academy?view=linked"
            className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
          >
            {copy.academy.unlink.cancel}
          </Link>
        </div>
      </form>
    </DashboardShell>
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
