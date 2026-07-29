import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/ui/AuthShell';
import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize, type DenialReason } from '@/server/authorize';

export const dynamic = 'force-dynamic';

/**
 * Slice 1's whole surface: who you are, and which branch you moderate.
 *
 * Deliberately nothing else. The point of the slice is that the authorization layer
 * exists and is tested BEFORE anything valuable sits behind it, so this page is the
 * smallest thing that proves the chain end to end: cookie, live session, second factor,
 * role and branch read from the database.
 */
export default async function HomePage() {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'access_dashboard' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    return <Refused reason={verdict.reason} />;
  }

  const { caller } = verdict;

  return (
    <AuthShell title={copy.identity.title}>
      <dl className="flex flex-col gap-4 rounded-card border border-cardline bg-card p-5">
        <Row label={copy.identity.emailLabel} value={caller.email} />
        <Row
          label={copy.identity.roleLabel}
          value={copy.identity.roles[caller.role]}
        />
        <Row
          label={copy.identity.branchLabel}
          value={
            caller.role === 'admin'
              ? copy.identity.adminScope
              : caller.branchName
          }
        />
      </dl>

      <p className="text-body leading-relaxed text-sub">
        {copy.identity.comingNext}
      </p>

      <SignOutButton />
    </AuthShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label font-bold tracking-wide text-muted uppercase">
        {label}
      </dt>
      {/* break-words because these are DATA, not copy: an email address is one long
          unbreakable token, and at a large text size on a narrow window it pushes the
          whole page sideways if it is not allowed to wrap. */}
      <dd className="text-card font-semibold break-words text-text">{value}</dd>
    </div>
  );
}

/**
 * An honest door rather than a blank page: a member who opens the dashboard is told
 * what this is and what to do about it, and is never left staring at an empty screen or
 * bounced into a redirect loop. Grace-framed, per the project conventions: nothing here
 * implies they did something wrong.
 */
function Refused({ reason }: { reason: DenialReason }) {
  const text =
    reason === 'no_profile'
      ? { title: copy.refused.noProfileTitle, body: copy.refused.noProfileBody }
      : reason === 'account_closed'
        ? {
            title: copy.refused.accountClosedTitle,
            body: copy.refused.accountClosedBody,
          }
        : {
            title: copy.refused.notStaffTitle,
            body: copy.refused.notStaffBody,
          };

  return (
    <AuthShell title={text.title} intro={text.body}>
      <SignOutButton />
    </AuthShell>
  );
}

/**
 * A real form POST, so signing out works with HTML alone and cannot be triggered by a
 * cross-site GET.
 */
function SignOutButton() {
  return (
    <form action="/auth/sign-out" method="post">
      <Button type="submit" variant="secondary" block>
        {copy.app.signOut}
      </Button>
    </form>
  );
}
