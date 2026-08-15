import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import {
  loadNewestMissing,
  loadShelf,
  type ShelfFilter,
} from '@/server/sermonAudio';

import { shelfAccess } from './guard';
import { ShelfRefusal } from './Refusal';
import { Shelf } from './Shelf';

export const dynamic = 'force-dynamic';

/**
 * The shelf (docs/spec/17 §4, frames approved 2026-08-14; slice plan
 * `docs/spec/02` §Storage).
 *
 * ADMIN ONLY, asked for by name (`manage_sermon_audio` in `authorize()`); a leader who
 * follows the rail here is told so inside the shell with their own queue one click away
 * (`guard.ts`). The page reads and renders; what the shelf LOOKS like belongs to
 * `Shelf.tsx`, where it can be tested without a database.
 */
export default async function SermonAudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerComponentClient();
  const { caller, admin } = await shelfAccess(supabase);
  const params = await searchParams;

  const filter = readFilter(params.filter);
  // Not loaded at all for a caller who may not act here: not what protects the data
  // (sermons are public content), just what keeps a refusal from being a screen that
  // fetched everything and then decided not to show it.
  const shelf = admin ? await loadShelf(supabase, filter) : null;
  const missing = admin ? await loadNewestMissing(supabase) : null;

  return (
    <DashboardShell caller={caller} current="sermonAudio">
      <PageHeader
        title={copy.sermonAudio.title}
        scope={copy.sermonAudio.scope}
      />
      {shelf ? (
        <Shelf
          shelf={shelf}
          filter={filter}
          missing={missing}
          outcome={readParam(params.outcome)}
        />
      ) : (
        <ShelfRefusal />
      )}
    </DashboardShell>
  );
}

const FILTERS: ShelfFilter[] = ['all', 'without', 'with', 'audio_only'];

function readFilter(value: string | string[] | undefined): ShelfFilter {
  const raw = readParam(value);
  return FILTERS.find((filter) => filter === raw) ?? 'all';
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
