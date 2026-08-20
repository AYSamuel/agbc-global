-- The table boundary, asserted (20260820200000).
--
-- Supabase's bootstrap grants `all` on every table in `public` to `anon` and `authenticated`
-- by default privilege, so a table created without explicit grants starts life handing both
-- API roles INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN. Ten
-- tables and three views were in that state until W3.5 slice 5a tripped over it.
--
-- THIS FILE IS THE THING THAT STOPS IT COMING BACK, and its first three assertions are
-- deliberately SCHEMA-WIDE rather than a list of table names. A list would have to be edited
-- every time a table is added, which means the day somebody forgets is the day it stops
-- working; a query over `pg_class` catches the next table without anybody remembering this
-- file exists. That is the same reasoning `001-rls-forced` uses for FORCE RLS.
--
-- The rest is the regression surface, and it points the other way. Narrowing a grant breaks
-- things by REFUSING work that used to happen, and every refusal is a 42501 in a code path
-- no unit test exercises, so the behavioural assertions below drive the paths that would
-- actually break: a guest reading the four public tables at launch, and a member reading and
-- writing their own rows.
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. Everything here reads the catalogue or drives a table directly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

\set member '99000000-0000-4000-8000-00000000000a'
\set glasgow '00000000-0000-4000-8000-000000000001'

insert into auth.users (id, email) values (:'member', 'grants-member@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  (:'member', 'grants-member@test.local', 'Grant Member', :'glasgow', 'member',
   now(), now());

-- ===========================================================================
-- 1. The invariants, over the whole schema.
-- ===========================================================================
-- Written as counts of what must NOT exist, so a table added next year is covered without
-- this file being touched.

select is(
  (select count(*)::integer
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public'
      and c.relkind in ('r', 'v')
      and a.grantee::regrole::text in ('anon', 'authenticated')
      and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')),
  0,
  'no API role holds TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on anything in public');

-- TRUNCATE is the one worth naming on its own, because it is the one privilege in that list
-- that RLS cannot filter: row security applies to SELECT, INSERT, UPDATE and DELETE, and a
-- TRUNCATE simply empties the table. It is unreachable through PostgREST, which is why
-- nothing was ever at risk, but "unreachable through the API we happen to use" is not a
-- boundary, it is a coincidence.

select is(
  (select count(*)::integer
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public'
      and c.relkind in ('r', 'v')
      and a.grantee::regrole::text = 'anon'
      and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'a guest may write nothing anywhere: every contribution in this app gates on a profile');

select is(
  (select count(*)::integer
     from pg_attribute att
     join pg_class c on c.oid = att.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(att.attacl) a
    where n.nspname = 'public'
      and a.grantee::regrole::text = 'anon'
      and a.privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')),
  0,
  'and not by a COLUMN grant either, which is where this schema keeps its narrow writes');

-- The bootstrap itself, not just its output. Without this the next `create table` re-creates
-- the whole problem and the assertions above go red for a reason nobody would guess.
select is(
  (select count(*)::integer
     from pg_default_acl d
     join pg_namespace n on n.oid = d.defaclnamespace
     cross join lateral aclexplode(d.defaclacl) a
    where n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and pg_get_userbyid(d.defaclrole) = 'postgres'
      and a.grantee::regrole::text in ('anon', 'authenticated')),
  0,
  'a new table in public grants the API roles nothing until its migration says so');

-- ===========================================================================
-- 2. The eleven objects, exactly.
-- ===========================================================================
-- Each set derived from the object's OWN policies (see the migration header). Asserted as a
-- whole array rather than one privilege at a time, so a grant ADDED later fails here too.

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relname = 'profiles'
      and a.grantee::regrole::text = 'authenticated'),
  array['INSERT', 'SELECT', 'UPDATE'],
  'profiles: create your own at AUTH-3, read it, change what the guard allows');

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'delete'),
  'and NO delete: an account is closed by the deletion job, never by dropping the row');

select ok(
  has_table_privilege('supabase_auth_admin', 'public.profiles', 'select'),
  'the access token hook keeps its read, which sign-in does not work without');

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relname = 'notification_prefs'
      and a.grantee::regrole::text = 'authenticated'),
  array['SELECT', 'UPDATE'],
  'notification_prefs: read and change your own, and nothing else');

select ok(
  not has_table_privilege('authenticated', 'public.notification_prefs', 'insert'),
  'no INSERT: the row arrives with the profile, from a SECURITY DEFINER trigger');

select is(
  (select count(*)::integer
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public'
      and c.relname in ('devices', 'playback_positions')
      and a.grantee::regrole::text = 'anon'),
  0,
  'a guest has no privilege at all on the member-owned tables, having no row on either');

select is(
  (select count(*)::integer
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public'
      and c.relname in ('profiles', 'notification_prefs')
      and a.grantee::regrole::text = 'anon'),
  0,
  'nor on profiles or notification_prefs');

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relname = 'sermons'
      and a.grantee::regrole::text = 'authenticated'),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'sermons: everyone reads, and the "admins manage sermons" policy needs the other three');

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relname = 'app_config'
      and a.grantee::regrole::text = 'anon'),
  array['SELECT'],
  'app_config: a guest reads the minimum supported version at launch, before any session');

select is(
  (select array_agg(a.privilege_type order by a.privilege_type)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relname = 'moderation_queue'
      and a.grantee::regrole::text = 'authenticated'),
  array['SELECT'],
  'the moderation queue is readable by staff and writable by nobody');

select is(
  (select count(*)::integer
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relname = 'moderation_queue'
      and a.grantee::regrole::text = 'anon'),
  0,
  'and a guest holds nothing on it: it runs as its INVOKER, so this is the boundary');

select is(
  (select count(*)::integer
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
    where n.nspname = 'public'
      and c.relname in ('prayer_feed', 'testimony_feed')
      and a.grantee::regrole::text in ('anon', 'authenticated')
      and a.privilege_type <> 'SELECT'),
  0,
  'the two feeds are read-only to both API roles');

-- ===========================================================================
-- 3. What must still work, which is the actual risk of narrowing a grant.
-- ===========================================================================

set local role anon;
set local request.jwt.claims to '{}';

select lives_ok(
  $$select count(*) from public.app_config$$,
  'a guest still reads app_config: the forced-update gate runs before any sign-in');

select lives_ok(
  $$select count(*) from public.daily_verses$$,
  'and the daily verse, which is the first thing HOME draws');

select lives_ok(
  $$select count(*) from public.sermons$$,
  'and the sermons, because browsing has never required an account');

select lives_ok(
  $$select count(*) from public.giving_config$$,
  'and the giving details, which `12` requires to work offline and signed out');

select throws_ok(
  $$insert into public.daily_verses (date, language, reference, text, translation)
    values ('2099-01-01', 'en', 'John 1:1', 'In the beginning', 'WEB')$$,
  '42501',
  null,
  'and writes nothing: the refusal is the GRANT now, not only the absent policy');

reset role;
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"99000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member"}';

select lives_ok(
  $$select count(*) from public.notification_prefs$$,
  'a member still reads their own notification prefs');

select lives_ok(
  $$update public.notification_prefs set branch_updates = false
     where profile_id = '99000000-0000-4000-8000-00000000000a'$$,
  'and still turns one off, which is the whole of NOTIF-PREFS');

select lives_ok(
  $$insert into public.playback_positions (profile_id, sermon_id, position_sec)
    select '99000000-0000-4000-8000-00000000000a', s.id, 42
      from public.sermons s limit 1$$,
  'and still records where they got to in a message');

select lives_ok(
  $$update public.profiles set display_name = 'Renamed'
     where id = '99000000-0000-4000-8000-00000000000a'$$,
  'and still edits their own profile');

select throws_ok(
  $$delete from public.profiles
     where id = '99000000-0000-4000-8000-00000000000a'$$,
  '42501',
  null,
  'but cannot delete it, which is now refused a step earlier than the missing policy');

select * from finish();
rollback;
