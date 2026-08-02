import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { loadSchedule } from '@/server/verses';

import { verseAccess } from './guard';
import { Schedule } from './Schedule';

export const dynamic = 'force-dynamic';

/**
 * The verse schedule (docs/spec/17 §48, `22` §1, frames in PR #119).
 *
 * ADMIN ONLY, asked for by name rather than checked here: `authorize()` answers
 * `manage_verses`, so the rule lives with every other authority decision this app makes.
 * A leader who follows the rail here is told so inside the shell, with their own queue one
 * click away (`guard.ts`, and the `VERSES-REFUSED` frame).
 *
 * The page reads and renders; every decision about what the schedule LOOKS like belongs to
 * `Schedule.tsx`, which is where it can be tested without a database.
 */
export default async function VersesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerComponentClient();
  const { caller, admin } = await verseAccess(supabase);
  const params = await searchParams;

  const language = readLanguage(params.language);
  // Not loaded at all for a caller who may not see it. The schedule is public content, so
  // this is not what protects it; it is what keeps a refusal from being a screen that
  // fetched everything and then decided not to show it.
  const schedule = admin ? await loadSchedule(supabase, language) : null;

  return (
    <DashboardShell caller={caller} current="verses">
      <PageHeader title={copy.verses.title} scope={copy.verses.scope} />
      <Schedule
        caller={caller}
        schedule={schedule}
        language={language}
        outcome={readParam(params.outcome)}
      />
    </DashboardShell>
  );
}

function readLanguage(
  value: string | string[] | undefined,
): string | undefined {
  const raw = readParam(value);
  return raw && raw in copy.verses.languageNames ? raw : undefined;
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
