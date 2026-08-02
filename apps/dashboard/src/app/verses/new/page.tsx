import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';

import { remove, save } from '../actions';
import { verseAccess } from '../guard';
import { VersesRefusal } from '../Refusal';
import { VerseForm } from '../VerseForm';

export const dynamic = 'force-dynamic';

/**
 * One verse, from nothing (frame: `VERSE-EDIT`, reached from "Add one verse").
 *
 * The same form as the edit route, with no verse behind it: there is nothing to remove and
 * nothing to move, so the form renders without a Remove button and saves onto whatever
 * (date, language) is chosen. Saving onto an occupied pair replaces it, which the hint on
 * the form says out loud rather than letting a save surprise somebody.
 */
export default async function NewVersePage() {
  const supabase = await createServerComponentClient();
  const { caller, admin } = await verseAccess(supabase);

  return (
    <DashboardShell caller={caller} current="verses">
      <PageHeader
        title={copy.verses.verse.addTitle}
        scope={copy.verses.verse.addScope}
      />
      {admin ? (
        <VerseForm verse={null} save={save} remove={remove} />
      ) : (
        <VersesRefusal />
      )}
    </DashboardShell>
  );
}
