import { redirect } from 'next/navigation';

import { AuthShell } from '@/components/ui/AuthShell';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safeNext';
import { requireSession, sessionAssurance } from '@/server/authorize';

import { MfaChallengeForm } from './MfaChallengeForm';
import { MfaEnrolForm } from './MfaEnrolForm';

export const dynamic = 'force-dynamic';

/**
 * The one page that cannot ask authorize() for permission, because a leader is here
 * precisely to earn it. It checks only that a session exists, then decides what to ask
 * for: enrol a factor, clear one, or clear one again because the last time was over a
 * day ago (docs/spec/17's "short idle timeout" for staff, enforced here because Supabase
 * session timeouts are project-wide and would sign out the app's members too).
 */
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const supabase = await createServerComponentClient();
  const session = await requireSession(supabase);
  if (!session) {
    redirect(`/sign-in?next=${encodeURIComponent(`/mfa?next=${next}`)}`);
  }

  const assurance = await sessionAssurance(supabase);

  if (assurance.verified && assurance.fresh) {
    // Nothing to ask for. Someone followed a stale link or hit back.
    redirect(next);
  }

  if (!assurance.enrolled) {
    return (
      <AuthShell title={copy.mfa.enrolTitle} intro={copy.mfa.enrolIntro}>
        <MfaEnrolForm next={next} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={copy.mfa.challengeTitle}
      intro={assurance.verified ? copy.mfa.staleIntro : copy.mfa.challengeIntro}
    >
      <MfaChallengeForm next={next} />
    </AuthShell>
  );
}
