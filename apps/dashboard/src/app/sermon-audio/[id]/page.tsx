import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Pill } from '@/components/ui/Pill';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import {
  loadAudioFacts,
  loadSermon,
  type ShelfRow,
} from '@/server/sermonAudio';
import {
  artworkUrl,
  loadArtworkFacts,
  type ArtworkFacts,
} from '@/server/sermonArtwork';

import {
  attachAudioAction,
  mintArtworkUploadAction,
  mintUploadAction,
  removeArtworkAction,
  removeAudioAction,
  setArtworkAction,
} from '../actions';
import { ImagePreview, type ImageSubject } from '@/components/ImagePreview';
import { ImageField } from '@/components/ImageField';
import { AttachPanel } from '../AttachPanel';
import {
  preachedOn,
  shortDate,
  wholeKb,
  wholeMb,
  wholeMinutes,
} from '../format';
import { shelfAccess } from '../guard';
import { OUTCOMES } from '../outcomes';
import { ShelfRefusal } from '../Refusal';

export const dynamic = 'force-dynamic';

/**
 * One message's audio, both faces of it: `SERMON-AUDIO-ATTACH` when there is nothing on
 * the shelf for it (or the reader chose Replace), `SERMON-AUDIO-MANAGE` when there is.
 *
 * Replace IS attach: a new file goes up, the row moves its reference, the old file
 * retires. One flow, so there is no second uploader to drift from the first.
 */
export default async function SermonAudioItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerComponentClient();
  const { caller, admin } = await shelfAccess(supabase);

  if (!admin) {
    return (
      <DashboardShell caller={caller} current="sermonAudio">
        <PageHeader
          title={copy.sermonAudio.title}
          scope={copy.sermonAudio.scope}
        />
        <ShelfRefusal />
      </DashboardShell>
    );
  }

  const { id } = await params;
  const sermon = await loadSermon(supabase, id);
  if (!sermon) redirect('/sermon-audio?outcome=gone');

  const query = await searchParams;
  const replacing = readParam(query.replace) !== undefined;
  const manage = sermon.audioPath !== null && !replacing;

  // What members see on this message's card RIGHT NOW: our own picture, else the thumbnail
  // the sync got from YouTube, else the branded cover. The same precedence the app applies,
  // decided in one place on each side.
  const artwork: ImageSubject = sermon.artworkPath
    ? { url: artworkUrl(supabase, sermon.artworkPath), kind: 'own' }
    : sermon.thumbnailUrl
      ? { url: sermon.thumbnailUrl, kind: 'youtube' }
      : { url: null, kind: 'none' };

  return (
    <DashboardShell caller={caller} current="sermonAudio">
      {manage && sermon.audioPath ? (
        <Manage
          sermon={sermon}
          facts={await loadAudioFacts(supabase, sermon.audioPath)}
          artwork={artwork}
          artworkFacts={
            sermon.artworkPath
              ? await loadArtworkFacts(supabase, sermon.artworkPath)
              : null
          }
          outcome={readParam(query.outcome)}
        />
      ) : (
        <AttachPanel
          sermonId={sermon.id}
          scopeLine={`${sermon.title} · ${preachedOn(sermon.publishedAt)}`}
          speaker={sermon.speaker}
          series={sermon.series}
          artwork={artwork}
          attach={attachAudioAction}
          mint={mintUploadAction}
          mintArtwork={mintArtworkUploadAction}
        />
      )}
    </DashboardShell>
  );
}

/**
 * The managed state (frame: `SERMON-AUDIO-MANAGE`): the file's facts on screen, then the
 * destructive pair, which lives here and only here. The copy promises the order the
 * database enforces: the reference clears first, the file goes second, and a file still
 * referenced refuses deletion.
 *
 * An audio-only message gets no Remove at all: with no YouTube half, removing the audio
 * would leave nothing. The missing button is a rule, and rules are better stated than
 * inferred, so the note says it (the reports `flagged` shape).
 */
function Manage({
  sermon,
  facts,
  artwork,
  artworkFacts,
  outcome,
}: {
  sermon: ShelfRow;
  facts: { sizeBytes: number | null; shelvedAt: string | null };
  artwork: ImageSubject;
  artworkFacts: ArtworkFacts | null;
  outcome?: string;
}) {
  const text = copy.sermonAudio.manage;
  const picture = copy.sermonAudio.artwork;
  const audioOnly = sermon.youtubeId === null;
  const extension = sermon.audioPath?.split('.').pop()?.toUpperCase();
  const spoken = outcome ? OUTCOMES[outcome] : undefined;

  return (
    <>
      <PageHeader
        title={text.title}
        scope={`${sermon.title} · ${preachedOn(sermon.publishedAt)}`}
      />

      {/* This screen redirects to itself now that the picture lives here, so it needs the
          shelf's outcome line: an action that changed something and said nothing is
          indistinguishable from one that did nothing. */}
      {spoken ? (
        <div className="mt-4">
          <Alert tone={spoken.bad ? 'error' : 'info'}>{spoken.text}</Alert>
        </div>
      ) : null}

      <article className="mt-4 max-w-[40rem] rounded-card border border-cardline bg-card px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="good">
            {text.factsPill(wholeMinutes(sermon.durationSec ?? 60))}
          </Pill>
          <span className="flex-1" />
          {facts.shelvedAt ? (
            <span className="text-[0.72rem] font-bold text-muted">
              {text.shelvedOn(shortDate(facts.shelvedAt))}
            </span>
          ) : null}
        </div>
        <p className="mt-2.5 text-[0.78rem] font-bold text-muted">
          {facts.sizeBytes
            ? `${copy.sermonAudio.sizeMb(wholeMb(facts.sizeBytes))} · `
            : ''}
          {extension}
        </p>
      </article>

      <p className="mt-3 max-w-[60ch] text-[0.78rem] leading-normal text-muted">
        {audioOnly ? text.audioOnlyNoRemove : text.removeHint}
      </p>

      <div className="mt-4 flex max-w-[40rem] flex-wrap items-center gap-2.5">
        <Link
          href={`/sermon-audio/${sermon.id}?replace=1`}
          className="inline-flex min-h-12 items-center rounded-button border border-cardline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
        >
          {text.replace}
        </Link>
        <span className="flex-1" />
        {audioOnly ? null : (
          <form action={removeAudioAction}>
            <input type="hidden" name="sermonId" value={sermon.id} />
            <button
              type="submit"
              className="inline-flex min-h-12 items-center rounded-button border border-danger px-5 text-body font-semibold text-danger"
            >
              {text.remove}
            </button>
          </form>
        )}
      </div>

      {/* The picture gets its own block rather than a third button in the row above,
          because it is a different object with a different consequence: removing the audio
          takes the message out of the app, removing the picture just puts the navy cover
          back. Its Remove is therefore ordinary, not danger, and it is never refused the
          way audio removal is on an audio-only message.

          This is also the ONLY place a picture can be changed after the fact, which is why
          it lives on the screen that already shows what is there. */}
      <h3 className="mt-8 mb-2 text-[0.69rem] font-extrabold tracking-[0.14em] text-muted uppercase">
        {picture.sectionLabel}
      </h3>
      {artwork.kind === 'own' && artworkFacts ? (
        <div className="flex max-w-[40rem] flex-wrap items-start gap-3.5">
          <ImagePreview
            url={artwork.url}
            caption={picture.onCards}
            alt={picture.previewOwn}
          />
          <div className="min-w-[14rem] flex-1">
            <p className="text-[0.78rem] leading-normal text-muted">
              {picture.removeHint(
                artworkFacts.sizeBytes
                  ? copy.sermonAudio.sizeKb(wholeKb(artworkFacts.sizeBytes))
                  : copy.sermonAudio.sizeMb(0),
                artworkFacts.hungAt
                  ? shortDate(artworkFacts.hungAt)
                  : preachedOn(sermon.publishedAt),
              )}
            </p>
            <form action={removeArtworkAction} className="mt-3">
              <input type="hidden" name="sermonId" value={sermon.id} />
              <button
                type="submit"
                className="inline-flex min-h-12 items-center rounded-button border border-cardline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
              >
                {picture.remove}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Replace and set are one control, the way Replace IS attach for the audio: a new
          object goes up, the row moves its reference, the old one retires. */}
      <form action={setArtworkAction} className="mt-4">
        <input type="hidden" name="sermonId" value={sermon.id} />
        <ImageField
          subject={artwork}
          words={copy.sermonAudio.artwork}
          fieldName="artworkPath"
          mint={mintArtworkUploadAction}
          // The block above already shows what is on the cards, with its size and date.
          showSubject={artwork.kind !== 'own'}
          submitLabel={artwork.kind === 'own' ? picture.replace : picture.save}
          submittingLabel={picture.saving}
        />
      </form>
    </>
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
