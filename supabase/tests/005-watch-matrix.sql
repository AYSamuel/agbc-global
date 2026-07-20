-- Watch domain policy matrix (docs/spec/02) exercised as real bypass attempts
-- (docs/spec/21 §4): public sermons are read-only to clients; the personal
-- tables (resume, notes, My List) are strictly own-row; every forgery fails.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

-- RLS enabled AND forced in the same migration (docs/spec/25 §3).
select is(
  (select relrowsecurity from pg_class where oid = 'public.sermons'::regclass),
  true, 'sermons: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.sermons'::regclass),
  true, 'sermons: RLS forced');
select is(
  (select relrowsecurity from pg_class where oid = 'public.playback_positions'::regclass),
  true, 'playback_positions: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.playback_positions'::regclass),
  true, 'playback_positions: RLS forced');
select is(
  (select relrowsecurity from pg_class where oid = 'public.sermon_notes'::regclass),
  true, 'sermon_notes: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.sermon_notes'::regclass),
  true, 'sermon_notes: RLS forced');
select is(
  (select relrowsecurity from pg_class where oid = 'public.saved_items'::regclass),
  true, 'saved_items: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.saved_items'::regclass),
  true, 'saved_items: RLS forced');

-- Test-owned sermon rows (no shared fixtures: the dev DB carries only real
-- synced data since 2026-07-20): an available video, an available live replay,
-- and an unavailable (rotted) row.
insert into public.sermons (id, title, speaker, youtube_id, kind, status)
values
  ('20000000-0000-4000-8000-000000000001',
   'Grace That Carries You', 'Test Speaker', 'tap-watch-1', 'video', 'available'),
  ('20000000-0000-4000-8000-000000000002',
   'Sunday Stream', 'Test Speaker', 'tap-watch-2', 'live_replay', 'available'),
  ('20000000-0000-4000-8000-000000000003',
   'Rotted Message', 'Test Speaker', 'tap-watch-3', 'video', 'unavailable');

-- Anonymous: sermons are public content; personal tables are invisible.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- Counts are scoped to this suite's own rows: the dev database also carries
-- real synced sermons, so absolute counts would be hostage to the last sync
-- (broke 2026-07-20 after a channel sync).
select is(
  (select count(*) from public.sermons where youtube_id like 'tap-watch-%')::int,
  3, 'anon reads all sermon rows (guest-first, incl. unavailable rows)');
select throws_ok(
  $$insert into public.sermons (title) values ('rogue sermon')$$,
  '42501', null, 'anon cannot insert sermons');
select is(
  (select count(*) from public.sermons
    where status = 'available' and youtube_id like 'tap-watch-%')::int,
  2, 'anon reads the available sermons (the rails read path)');
select is((select count(*) from public.playback_positions)::int, 0,
  'anon sees no resume positions');
select is((select count(*) from public.sermon_notes)::int, 0,
  'anon sees no sermon notes');
select is((select count(*) from public.saved_items)::int, 0,
  'anon sees no saved items');

-- Setup (privileged: direct connection has no user context): two members, and
-- Member B holds one row in each personal table for the isolation checks.
reset role;
insert into auth.users (id, email)
values
  ('30000000-0000-4000-8000-00000000aaaa', 'watch-a@test.local'),
  ('30000000-0000-4000-8000-00000000bbbb', 'watch-b@test.local');
insert into public.profiles (id, email, display_name, branch_id)
values
  ('30000000-0000-4000-8000-00000000aaaa', 'watch-a@test.local', 'Watch A',
   '00000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-00000000bbbb', 'watch-b@test.local', 'Watch B',
   '00000000-0000-4000-8000-000000000002');
insert into public.playback_positions (profile_id, sermon_id, position_sec)
values ('30000000-0000-4000-8000-00000000bbbb',
        '20000000-0000-4000-8000-000000000001', 777);
insert into public.saved_items (profile_id, sermon_id)
values ('30000000-0000-4000-8000-00000000bbbb',
        '20000000-0000-4000-8000-000000000001');
insert into public.sermon_notes (profile_id, sermon_id, body)
values ('30000000-0000-4000-8000-00000000bbbb',
        '20000000-0000-4000-8000-000000000001', 'B private note');

-- Become Member A.
set local role authenticated;
set local request.jwt.claims to
  '{"sub": "30000000-0000-4000-8000-00000000aaaa", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*) from public.sermons where youtube_id like 'tap-watch-%')::int,
  3, 'a member reads the full sermon list');
select throws_ok(
  $$insert into public.sermons (title) values ('member-authored sermon')$$,
  '42501', null, 'a member cannot insert sermons (sync/dashboard only)');
select lives_ok(
  $$update public.sermons set title = 'member defaced'
    where id = '20000000-0000-4000-8000-000000000001'$$,
  'member sermon update executes without error (RLS scopes it to zero rows)');

reset role;
select is(
  (select title from public.sermons
    where id = '20000000-0000-4000-8000-000000000001'),
  'Grace That Carries You', 'the sermon row is unchanged');

-- Back to Member A: own-row CRUD on the personal tables, forgeries fail.
set local role authenticated;
set local request.jwt.claims to
  '{"sub": "30000000-0000-4000-8000-00000000aaaa", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$insert into public.playback_positions (profile_id, sermon_id, position_sec)
    values ('30000000-0000-4000-8000-00000000aaaa',
            '20000000-0000-4000-8000-000000000001', 120)$$,
  'a member writes their own resume position');
select throws_ok(
  $$insert into public.playback_positions (profile_id, sermon_id, position_sec)
    values ('30000000-0000-4000-8000-00000000bbbb',
            '20000000-0000-4000-8000-000000000002', 1)$$,
  '42501', null, 'forging a resume position for someone else fails');
select is((select count(*) from public.playback_positions)::int, 1,
  'a member sees only their own resume rows');
select lives_ok(
  $$update public.playback_positions set position_sec = 300
    where profile_id = '30000000-0000-4000-8000-00000000aaaa'
      and sermon_id = '20000000-0000-4000-8000-000000000001'$$,
  'a member updates their own resume position');
select lives_ok(
  $$update public.playback_positions set position_sec = 0
    where profile_id = '30000000-0000-4000-8000-00000000bbbb'$$,
  'cross-member resume update executes without error (zero rows under RLS)');

reset role;
select is(
  (select position_sec from public.playback_positions
    where profile_id = '30000000-0000-4000-8000-00000000bbbb'),
  777, 'the other member''s resume position is unchanged');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "30000000-0000-4000-8000-00000000aaaa", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$insert into public.saved_items (profile_id, sermon_id)
    values ('30000000-0000-4000-8000-00000000aaaa',
            '20000000-0000-4000-8000-000000000002')$$,
  'a member saves a sermon to My List');
select throws_ok(
  $$insert into public.saved_items (profile_id, sermon_id)
    values ('30000000-0000-4000-8000-00000000bbbb',
            '20000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'forging a saved item for someone else fails');
select is((select count(*) from public.saved_items)::int, 1,
  'a member sees only their own My List');
select lives_ok(
  $$insert into public.sermon_notes (profile_id, sermon_id, body)
    values ('30000000-0000-4000-8000-00000000aaaa',
            '20000000-0000-4000-8000-000000000001', 'A private note')$$,
  'a member writes their own sermon note');
select throws_ok(
  $$insert into public.sermon_notes (profile_id, sermon_id, body)
    values ('30000000-0000-4000-8000-00000000bbbb',
            '20000000-0000-4000-8000-000000000001', 'planted note')$$,
  '42501', null, 'forging a note for someone else fails');
select is((select count(*) from public.sermon_notes)::int, 1,
  'a member sees only their own notes (never another member''s)');
select lives_ok(
  $$delete from public.saved_items
    where profile_id = '30000000-0000-4000-8000-00000000aaaa'$$,
  'a member removes their own saved item');
select is((select count(*) from public.saved_items)::int, 0,
  'the removal reached only their own list');

select * from finish();
rollback;
