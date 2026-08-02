-- The batch import, fixed for the only role that ever calls it (W2.7 slice 4).
--
-- 20260802140000 shipped `import_daily_verses` with an unqualified UPDATE over its temp
-- table. Every call through PostgREST failed with "UPDATE requires a WHERE clause", so the
-- import screen could not preview or write a single row.
--
-- WHY pgTAP DID NOT CATCH IT, which is the part worth keeping. `supabase test db` runs as
-- `postgres`; PostgREST connects as `authenticator`, and that role alone preloads the
-- `safeupdate` library:
--
--   authenticator | {session_preload_libraries=safeupdate, statement_timeout=8s, ...}
--
-- So an unqualified UPDATE is legal in the test session and refused in the real one. The
-- test suite cannot be taught this either: `load 'safeupdate'` is denied to `postgres`
-- ("access to library is not allowed"), so there is no way to reproduce the guard inside
-- pgTAP. What catches it is the dashboard's own server test, which goes through PostgREST
-- as a real signed-in admin (apps/dashboard/src/server/verses.test.ts), and it runs in CI.
--
-- The lesson generalises past this function: a pgTAP-green write path is not a proven write
-- path. Anything the app reaches through PostgREST needs at least one test that travels the
-- same road.
--
-- The WHERE below is not decoration for the linter's sake: `problem is null` is true of
-- every row at that point (the column was added two statements earlier), so the statement
-- means exactly what it did, and the qual is real enough that the planner keeps it.
--
-- Rollback (roll forward): nothing to undo. The function is replaced in place and the
-- previous body was unusable through the API.

begin;

set local lock_timeout = '3s';

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
    end
  where problem is null;

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
  'Validates and optionally applies a batch of daily verses. Called twice by the import screen: dry_run=true for the preview counts, then dry_run=false to write. Both go through the same validation, so the preview cannot promise something the write does not do. Every UPDATE here carries a WHERE clause because PostgREST connects as `authenticator`, which preloads safeupdate (docs/spec/17 §48).';

commit;
