import { AuthShell } from '@/components/ui/AuthShell';
import { copy } from '@/copy/en';
import { safeNext } from '@/lib/safeNext';

import { SignInForm } from './SignInForm';

// Never cached: this page reads the session cookie, and a cached copy is how one
// person's Set-Cookie reaches another person's browser (Supabase SSR advanced guide).
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AuthShell title={copy.signIn.title} intro={copy.signIn.intro}>
      <SignInForm next={safeNext(params.next)} />
    </AuthShell>
  );
}
