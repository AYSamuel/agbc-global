import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Pill } from '@/components/ui/Pill';
import { Stat } from '@/components/ui/Stat';
import { copy } from '@/copy/en';
import type {
  Shelf as ShelfData,
  ShelfFilter,
  ShelfRow,
} from '@/server/sermonAudio';

import { preachedOn, wholeMinutes } from './format';
import { OUTCOMES } from './outcomes';

/**
 * The shelf itself (frame: `SERMON-AUDIO · the shelf`, approved 2026-08-14, redrawn and
 * approved again 2026-09-06 for W4.9 slice 1): the guide leads with the format rule, the
 * stats say how the shelf stands, and the list is for scanning: ONE affordance per row,
 * the VERSES lesson, with the destructive pair living on the screen "Manage" opens.
 *
 * The red "X has no audio yet" banner that used to lead is gone. It said the one thing the
 * uploader already knew (the message is on YouTube) while the thing they did not know,
 * that the shelf takes MP3 only and refuses anything over 50 MB, sat halfway down the
 * page in a soft note. The missing message is still first in the list, wearing "No audio"
 * and "Add audio", and the counters say how many are missing.
 *
 * Pure rendering over what the page loaded, so it can be tested without a database.
 */
export function Shelf({
  shelf,
  filter,
  outcome,
}: {
  shelf: ShelfData;
  filter: ShelfFilter;
  outcome?: string;
}) {
  const text = copy.sermonAudio;
  const spoken = outcome ? OUTCOMES[outcome] : undefined;
  // `with` and `without` partition the shelf (a row either has an audio_path or it
  // does not), so their sum is the total without a fourth count query.
  const matches = shelf.scoped.withAudio + shelf.scoped.withoutAudio;
  const total = shelf.withAudio + shelf.withoutAudio;
  /** A search that found nothing: the one state that drops the segment and the label. */
  const blank = shelf.search !== null && shelf.rows.length === 0;

  return (
    <>
      {spoken ? (
        <div className="mt-4">
          <Alert tone={spoken.bad ? 'error' : 'info'}>{spoken.text}</Alert>
        </div>
      ) : null}

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

      <div className="mt-4">
        <Link
          href="/sermon-audio/new"
          className="inline-flex min-h-12 items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
        >
          {text.addAudioOnly}
        </Link>
      </div>

      <Search term={shelf.search} />

      {/* No segment over an empty search: four filters reading 0 are four dead
          controls, the same rule that hides a primary action over data that is
          not there (frame `SERMON-AUDIO-SEARCH · nothing matched`). */}
      {blank ? null : (
        <nav
          aria-label={text.filtersLabel}
          className="mt-4 inline-flex flex-wrap gap-1 rounded-control bg-alt p-1"
        >
          {FILTERS.map((entry) => (
            <Link
              key={entry.value}
              href={withQuery(entry.value, shelf.search)}
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
      )}

      {blank ? null : (
        <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
          {shelf.search === null
            ? text.listLabel
            : text.search.resultsLabel(matches, shelf.search)}
        </h2>
      )}

      {shelf.rows.length === 0 ? (
        shelf.search === null ? (
          <Empty filtered={filter !== 'all'} />
        ) : (
          <NoMatch term={shelf.search} total={total} />
        )
      ) : (
        <>
          {shelf.rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
          {/* Stated where the cap is reached rather than as a warning up front: 30 is
              almost always enough, and saying so in advance makes the reader carry a
              rule they will rarely need. */}
          {shelf.rows.length >= SHELF_WINDOW && matches > shelf.rows.length ? (
            <p className="pt-4 text-body text-muted">
              {text.search.cappedNote(shelf.rows.length, matches)}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

/**
 * A plain GET form, so the term lands in the URL and the browser does the work. No
 * client JavaScript, which keeps this screen the shape the rest of the dashboard is:
 * the filter segment is links, and this is a form.
 */
function Search({ term }: { term: string | null }) {
  const text = copy.sermonAudio.search;

  return (
    <form method="get" action="/sermon-audio" className="mt-1">
      <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
        <label htmlFor="shelf-search">{text.label}</label>
      </h2>
      <input
        id="shelf-search"
        name="q"
        type="search"
        defaultValue={term ?? ''}
        placeholder={text.placeholder}
        aria-describedby="shelf-search-hint"
        className="min-h-12 w-full max-w-[35rem] rounded-card border border-controlline bg-card px-3.5 text-body text-text"
      />
      <p
        id="shelf-search-hint"
        className="mt-2 max-w-[52ch] text-body text-muted"
      >
        {text.hint}
      </p>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          className="inline-flex min-h-12 items-center rounded-button bg-btn px-5 text-body font-extrabold text-btn-text hover:opacity-90"
        >
          {text.submit}
        </button>
        {term === null ? null : (
          <Link
            href="/sermon-audio"
            className="inline-flex min-h-12 items-center px-3 text-body font-semibold text-muted hover:text-text"
          >
            {text.clear}
          </Link>
        )}
      </div>
    </form>
  );
}

/**
 * Nothing matched. The shelf counts above still stand, which is what says this is an
 * empty SEARCH and not an empty shelf, and the body names the fields it looked in.
 */
function NoMatch({ term, total }: { term: string; total: number }) {
  const text = copy.sermonAudio.search;

  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      {/* An SVG rather than a character (the frame's own magnifier): `⌕` was tried here
          first and renders as a speck, because the glyph has almost no font coverage and
          falls back to something tiny. The `♪` the other empty state uses is common
          enough to be safe; this one is not. Caught by looking at the real screen. */}
      <span
        aria-hidden="true"
        className="grid h-16 w-16 place-items-center rounded-full bg-alt text-muted"
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <h3 className="mt-4 font-display text-card font-extrabold text-text">
        {text.emptyTitle(term)}
      </h3>
      <p className="mt-1.5 max-w-[44ch] text-body leading-relaxed text-sub">
        {text.emptyBody(total)}
      </p>
      <Link
        href="/sermon-audio"
        className="mt-4 inline-flex min-h-12 items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
      >
        {text.emptyAction}
      </Link>
    </div>
  );
}

/** The list window `loadShelf` applies; the note under the rows names it. */
const SHELF_WINDOW = 30;

/** A filter link keeps the search it was clicked under, or a tap loses the term. */
function withQuery(value: ShelfFilter, search: string | null): string {
  const params = new URLSearchParams();
  if (value !== 'all') params.set('filter', value);
  if (search !== null) params.set('q', search);
  const query = params.toString();
  return query === '' ? '/sermon-audio' : `/sermon-audio?${query}`;
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

/**
 * EVERY count here reads `shelf.scoped`, never the shelf-wide fields beside it. The
 * segment filters the list under it, so it must count what that list is drawn from;
 * `scoped` simply IS the shelf-wide trio when nothing is searched. Reading the wrong
 * one puts "Without audio 3" over a search holding 38 of them, which is how this was
 * first written and what the shelf-counts test caught.
 */
const FILTERS: {
  value: ShelfFilter;
  label: string;
  count: (shelf: ShelfData) => string;
}[] = [
  {
    value: 'all',
    label: copy.sermonAudio.filters.all,
    // Nothing to count when the view is everything; a search gives it a total.
    count: (shelf) =>
      shelf.search === null
        ? ''
        : String(shelf.scoped.withAudio + shelf.scoped.withoutAudio),
  },
  {
    value: 'without',
    label: copy.sermonAudio.filters.without,
    count: (shelf) => String(shelf.scoped.withoutAudio),
  },
  {
    value: 'with',
    label: copy.sermonAudio.filters.with,
    count: (shelf) => String(shelf.scoped.withAudio),
  },
  {
    value: 'audio_only',
    label: copy.sermonAudio.filters.audioOnly,
    count: (shelf) => String(shelf.scoped.audioOnly),
  },
];
