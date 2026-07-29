import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/ui/AuthShell';
import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize, type DenialReason } from '@/server/authorize';

export const dynamic = 'force-dynamic';

/**
 * The door, not a destination.
 *
 * In slice 1 this WAS the destination: it showed who you are and which branch you
 * moderate, because that was the smallest thing that proved the whole chain (cookie,
 * live session, second factor, role and branch read from the database). Now that the
 * queue exists, an authorized caller belongs there, and the identity this page used to
 * show lives in the rail where the frame puts it.
 *
 * What stays here is the part with nowhere else to go: the honest refusals. A member, a
 * signed-in stranger with no profile, or a closed account gets an explanation rather
 * than a redirect loop.
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

  redirect('/moderation');
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
