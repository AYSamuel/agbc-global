import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';

import { apply, check } from '../actions';
import { verseAccess } from '../guard';
import { VersesRefusal } from '../Refusal';

import { ImportPanel } from './ImportPanel';

export const dynamic = 'force-dynamic';

/**
 * A quarter of verses, pasted (frames: `VERSES-IMPORT`, both steps).
 *
 * The page holds no state and renders no header: both belong to the panel, because the
 * title and the scope line change when the reader moves from pasting to checking ("Import
 * a batch" becomes "Check this batch · 360 rows pasted · nothing saved yet"), and a header
 * rendered above it would go on describing the step before.
 */
export default async function ImportVersesPage() {
  const supabase = await createServerComponentClient();
  const { caller, admin } = await verseAccess(supabase);

  return (
    <DashboardShell caller={caller} current="verses">
      {admin ? (
        <ImportPanel check={check} apply={apply} />
      ) : (
        <>
          <PageHeader
            title={copy.verses.import.title}
            scope={copy.verses.import.scope}
          />
          <VersesRefusal />
        </>
      )}
    </DashboardShell>
  );
}
