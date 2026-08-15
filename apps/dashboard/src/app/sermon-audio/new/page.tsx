import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';

import {
  createAudioOnlyAction,
  mintArtworkUploadAction,
  mintUploadAction,
} from '../actions';
import { shelfAccess } from '../guard';
import { NewMessagePanel } from '../NewMessagePanel';
import { ShelfRefusal } from '../Refusal';

export const dynamic = 'force-dynamic';

/** An audio-only message (frame: `SERMON-AUDIO-NEW`): it never went to YouTube. */
export default async function NewAudioOnlyPage() {
  const supabase = await createServerComponentClient();
  const { caller, admin } = await shelfAccess(supabase);

  return (
    <DashboardShell caller={caller} current="sermonAudio">
      {admin ? (
        <NewMessagePanel
          create={createAudioOnlyAction}
          mint={mintUploadAction}
          mintArtwork={mintArtworkUploadAction}
        />
      ) : (
        <>
          <PageHeader
            title={copy.sermonAudio.title}
            scope={copy.sermonAudio.scope}
          />
          <ShelfRefusal />
        </>
      )}
    </DashboardShell>
  );
}
