-- The daily-verse schedule: batch import and queue depth (W2.7 slice 4, docs/spec/17 §48,
-- `22` §1, frames approved in PR #119).
--
-- The table and its admin policy already exist (20260720210000, retargeted onto the live
-- authority check by 20260802120000). What is missing is the two things the surface needs:
-- a way to put a quarter of verses in at once, and an honest answer to "how far ahead are
-- we".
--
-- WHY THE DEPTH ANSWER IS SHAPED THE WAY IT IS, since it drives the whole screen. The app
-- asks for the newest verse dated on or before today, in the member's own language:
--
--   .eq('language', lang).lte('date', today).order('date', desc).limit(1)
--
-- So a day with no row does not blank the card. It shows an older verse. There is no error
-- and nothing for a member to report, which is the failure `22` §1 names outright: "every
-- member sees a stale verse for weeks; the daily touchpoint dies quietly." And the query is
-- per language, so German can be repeating a three-week-old verse while English is fine.
--
-- Depth is therefore NOT "how many future rows exist". A language with 88 future rows and a
-- gap tomorrow is broken tomorrow, and a count would call it healthy. What the screen and
-- the `21` §5 monitor both need is the FIRST DAY WITH NO VERSE, per language. Everything
-- else is derived from that.
--
-- Rollback (roll forward): a compensating migration drops the three functions. No table or
-- column changes, so nothing to undo on the data side.

begin;

set local lock_timeout = '3s';

-- --- a date parser that refuses rather than guesses ---------------------------------------

-- Postgres accepts a great deal as a date, and that is the problem. Depending on DateStyle,
-- '01/02/2026' is either 1 February or 2 January, and a spreadsheet exported in the wrong
-- locale would import silently onto the wrong days. Nobody would notice: every day still
-- has a verse, just not the intended one.
--
-- So: ISO only, checked by shape before it is cast, and the cast still wrapped because
-- '2026-08-32' passes the regex and is not a day. Anything else is reported to the importer
-- as a bad row rather than absorbed.
create or replace function public.try_iso_date(raw text)
returns date
language plpgsql
immutable
as $function$
begin
  if raw is null or raw !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return raw::date;
exception
  when others then
    -- A well-shaped impossible day: 2026-02-30, 2026-08-32.
    return null;
end;
$function$;

comment on function public.try_iso_date is
  'Parses YYYY-MM-DD or returns null. Deliberately refuses every other format: an ambiguous date silently lands on the wrong day, and a verse on the wrong day is invisible rather than broken.';

-- --- how far ahead each language is queued ------------------------------------------------

create or replace function public.daily_verse_depth()
returns table (
  language text,
  -- The first day from today onward with no verse in that language. Null when the horizon
  -- below is fully covered.
  runs_out_on date,
  -- Whole days from today until that gap. 0 means today itself is missing.
  days_queued integer,
  -- What a member on that language would actually see if they opened the app on the day it
  -- runs out: the verse this date carries. Null when nothing precedes the gap at all.
  stale_from date
)
language sql
stable
as $function$
  with langs (language) as (
    -- Mirrors the CHECK on daily_verses.language. Hard-coded rather than derived from the
    -- constraint because a fifth language is a product decision that will touch this
    -- function's callers anyway, and reading it out of the catalog reads as cleverness.
    values ('en'), ('de'), ('nl'), ('fr')
  ),
  -- A year and a bit. Long enough that a fully-stocked language reports "no gap" rather
  -- than a misleading number, short enough to stay a trivial scan (4 x 400 rows).
  horizon as (
    select generate_series(current_date, current_date + 400, interval '1 day')::date as day
  ),
  gaps as (
    select l.language, min(h.day) as runs_out_on
    from langs l
    cross join horizon h
    left join public.daily_verses v
      on v.date = h.day and v.language = l.language
    where v.date is null
    group by l.language
  )
  select
    l.language,
    g.runs_out_on,
    -- No gap inside the horizon reports the horizon itself rather than null, so a caller
    -- can compare against the 14-day floor without special-casing "fully stocked".
    coalesce((g.runs_out_on - current_date), 401)::integer as days_queued,
    (
      select max(v.date) from public.daily_verses v
      where v.language = l.language
        and v.date < coalesce(g.runs_out_on, current_date + 401)
    ) as stale_from
  from langs l
  left join gaps g on g.language = l.language
  order by days_queued, l.language;
$function$;

comment on function public.daily_verse_depth is
  'Per language: the first day with no verse, how many days that is away, and the verse date members would be stuck on. Counts the FIRST GAP rather than future rows, because the app falls back to the newest verse on or before today and a gap behind a full queue is still a stale card (docs/spec/22 §1, 21 §5).';

-- --- the batch import ----------------------------------------------------------------------

-- ONE function for both the preview and the write, which is the whole design.
--
-- The screen promises "nothing is saved until you have seen what it will do", and that
-- promise is only true if the thing that counts and the thing that writes are the same code.
-- A preview computed in the browser and a write executed here would agree on the day they
-- were written and drift apart afterwards, and the screen would be quietly lying about a
-- 360-row import.
--
-- SECURITY INVOKER, deliberately. The admin policy on daily_verses is the mechanism, exactly
-- as the project convention says (RLS and triggers, never the caller). The explicit guard
-- below exists only so a non-admin gets an honest refusal instead of RLS's silent zero-row
-- write, which is the trap ADR 0015's plan calls out by name.
create or replace function public.import_daily_verses(
  batch jsonb,
  replace_existing boolean default false,
  dry_run boolean default true
)
returns jsonb
language plpgsql
as $function$
declare
  result jsonb;
  problem_rows jsonb;
  count_new integer;
  count_existing integer;
  count_invalid integer;
  count_applied integer := 0;
begin
  if not public.caller_is_admin_live() then
    raise exception 'only an admin manages the verse schedule'
      using errcode = 'insufficient_privilege';
  end if;

  if batch is null or jsonb_typeof(batch) <> 'array' then
    raise exception 'batch must be a json array of rows'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Dropped at the end of this function rather than guarded at the start. A defensive
  -- `drop table if exists` here would emit a NOTICE on every single call, and a preview plus
  -- an apply is two calls per import: 026 filled the test log with them. It is not needed
  -- either way, because the only path that leaves the table behind is one that raised, and
  -- that has already aborted the transaction the temp table lives in.
  create temp table _verse_batch on commit drop as
  select
    -- The importer's own line number where they gave one, otherwise position in the array.
    -- It is the only thing that makes "12 problems" actionable in a 360-row paste, so it is
    -- carried end to end rather than recomputed.
    coalesce((r.value ->> 'line')::integer, r.ord::integer) as line,
    r.value ->> 'date'                                      as raw_date,
    public.try_iso_date(r.value ->> 'date')                 as parsed_date,
    lower(btrim(coalesce(r.value ->> 'language', '')))      as language,
    btrim(coalesce(r.value ->> 'reference', ''))            as reference,
    btrim(coalesce(r.value ->> 'text', ''))                 as verse_text,
    -- The frames say translation defaults to WEB when the column is missing, which is what
    -- the table's own default says too.
    coalesce(nullif(btrim(coalesce(r.value ->> 'translation', '')), ''), 'WEB') as translation
  from jsonb_array_elements(batch) with ordinality r(value, ord);

  -- One reason per row, in the order an importer would want to hear them: the row is
  -- unusable before it is a duplicate.
  alter table _verse_batch add column problem text;

  update _verse_batch set problem =
    case
      when raw_date is null or btrim(raw_date) = '' then 'date_missing'
      when raw_date !~ '^\d{4}-\d{2}-\d{2}$'        then 'date_not_iso'
      when parsed_date is null                      then 'date_impossible'
      when language = ''                            then 'language_missing'
      when language not in ('en', 'de', 'nl', 'fr') then 'language_unknown'
      when verse_text = ''                          then 'text_blank'
      when reference = ''                           then 'reference_blank'
    end;

  -- Duplicates WITHIN the paste, which is a real spreadsheet accident and not a theoretical
  -- one. It has to be caught here rather than left to the unique index, because an upsert
  -- touching the same (date, language) twice fails the WHOLE statement with "ON CONFLICT DO
  -- UPDATE command cannot affect row a second time". One repeated day would otherwise take
  -- down an import of 360.
  --
  -- The FIRST occurrence stays valid and later ones are reported, so a batch with one
  -- duplicated day still imports every other day.
  update _verse_batch b set problem = 'duplicate_in_batch'
  where b.problem is null
    and exists (
      select 1 from _verse_batch e
      where e.problem is null
        and e.parsed_date = b.parsed_date
        and e.language = b.language
        and e.line < b.line
    );

  select count(*) into count_invalid from _verse_batch where problem is not null;

  select count(*) into count_existing
  from _verse_batch b
  join public.daily_verses v
    on v.date = b.parsed_date and v.language = b.language
  where b.problem is null;

  select count(*) - count_existing into count_new
  from _verse_batch where problem is null;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'line', line,
             'date', raw_date,
             'language', language,
             'reason', problem
           ) order by line
         ), '[]'::jsonb)
    into problem_rows
  from _verse_batch where problem is not null;

  if not dry_run then
    if replace_existing then
      insert into public.daily_verses (date, reference, text, translation, language)
      select b.parsed_date, b.reference, b.verse_text, b.translation, b.language
      from _verse_batch b
      where b.problem is null
      on conflict (date, language) do update
        set reference   = excluded.reference,
            text        = excluded.text,
            translation = excluded.translation;
      count_applied := count_new + count_existing;
    else
      insert into public.daily_verses (date, reference, text, translation, language)
      select b.parsed_date, b.reference, b.verse_text, b.translation, b.language
      from _verse_batch b
      where b.problem is null
      on conflict (date, language) do nothing;
      count_applied := count_new;
    end if;
  end if;

  result := jsonb_build_object(
    'dry_run', dry_run,
    'replace_existing', replace_existing,
    'new', count_new,
    'existing', count_existing,
    'invalid', count_invalid,
    'applied', count_applied,
    'problems', problem_rows
  );

  drop table if exists _verse_batch;
  return result;
end;
$function$;

comment on function public.import_daily_verses is
  'Validates and optionally applies a batch of daily verses. Called twice by the import screen: dry_run=true for the preview counts, then dry_run=false to write. Both go through the same validation, so the preview cannot promise something the write does not do. Reason codes are stable identifiers; the dashboard owns the English (docs/spec/17 §48).';

-- Callable by signed-in staff only. The function refuses non-admins itself and the policy
-- refuses them again underneath, so this is the third layer rather than the only one.
--
-- REVOKED FROM THE ROLES BY NAME, not just from PUBLIC. Supabase's bootstrap grants EXECUTE
-- on new functions to anon, authenticated and service_role directly, exactly as it does for
-- tables (see the note in 20260729220000, and issue #96). `revoke ... from public` removes a
-- default that is not what is granting it, and leaves anon holding EXECUTE while looking
-- like it revoked something. Measured here, not assumed: the first version of this migration
-- did precisely that and 026 caught it.
revoke all on function public.import_daily_verses(jsonb, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.import_daily_verses(jsonb, boolean, boolean) to authenticated;

commit;
