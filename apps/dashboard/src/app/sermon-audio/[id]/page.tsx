import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import {
  loadAudioFacts,
  loadSermon,
  type ShelfRow,
} from '@/server/sermonAudio';

import {
  attachAudioAction,
  mintUploadAction,
  removeAudioAction,
} from '../actions';
import { AttachPanel } from '../AttachPanel';
import { preachedOn, shortDate, wholeMb, wholeMinutes } from '../format';
import { shelfAccess } from '../guard';
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

  const replacing = readParam((await searchParams).replace) !== undefined;
  const manage = sermon.audioPath !== null && !replacing;

  return (
    <DashboardShell caller={caller} current="sermonAudio">
      {manage && sermon.audioPath ? (
        <Manage
          sermon={sermon}
          facts={await loadAudioFacts(supabase, sermon.audioPath)}
        />
      ) : (
        <AttachPanel
          sermonId={sermon.id}
          scopeLine={`${sermon.title} · ${preachedOn(sermon.publishedAt)}`}
          speaker={sermon.speaker}
          series={sermon.series}
          attach={attachAudioAction}
          mint={mintUploadAction}
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
}: {
  sermon: ShelfRow;
  facts: { sizeBytes: number | null; shelvedAt: string | null };
}) {
  const text = copy.sermonAudio.manage;
  const audioOnly = sermon.youtubeId === null;
  const extension = sermon.audioPath?.split('.').pop()?.toUpperCase();

  return (
    <>
      <PageHeader
        title={text.title}
        scope={`${sermon.title} · ${preachedOn(sermon.publishedAt)}`}
      />

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
    </>
  );
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
