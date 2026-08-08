-- The ladder that does not end (W2.8 slice 5, docs/spec/10, decided with Ayo 2026-08-08).
--
-- `20260807120000` awarded exactly two week rungs, 4 and 12, by asking `if weeks >= n` twice.
-- That is a dead end, and RHYTHM found it the moment it drew the screen: past twelve weeks the
-- "Next" card disappears, the ring sits permanently full, and the app never celebrates that
-- member again. The retention loop goes quiet for exactly the people who show up most.
--
-- DELIBERATELY NOT DUOLINGO'S ENGINE. Duolingo runs on loss aversion: freezes, repair offers,
-- "don't lose your 400 days". `10` names that as the thing to avoid ("celebration and
-- encouragement, not Duolingo-style punishment"). What is copied here is the ENDLESSNESS and
-- none of the anxiety, and the difference is mechanical rather than a matter of copy: every
-- award is `unique(profile_id, kind)`, so a badge already held is never re-awarded and never
-- taken away. A member whose streak breaks keeps every rung they ever reached.
--
-- TWO LADDERS, because they answer different questions:
--
--   week rungs      "how long have you been coming without a gap": streak-based, so it does
--                   still reset after two missed weeks (grace covers one, `recompute_streak`)
--   gathering count "how many times have you gathered with us, ever": cumulative, so a lapse
--                   costs nothing and somebody back after six months away is still climbing
--
-- The second is the one Duolingo has no answer for, and the one that best fits "a streak is a
-- gift, not a debt". A third layer, a belonging anniversary, was offered and NOT taken.

/**
 * Every week rung at or below `weeks`: 4, 12, 26, 52, then one per year without end.
 *
 * A function rather than a constant array because the ladder has no last element. The named
 * tiers are the first year (a month of Sundays, a season, half a year, a year); after that it
 * is one rung per 52 weeks, forever, which is what makes "the next milestone" a question the
 * screen can always answer.
 *
 * `generate_series` yields nothing when its start exceeds its stop, so a member under two
 * years simply gets the named tiers.
 */
create function public.rhythm_week_rungs(weeks integer)
returns setof integer
language sql
immutable
as $function$
  select rung
  from (
    select unnest(array[4, 12, 26, 52]) as rung
    union all
    select generate_series(104, weeks, 52)
  ) rungs
  where rung <= weeks
  order by rung;
$function$;

comment on function public.rhythm_week_rungs is
  'Week rungs at or below a streak length: 4, 12, 26, 52, then yearly without end (docs/spec/10, W2.8 slice 5).';

/**
 * Every gathering rung at or below `total`: 10, 25, 50, 100, then one per hundred.
 *
 * Counted across a member's whole history rather than consecutively, which is the entire
 * point: this ladder cannot be lost. `first_service` already marks the first one, so this
 * starts at ten.
 */
create function public.rhythm_gathering_rungs(total integer)
returns setof integer
language sql
immutable
as $function$
  select rung
  from (
    select unnest(array[10, 25, 50, 100]) as rung
    union all
    select generate_series(200, total, 100)
  ) rungs
  where rung <= total
  order by rung;
$function$;

comment on function public.rhythm_gathering_rungs is
  'Cumulative gathering rungs at or below a total: 10, 25, 50, 100, then per hundred (docs/spec/10, W2.8 slice 5).';

/**
 * Recompute, then celebrate. Both idempotent, so a replayed insert changes nothing twice.
 *
 * The awards no longer test two numbers. Every rung at or below the current run is awarded,
 * and every gathering count reached, which is self-healing by construction: a grace week that
 * jumps the run forward, a late offline replay that bridges two runs, or a rung added to the
 * ladder years from now all award whatever was skipped the next time somebody checks in, and
 * `award_milestone` is `on conflict do nothing` so nothing is ever awarded twice.
 */
create or replace function public.attendance_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  weeks integer;
  gatherings integer;
  rung integer;
begin
  perform public.recompute_streak(new.profile_id);

  select s.current_weeks into weeks from public.streaks s where s.profile_id = new.profile_id;
  select count(*) into gatherings
    from public.attendance a where a.profile_id = new.profile_id;

  perform public.award_milestone(new.profile_id, 'first_service');

  for rung in select * from public.rhythm_week_rungs(coalesce(weeks, 0)) loop
    perform public.award_milestone(new.profile_id, rung || '_week_rhythm');
  end loop;

  for rung in select * from public.rhythm_gathering_rungs(coalesce(gatherings, 0)) loop
    perform public.award_milestone(new.profile_id, rung || '_gatherings');
  end loop;

  return null;
end;
$$;

-- The kinds this writes are `<n>_week_rhythm` and `<n>_gatherings`, which is the shape the app
-- parses rather than looks up (features/rhythm/milestones.ts). `4_week_rhythm` and
-- `12_week_rhythm` are already exactly that, so nothing existing is renamed and no member
-- loses a badge they hold.
