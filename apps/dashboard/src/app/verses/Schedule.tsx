import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { copy } from '@/copy/en';
import type { Caller } from '@/server/authorize';
import {
  DEPTH_FLOOR,
  LANGUAGES,
  type Language,
  type LanguageDepth,
  type ScheduledVerse,
  type VerseSchedule,
} from '@/server/verses';

import { humanDate, nameOf } from './format';
import { VersesRefusal } from './Refusal';

/**
 * The schedule itself (frame: `VERSES · the schedule`, docs/spec/17 §48, `22` §1).
 *
 * DEPTH IS FOUR NUMBERS, NEVER ONE. The app reads the newest verse on or before today in
 * the member's own language, so a gap repeats an older verse rather than blanking, and the
 * failure is per language and silent. A single total would read as healthy while German sat
 * empty. `daily_verse_depth()` answers per language and this screen shows all four.
 *
 * A component rather than the page body, and it re-asks the role question the page already
 * asked, because this is the surface that would leak: handed a schedule it should not show,
 * it shows the refusal instead. The page decides; this cannot be made to disagree.
 */
export function Schedule({
  caller,
  schedule,
  language,
  outcome,
}: {
  caller: Caller;
  /** Null for a caller who may not keep the schedule: the page never loads it for them. */
  schedule: VerseSchedule | null;
  /** The language filter from the URL, already validated. */
  language?: string;
  /** The raw `?outcome=` code from the last action. */
  outcome?: string;
}) {
  if (caller.role !== 'admin' || !schedule) return <VersesRefusal />;

  const reported = readOutcome(outcome);

  // The worst language decides whether the banner appears, because the whole point is that
  // one healthy language hides an empty one.
  const worst = schedule.depth.reduce<LanguageDepth | null>(
    (lowest, row) =>
      !lowest || row.daysQueued < lowest.daysQueued ? row : lowest,
    null,
  );

  // Shown in a FIXED language order, English first, as the frame draws them. The function
  // answers worst-first, which is the right order for an alert and the wrong one for four
  // cards somebody checks every week: they would swap places whenever a queue moved, and
  // "the German number" would stop having a place on the screen.
  const depth = [...schedule.depth].sort(
    (a, b) => order(a.language) - order(b.language),
  );

  return (
    <>
      {reported ? (
        <div className="mt-4">
          <Alert tone={reported.tone}>{reported.message}</Alert>
        </div>
      ) : null}

      {worst && worst.daysQueued <= DEPTH_FLOOR ? (
        <Notice
          tone="bad"
          title={
            worst.staleFrom
              ? copy.verses.runningOutTitle(
                  nameOf(worst.language),
                  humanDate(worst.runsOutOn),
                )
              : copy.verses.emptyLanguage(nameOf(worst.language))
          }
          action={
            <Link
              href="/verses/import"
              className="inline-flex min-h-12 items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
            >
              {copy.verses.runningOutAction(nameOf(worst.language))}
            </Link>
          }
        >
          {worst.staleFrom
            ? copy.verses.runningOutBody(
                nameOf(worst.language),
                humanDate(worst.staleFrom),
              )
            : copy.verses.emptyLanguageBody(nameOf(worst.language))}
        </Notice>
      ) : null}

      <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
        {copy.verses.depthLabel}
      </h2>
      <dl className="flex flex-wrap gap-2.5">
        {depth.map((row) => (
          <Depth key={row.language} row={row} />
        ))}
      </dl>

      <div className="mt-4 flex items-start gap-3 rounded-card border border-[rgba(185,134,0,0.34)] bg-[rgba(255,207,74,0.14)] px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-px text-gold-deep dark:text-accent"
        >
          ⚠
        </span>
        <p className="text-body leading-relaxed text-text">
          <b className="font-extrabold">{copy.verses.guideTitle}</b>{' '}
          {copy.verses.guide}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <Link
          href="/verses/import"
          className="inline-flex min-h-12 items-center rounded-button bg-btn px-5 text-body font-extrabold text-btn-text"
        >
          {copy.verses.importAction}
        </Link>
        <Link
          href="/verses/new"
          className="inline-flex min-h-12 items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
        >
          {copy.verses.addAction}
        </Link>
      </div>

      <nav
        aria-label={copy.verses.depthLabel}
        className="mt-4 inline-flex flex-wrap gap-1 rounded-card bg-alt p-1"
      >
        <Filter
          current={language}
          value={undefined}
          label={copy.verses.filterAll}
        />
        {depth.map((row) => (
          <Filter
            key={row.language}
            current={language}
            value={row.language}
            label={`${nameOf(row.language)} ${String(row.daysQueued)}`}
          />
        ))}
      </nav>

      <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
        {copy.verses.scheduledLabel}
      </h2>

      {schedule.upcoming.length === 0 ? (
        <div className="flex flex-col items-center px-8 py-10 text-center">
          <h3 className="font-display text-[1.2rem] font-extrabold">
            {copy.verses.emptyTitle}
          </h3>
          <p className="mt-1.5 max-w-[44ch] text-body leading-relaxed text-sub">
            {copy.verses.emptyBody}
          </p>
          <Link
            href="/verses/import"
            className="mt-4 inline-flex min-h-12 items-center rounded-button bg-btn px-5 text-body font-extrabold text-btn-text"
          >
            {copy.verses.importAction}
          </Link>
        </div>
      ) : (
        schedule.upcoming.map((verse) => (
          <VerseRow
            key={`${verse.date}-${verse.language}`}
            verse={verse}
            isToday={verse.date === schedule.today}
          />
        ))
      )}
    </>
  );
}

function Depth({ row }: { row: LanguageDepth }) {
  const low = row.daysQueued <= DEPTH_FLOOR;
  return (
    <div
      className={`min-w-36 flex-1 rounded-card border bg-card px-4 py-3 ${
        low ? 'border-[rgba(224,52,44,0.42)]' : 'border-cardline'
      }`}
    >
      <dd
        className={`font-display text-[1.35rem] font-extrabold ${
          low ? 'text-danger' : ''
        }`}
      >
        {row.daysQueued}
      </dd>
      <dt className="mt-0.5 text-label font-bold tracking-wide text-muted uppercase">
        {nameOf(row.language)}
        {/* The frame flags a language under the floor in red and in nothing else. Colour
            alone is not a message, so the same fact is said in words for anyone who
            cannot see it (`05` accessibility contract). */}
        {low ? <span className="sr-only"> {copy.verses.depthLow}</span> : null}
      </dt>
    </div>
  );
}

/**
 * A row carries no action bar, unlike a moderation queue item.
 *
 * That screen holds three items and deciding on them is the work. This list is 90 days
 * across four languages and the work is scanning it, so a destructive Remove repeated
 * several hundred rows down is a hazard rather than a convenience. Edit is the one
 * affordance, and Remove lives on the screen it opens, where the verse is on screen to see.
 */
function VerseRow({
  verse,
  isToday,
}: {
  verse: ScheduledVerse;
  isToday: boolean;
}) {
  return (
    <article className="mb-3 rounded-card border border-cardline bg-card px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* The shared Pill, not a hand-rolled span: #114 promoted this exact component out
            of three private copies, and its tones already say what these mean. `info` for
            Today, a neutral classification; `quiet` for the language, which is metadata. */}
        {isToday ? <Pill tone="info">{copy.verses.today}</Pill> : null}
        <Pill tone="quiet">{verse.language}</Pill>
        <span className="flex-1" />
        <span className="text-[0.72rem] font-bold text-muted">
          {humanDate(verse.date)}
        </span>
        <Link
          href={`/verses/${verse.date}/${verse.language}`}
          aria-label={copy.verses.editOn(
            humanDate(verse.date),
            nameOf(verse.language),
          )}
          className="rounded-button px-2.5 py-1 text-[0.78rem] font-bold text-muted hover:bg-alt"
        >
          {copy.verses.edit}
        </Link>
      </div>
      <p className="mt-2.5 text-body leading-relaxed text-text">{verse.text}</p>
      <p className="mt-3 text-[0.75rem] font-bold text-muted">
        {verse.reference} · {verse.translation}
      </p>
    </article>
  );
}

function Filter({
  current,
  value,
  label,
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const on = current === value;
  return (
    <Link
      href={value ? `/verses?language=${value}` : '/verses'}
      aria-current={on ? 'page' : undefined}
      className={`rounded-button px-4 py-2 text-body font-bold ${
        on ? 'bg-raised text-text shadow-sm' : 'text-muted'
      }`}
    >
      {label}
    </Link>
  );
}

/** Where a language sits in the frame's row of cards. Anything unknown sorts last. */
function order(language: string): number {
  const at = LANGUAGES.indexOf(language as Language);
  return at === -1 ? LANGUAGES.length : at;
}

const OUTCOMES: Record<string, { message: string; tone: 'error' | 'info' }> = {
  saved: { message: copy.verses.verse.outcome.saved, tone: 'info' },
  removed: { message: copy.verses.verse.outcome.removed, tone: 'info' },
  moved_partly: {
    message: copy.verses.verse.outcome.movedPartly,
    tone: 'error',
  },
  gone: { message: copy.verses.verse.outcome.gone, tone: 'error' },
  invalid: { message: copy.verses.verse.outcome.invalid, tone: 'error' },
  failed: { message: copy.verses.verse.outcome.failed, tone: 'error' },
  nothing: { message: copy.verses.import.outcome.nothing, tone: 'error' },
  import_failed: {
    message: copy.verses.import.outcome.failed,
    tone: 'error',
  },
};

function readOutcome(
  raw: string | undefined,
): { message: string; tone: 'error' | 'info' } | undefined {
  if (!raw) return undefined;
  const imported = /^imported:(\d+)$/.exec(raw);
  if (imported) {
    return {
      message: copy.verses.import.outcome.imported(Number(imported[1])),
      tone: 'info',
    };
  }
  return OUTCOMES[raw];
}
