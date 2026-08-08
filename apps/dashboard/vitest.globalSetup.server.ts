import { createClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { localStack } from './src/test/localStack';

/**
 * Clears anything a previous run left in the local stack.
 *
 * Each test file owns its branches and deletes them in `afterAll`, and since
 * 20260808123451 that actually works. This is for the case teardown cannot cover: a run
 * killed part way through, or a `beforeAll` that throws. The rows then survive, and
 * because they are real branches they turn up in the APP, in the branch switcher, on a
 * developer's phone, which is how the whole problem was noticed (W2.8).
 *
 * Sweeping at the START rather than the end is the point: a crashed run cannot clean up
 * after itself, so the only reliable moment is before the next one. Profiles go first (a
 * profile pointing at a branch makes the branch undeletable), and they go via their auth
 * user so the cascade takes the profile with them.
 */
async function sweepPreviousRun(stack: {
  url: string;
  secretKey: string;
}): Promise<void> {
  const service = createClient<Database>(stack.url, stack.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: stale } = await service
    .from('branches')
    .select('id')
    .eq('city', 'Testville');
  if (!stale?.length) return;

  const ids = stale.map((branch) => branch.id);
  const { data: orphans } = await service
    .from('profiles')
    .select('id')
    .in('branch_id', ids);

  for (const orphan of orphans ?? []) {
    await service.auth.admin.deleteUser(orphan.id);
  }
  const { error } = await service.from('branches').delete().in('id', ids);
  if (error) {
    // Not fatal: the suite can still run, and failing here would hide whatever the
    // tests were about to say. Loud enough to act on.
    console.warn(`test-branch sweep left rows behind: ${error.message}`);
  }
}

/**
 * Resolves the local Supabase stack ONCE for the whole server project, before any
 * worker starts, and puts it in the environment the app code reads.
 *
 * globalSetup rather than setupFiles on purpose: setupFiles run per test file, in
 * separate workers, so every file would shell out to the Supabase CLI at the same
 * moment and they contend (seen 2026-07-29: three files resolved, the fourth got
 * ENOENT). One call, before the workers exist, and they inherit the result.
 *
 * The app reads its config from the environment exactly as it does under `next dev`
 * (.env.local) and on Vercel, so nothing here is special-casing tests. If CI has already
 * exported the variables, localStack() uses those and never touches the CLI.
 */
export default async function setup(): Promise<void> {
  const stack = localStack();

  process.env.NEXT_PUBLIC_SUPABASE_URL ??= stack.url;
  process.env.NEXT_PUBLIC_SUPABASE_KEY ??= stack.publishableKey;
  process.env.SUPABASE_SECRET_KEY ??= stack.secretKey;

  await sweepPreviousRun(stack);
}
