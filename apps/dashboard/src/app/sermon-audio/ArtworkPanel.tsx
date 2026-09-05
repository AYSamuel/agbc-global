'use client';

import { ImageField } from '@/components/ImageField';
import type { ImageSubject } from '@/components/ImagePreview';
import { copy } from '@/copy/en';

import type { MintAction } from './state';

/**
 * The manage screen's picture block (frame: `SERMON-AUDIO-MANAGE`, the artwork section).
 *
 * This exists for one reason: the page that renders it is a Server Component, and
 * `ImageField` is a Client Component whose `words` prop is a copy bundle holding three
 * FUNCTIONS (`readyTitle`, `removeHint`, `pickTooBig`). Props that cross the server to
 * client boundary must serialise, and a function does not, so handing `copy.sermonAudio
 * .artwork` across from the page threw on every render of a message that HAD audio:
 * "Functions cannot be passed directly to Client Components" (Sentry AGBC-DASHBOARD-2,
 * 2026-09-05, the first time production held a message with audio). The attach and create
 * forms never hit it because they are client components themselves and read the copy on
 * their own side of the line, which is what this wrapper does too. Nothing about the
 * field, the form or the action changes; only which side of the boundary picks the words.
 *
 * Server actions are the exception the boundary allows: they are references, not
 * functions, so `mint` and `action` still arrive from the page.
 */
export function ArtworkPanel({
  sermonId,
  subject,
  mint,
  action,
}: {
  sermonId: string;
  subject: ImageSubject;
  mint: MintAction;
  action: (formData: FormData) => Promise<void>;
}) {
  const picture = copy.sermonAudio.artwork;

  // Replace and set are one control, the way Replace IS attach for the audio: a new
  // object goes up, the row moves its reference, the old one retires.
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="sermonId" value={sermonId} />
      <ImageField
        subject={subject}
        words={picture}
        fieldName="artworkPath"
        mint={mint}
        // The block above already shows what is on the cards, with its size and date.
        showSubject={subject.kind !== 'own'}
        submitLabel={subject.kind === 'own' ? picture.replace : picture.save}
        submittingLabel={picture.saving}
      />
    </form>
  );
}
