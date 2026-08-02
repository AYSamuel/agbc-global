import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

/**
 * The daily-verse schedule (docs/spec/17 §48, `22` §1, frames approved in PR #119).
 *
 * Everything goes through the CALLER's own client. The admin policy on `daily_verses` is
 * the boundary and `import_daily_verses` checks its own authority on top of it, so nothing
 * here can widen either.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: validate a batch. The database owns that, and
 * the import screen's promise ("nothing is saved until you have seen what it will do") is
 * only true because the preview and the write are the same function called twice. A second
 * validator here would agree with it the day it was written and drift afterwards, and the
 * screen would be quietly lying about a 360-row import. This module parses the paste into
 * rows and hands them over. That is all.
 */

type Client = SupabaseClient<Database>;

/** Mirrors the CHECK on daily_verses.language. */
export const LANGUAGES = ['en', 'de', 'nl', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

export interface LanguageDepth {
  language: string;
  /** First day with no verse. Null when the horizon is fully covered. */
  runsOutOn: string | null;
  /** Days until that gap. 0 means today itself is missing. */
  daysQueued: number;
  /** The verse date members would be stuck on once it runs out. */
  staleFrom: string | null;
}

export interface ScheduledVerse {
  date: string;
  language: string;
  reference: string;
  text: string;
  translation: string;
}

export interface VerseSchedule {
  depth: LanguageDepth[];
  upcoming: ScheduledVerse[];
  /** Server-side "today", so the Today pill and the depth numbers agree with each other. */
  today: string;
}

/** The floor `21` §5 alerts on. A language at or below this is in trouble. */
export const DEPTH_FLOOR = 14;

export interface ImportRow {
  line: number;
  date: string;
  language: string;
  reference: string;
  text: string;
  translation: string;
}

export interface ImportProblem {
  line: number;
  date: string;
  language: string;
  /** Stable identifier from the database; `copy/en.ts` owns the English. */
  reason: string;
}

export interface ImportResult {
  dryRun: boolean;
  replaceExisting: boolean;
  new: number;
  existing: number;
  invalid: number;
  applied: number;
  problems: ImportProblem[];
}

export async function loadSchedule(
  supabase: Client,
  language?: string,
): Promise<VerseSchedule> {
  // Sequential rather than parallel, deliberately: `today` comes out of the depth result
  // (see deriveToday) and the upcoming list is filtered from it, so that one date governs
  // the Today pill, the depth numbers and which rows appear. One visible fact, one owner.
  const depth = await loadDepth(supabase);
  const today = deriveToday(depth);
  const upcoming = await loadUpcoming(supabase, today, language);
  return { depth, upcoming, today };
}

/**
 * Today according to the DATABASE, derived rather than asked for.
 *
 * `daily_verse_depth()` measures from the database's `current_date`, and it returns both
 * `runs_out_on` and `days_queued` for each language. Since `runs_out_on = current_date +
 * days_queued`, subtracting one from the other recovers the database's own today exactly,
 * with no extra round trip.
 *
 * Worth the trouble because the alternative is this Node process's date, which can be a day
 * off the database's in either direction. A Today pill on the wrong row, sitting next to
 * depth numbers computed from a different day, is precisely the two-sources-of-truth bug
 * that cost W2.4 four device-only failures.
 */
function deriveToday(depth: LanguageDepth[]): string {
  const anchor = depth.find((row) => row.runsOutOn !== null);
  if (!anchor?.runsOutOn) return new Date().toISOString().slice(0, 10);
  const day = new Date(`${anchor.runsOutOn}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - anchor.daysQueued);
  return day.toISOString().slice(0, 10);
}

async function loadDepth(supabase: Client): Promise<LanguageDepth[]> {
  const { data, error } = await supabase.rpc('daily_verse_depth');
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    language: row.language,
    runsOutOn: row.runs_out_on,
    daysQueued: row.days_queued,
    staleFrom: row.stale_from,
  }));
}

async function loadUpcoming(
  supabase: Client,
  today: string,
  language?: string,
): Promise<ScheduledVerse[]> {
  // From today forward only. What is already past cannot be fixed and is not the work; the
  // screen exists to keep the queue ahead of the members reading it.
  let query = supabase
    .from('daily_verses')
    .select('date, language, reference, text, translation')
    .gte('date', today)
    .order('date')
    .order('language')
    .limit(200);
  if (language) query = query.eq('language', language);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/**
 * A pasted spreadsheet selection, as rows.
 *
 * Tabs or commas, because the frame promises both: copying a selection out of a spreadsheet
 * gives tabs, and an exported file gives commas. The delimiter is decided by the HEADER
 * line rather than by the whole text, since a verse containing a comma would otherwise vote
 * for the wrong one.
 *
 * Quoted fields are handled for the comma case, where they matter: a verse is a sentence
 * and sentences contain commas. Without this, "The Lord is my shepherd, I shall not want"
 * silently becomes two columns and the row is rejected for a reason that would look absurd
 * to the person who pasted it.
 *
 * Line numbers are 1-based and count the header, so they match what the importer sees in
 * their own spreadsheet.
 */
export function parsePaste(raw: string): ImportRow[] {
  const lines = raw
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const header = splitLine(lines[0], delimiter).map((cell) =>
    cell.trim().toLowerCase(),
  );

  // A header row is how the columns are found, so an unrecognisable first line is treated
  // as data in the canonical order rather than silently dropped.
  const known = ['date', 'language', 'reference', 'text', 'translation'];
  const hasHeader = known.some((name) => header.includes(name));
  const order = hasHeader ? header : known;
  const body = hasHeader ? lines.slice(1) : lines;
  const offset = hasHeader ? 2 : 1;

  const indexOf = (name: string) => order.indexOf(name);

  return body.map((line, index) => {
    const cells = splitLine(line, delimiter);
    const at = (name: string) => {
      const position = indexOf(name);
      return position >= 0 ? (cells[position] ?? '').trim() : '';
    };
    return {
      line: index + offset,
      date: at('date'),
      language: at('language'),
      reference: at('reference'),
      text: at('text'),
      translation: at('translation'),
    };
  });
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t');

  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.replace(/^"|"$/g, ''));
}

export async function runImport(
  supabase: Client,
  rows: ImportRow[],
  options: { replaceExisting: boolean; dryRun: boolean },
): Promise<ImportResult> {
  const { data, error } = await supabase.rpc('import_daily_verses', {
    batch:
      rows as unknown as Database['public']['Functions']['import_daily_verses']['Args']['batch'],
    replace_existing: options.replaceExisting,
    dry_run: options.dryRun,
  });
  if (error) throw new Error(error.message);

  const result = data as unknown as {
    dry_run: boolean;
    replace_existing: boolean;
    new: number;
    existing: number;
    invalid: number;
    applied: number;
    problems: ImportProblem[];
  };

  return {
    dryRun: result.dry_run,
    replaceExisting: result.replace_existing,
    new: result.new,
    existing: result.existing,
    invalid: result.invalid,
    applied: result.applied,
    problems: result.problems,
  };
}

/**
 * No `not_admin` here, deliberately. A caller who may not manage the schedule is refused
 * by `import_daily_verses` (which raises) and by the delete policy (which matches no
 * rows), so this layer never has to decide it. `gone` is the delete that changed nothing.
 */
export type SaveOutcome =
  { ok: true } | { ok: false; reason: 'invalid' | 'gone' | 'failed' };

export async function saveVerse(
  supabase: Client,
  verse: ScheduledVerse,
): Promise<SaveOutcome> {
  // One verse still goes through the batch function, so a single edit and a 360-row paste
  // cannot validate differently. The form is a batch of one.
  //
  // The call is NOT wrapped in a catch. `backend.md`: no silent failures. A thrown error
  // here means the database refused or the connection did, which is not the same as "this
  // verse was invalid", and flattening the two would tell the editor to fix their text when
  // the text was fine. The action layer maps a throw to the error state.
  const result = await runImport(
    supabase,
    [
      {
        line: 1,
        date: verse.date,
        language: verse.language,
        reference: verse.reference,
        text: verse.text,
        translation: verse.translation,
      },
    ],
    { replaceExisting: true, dryRun: false },
  );

  if (result.invalid > 0) return { ok: false, reason: 'invalid' };
  return { ok: true };
}

/**
 * The delete asks for the rows back, and that is the whole point of the `.select()`.
 *
 * RLS turns a refused delete into a successful statement that touches nothing: no error,
 * no rows, and a caller that only checked `error` would report "removed" to somebody whose
 * verse is still scheduled. Reading what actually went is the only honest answer available
 * here, so an empty result is reported rather than absorbed (`backend.md`: no silent
 * failures, and fail closed).
 */
export async function removeVerse(
  supabase: Client,
  date: string,
  language: string,
): Promise<SaveOutcome> {
  const { data, error } = await supabase
    .from('daily_verses')
    .delete()
    .eq('date', date)
    .eq('language', language)
    .select('date');
  if (error) return { ok: false, reason: 'failed' };
  return data.length > 0 ? { ok: true } : { ok: false, reason: 'gone' };
}

export async function loadVerse(
  supabase: Client,
  date: string,
  language: string,
): Promise<ScheduledVerse | null> {
  const { data, error } = await supabase
    .from('daily_verses')
    .select('date, language, reference, text, translation')
    .eq('date', date)
    .eq('language', language)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
