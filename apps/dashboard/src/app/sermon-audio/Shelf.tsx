import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { Stat } from '@/components/ui/Stat';
import { copy } from '@/copy/en';
import type {
  Shelf as ShelfData,
  ShelfFilter,
  ShelfRow,
} from '@/server/sermonAudio';

import { preachedOn, wholeMinutes } from './format';

/**
 * The shelf itself (frame: `SERMON-AUDIO · the shelf`, approved 2026-08-14): the banner
 * carries the one urgent fact, the stats say how the shelf stands, the guide teaches the
 * format once, and the list is for scanning: ONE affordance per row, the VERSES lesson,
 * with the destructive pair living on the screen "Manage" opens.
 *
 * Pure rendering over what the page loaded, so it can be tested without a database.
 */
export function Shelf({
  shelf,
  filter,
  missing,
  outcome,
}: {
  shelf: ShelfData;
  filter: ShelfFilter;
  missing: ShelfRow | null;
  outcome?: string;
}) {
  const text = copy.sermonAudio;
  const spoken = outcome ? OUTCOMES[outcome] : undefined;

  return (
    <>
      {spoken ? (
        <div className="mt-4">
          <Alert tone={spoken.bad ? 'error' : 'info'}>{spoken.text}</Alert>
        </div>
      ) : null}

      {missing ? (
        <Notice
          tone="bad"
          title={text.missingTitle(missing.title)}
          action={
            <Link
              href={`/sermon-audio/${missing.id}`}
              className="inline-flex min-h-12 items-center rounded-button border border-cardline bg-card px-5 text-body font-semibold whitespace-nowrap text-text hover:bg-alt"
            >
              {text.missingAction}
            </Link>
          }
        >
          {text.missingBody}
        </Notice>
      ) : null}

      <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
        {text.statsLabel}
      </h2>
      <dl className="flex flex-wrap gap-2.5">
        <Stat label={text.stats.withAudio} value={shelf.withAudio} />
        <Stat
          label={text.stats.withoutAudio}
          value={shelf.withoutAudio}
          tone={shelf.withoutAudio > 0 ? 'low' : 'normal'}
        />
        <Stat label={text.stats.audioOnly} value={shelf.audioOnly} />
      </dl>

      <div className="mt-4 flex items-start gap-3 rounded-card border border-[rgba(185,134,0,0.34)] bg-[rgba(255,207,74,0.14)] px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-px text-gold-deep dark:text-accent"
        >
          ♪
        </span>
        <p className="text-body leading-relaxed text-text">
          <b className="font-extrabold">{text.guideTitle}</b> {text.guide}
        </p>
      </div>

      <div className="mt-4">
        <Link
          href="/sermon-audio/new"
          className="inline-flex min-h-12 items-center rounded-button border border-cardline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
        >
          {text.addAudioOnly}
        </Link>
      </div>

      <nav
        aria-label={text.filtersLabel}
        className="mt-4 inline-flex flex-wrap gap-1 rounded-control bg-alt p-1"
      >
        {FILTERS.map((entry) => (
          <Link
            key={entry.value}
            href={
              entry.value === 'all'
                ? '/sermon-audio'
                : `/sermon-audio?filter=${entry.value}`
            }
            aria-current={filter === entry.value ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-control px-4 text-body font-bold ${
              filter === entry.value
                ? 'bg-raised text-text shadow-sm'
                : 'text-muted hover:text-text'
            }`}
          >
            {entry.label}
            {' '}
            {entry.count(shelf)}
          </Link>
        ))}
      </nav>

      <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
        {text.listLabel}
      </h2>

      {shelf.rows.length === 0 ? (
        <Empty filtered={filter !== 'all'} />
      ) : (
        shelf.rows.map((row) => <Row key={row.id} row={row} />)
      )}
    </>
  );
}

function Row({ row }: { row: ShelfRow }) {
  const text = copy.sermonAudio;
  const hasAudio = row.audioPath !== null;
  const audioOnly = row.youtubeId === null;

  return (
    <article className="mb-3 rounded-card border border-cardline bg-card px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {hasAudio ? (
          <Pill tone="good">
            {text.audioPill(wholeMinutes(row.durationSec ?? 60))}
          </Pill>
        ) : (
          <Pill tone="urgent">{text.noAudioPill}</Pill>
        )}
        <Pill tone="quiet">
          {audioOnly
            ? text.kind.audioOnly
            : row.kind === 'live_replay'
              ? text.kind.live_replay
              : text.kind.video}
        </Pill>
        <span className="flex-1" />
        <span className="text-[0.72rem] font-bold text-muted">
          {preachedOn(row.publishedAt)}
        </span>
        <Link
          href={`/sermon-audio/${row.id}`}
          aria-label={
            hasAudio ? text.rowManageFor(row.title) : text.rowAddFor(row.title)
          }
          className="inline-flex min-h-11 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
        >
          {hasAudio ? text.rowManage : text.rowAdd}
        </Link>
      </div>
      <p className="mt-2.5 text-body leading-relaxed font-bold text-text">
        {row.title}
      </p>
      {/* Joined from the parts that exist: the sync leaves speaker empty on rows it
          minted, and a meta line must not open with a stray separator (seen live,
          2026-08-14). */}
      <p className="mt-1.5 text-[0.78rem] font-bold text-muted">
        {[
          row.speaker,
          !hasAudio && !audioOnly && row.durationSec
            ? text.minutesOnYouTube(wholeMinutes(row.durationSec))
            : '',
          audioOnly ? text.neverOnYouTube : '',
        ]
          .filter((part) => part !== '')
          .join(' · ')}
      </p>
    </article>
  );
}

/**
 * Empty means the sync has not run yet (frame: `SERMON-AUDIO · empty`), and the
 * audio-only door stays open: our own recordings never wait on YouTube. A filtered view
 * with nothing in it is not that state and just says so plainly.
 */
function Empty({ filtered }: { filtered: boolean }) {
  const text = copy.sermonAudio;
  if (filtered) {
    return <p className="text-body text-sub">{text.filterEmpty}</p>;
  }

  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <span
        aria-hidden="true"
        className="grid h-16 w-16 place-items-center rounded-full bg-alt text-muted"
      >
        ♪
      </span>
      <h3 className="mt-4 font-display text-card font-extrabold text-text">
        {text.emptyTitle}
      </h3>
      <p className="mt-1.5 max-w-[44ch] text-body leading-relaxed text-sub">
        {text.emptyBody}
      </p>
      <Link
        href="/sermon-audio/new"
        className="mt-4 inline-flex min-h-12 items-center rounded-button bg-btn px-5 text-body font-extrabold text-btn-text hover:opacity-90"
      >
        {text.addAudioOnly}
      </Link>
    </div>
  );
}

const FILTERS: {
  value: ShelfFilter;
  label: string;
  count: (shelf: ShelfData) => string;
}[] = [
  { value: 'all', label: copy.sermonAudio.filters.all, count: () => '' },
  {
    value: 'without',
    label: copy.sermonAudio.filters.without,
    count: (shelf) => String(shelf.withoutAudio),
  },
  {
    value: 'with',
    label: copy.sermonAudio.filters.with,
    count: (shelf) => String(shelf.withAudio),
  },
  {
    value: 'audio_only',
    label: copy.sermonAudio.filters.audioOnly,
    count: (shelf) => String(shelf.audioOnly),
  },
];

const OUTCOMES: Record<string, { text: string; bad: boolean } | undefined> = {
  saved: { text: copy.sermonAudio.outcome.saved, bad: false },
  replaced: { text: copy.sermonAudio.outcome.replaced, bad: false },
  created: { text: copy.sermonAudio.outcome.created, bad: false },
  removed: { text: copy.sermonAudio.outcome.removed, bad: false },
  no_audio: { text: copy.sermonAudio.outcome.noAudio, bad: false },
  gone: { text: copy.sermonAudio.outcome.gone, bad: false },
  audio_only: { text: copy.sermonAudio.outcome.audioOnly, bad: false },
  refused: { text: copy.sermonAudio.outcome.refused, bad: true },
  failed: { text: copy.sermonAudio.outcome.failed, bad: true },
};
