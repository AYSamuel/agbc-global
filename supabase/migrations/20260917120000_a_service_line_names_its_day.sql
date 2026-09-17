-- W4.19 follow-up: the display strings a branch card reads, corrected on the rows
-- that already exist. Seeds do not re-run on a live project, so this is the only
-- way the four branches get it.
--
-- TWO FAULTS, and only one of them was cosmetic.
--
-- 1. THE SUNDAY LINE HAD NO DAY. `service_times` carries free display strings, and
--    whoever wrote the midweek ones included the weekday ("Mittwochs 19:00 Uhr")
--    while the sunday ones were bare times ("11:00 AM"). Three surfaces read that
--    string and all three showed a time with nothing to anchor it: the share card's
--    first row, the branch hero's `languages · time`, and the `.svccard .when`
--    fallback for a branch with no machine schedule. Reported from a share image.
--
-- 2. AGBC UK HAD NO MIDWEEK LINE AT ALL, while `branch_services` held its midweek
--    service the whole time (weekday 3, 18:00, Europe/London). The dashboard's
--    branch form edits `sunday` and used to SAVE `{ sunday }` alone, replacing the
--    whole jsonb and deleting the other keys, so the first person to edit that
--    branch there erased its Wednesday line. The dashboard is fixed in the same
--    change (`otherKeys` in apps/dashboard/src/server/branches.ts); this restores
--    what it destroyed.
--
-- THE DAY IS WRITTEN IN EACH BRANCH'S OWN LANGUAGE, matching that branch's existing
-- midweek line, because `02` calls these display strings and stores what the branch
-- wrote. A translated prefix added at render time would have put "Sundays" above
-- "Mittwochs" on the same card.
--
-- Keyed on SLUG, never name: production renamed 'glasgow' to "AGBC UK" through the
-- dashboard, so the name is a moving target and the slug is not.
--
-- Safe as an explicit set rather than a patch: production's four sunday values were
-- read before this was written and are still exactly the seeded ones, so no leader
-- has customised a string this overwrites. A later edit through the dashboard wins
-- over this, which is correct, and no longer costs the midweek key.
--
-- Rollback: set the four values back to bare times and drop the UK midweek key. The
-- machine schedule in `branch_services` is untouched by all of this.

update public.branches
set service_times = jsonb_build_object(
  'sunday', 'Sundays 12:00 PM (UK time)',
  'midweek', 'Wednesdays 6:00 PM (UK time)'
)
where slug = 'glasgow';

update public.branches
set service_times = jsonb_build_object(
  'sunday', 'Sonntags 11:00 Uhr (CET)',
  'midweek', 'Mittwochs 19:00 Uhr (CET)'
)
where slug = 'berlin';

update public.branches
set service_times = jsonb_build_object(
  'sunday', 'Zondag 11:00 uur (CET)',
  'midweek', 'Woensdag 19:00 uur (CET)'
)
where slug = 'emmen';

update public.branches
set service_times = jsonb_build_object(
  'sunday', 'Sundays 11:00 AM (WAT)',
  'midweek', 'Wednesdays 7:00 PM (WAT)'
)
where slug = 'ogbomosho';
