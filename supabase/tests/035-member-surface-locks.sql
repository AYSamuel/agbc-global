-- W3.1 slice 4: the member surfaces' locks (20260815120000), attempted as real
-- clients (docs/spec/21 §4).
--
-- Three claims under test:
--
--   1. "One document per member per message" is a CONSTRAINT now, not a comment:
--      the second insert refuses, and the PostgREST-shaped upsert converges on
--      one row with the newest body (the two-devices case).
--   2. Identity is not an input: profile_id defaults to auth.uid(), the INSERT
--      grant excludes the column, and a client naming it (even truthfully) is
--      refused at the grant layer before RLS ever looks.
--   3. #96's blanket privileges are gone from these two tables: anon can only
--      SELECT (RLS yields zero rows), authenticated holds exactly the scoped
--      column grants, nobody holds TRUNCATE, and saved_items has no UPDATE for
--      anyone because a membership row has nothing to change.
--
-- The whole privilege inventory is asserted so the next column added to either
-- table is a decision rather than an oversight (the 20260803140000 rule).
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind; every
-- privileged block pairs it with `set local request.jwt.claims to '{}'`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- Cast: two members and a sermon, written by the trusted path.
insert into auth.users (id, email) values
  ('96000000-0000-4000-8000-00000000000a', 'locks-a@test.local'),
  ('96000000-0000-4000-8000-00000000000b', 'locks-b@test.local');
insert into public.profiles (id, email, display_name, branch_id) values
  ('96000000-0000-4000-8000-00000000000a', 'locks-a@test.local', 'Locks A',
   '00000000-0000-4000-8000-000000000001'),
  ('96000000-0000-4000-8000-00000000000b', 'locks-b@test.local', 'Locks B',
   '00000000-0000-4000-8000-000000000002');
insert into public.sermons (id, title, speaker, youtube_id)
values ('86000000-0000-4000-8000-00000000000a', 'Locks Sermon', 'Pastor Test',
        'locks-yt-0001'),
       ('86000000-0000-4000-8000-00000000000b', 'Locks Sermon II', 'Pastor Test',
        'locks-yt-0002');

-- ===========================================================================
-- 1. Shape: the constraint and the defaults.
-- ===========================================================================

select col_is_unique('public', 'sermon_notes',
  array['profile_id', 'sermon_id'],
  'sermon_notes: one document per member per message is a unique constraint');
select hasnt_index('public', 'sermon_notes', 'sermon_notes_profile_sermon_idx',
  'the plain (profile_id, sermon_id) index is gone: the unique one serves it');

select col_default_is('public', 'sermon_notes', 'profile_id', 'auth.uid()',
  'sermon_notes.profile_id defaults to auth.uid()');
select col_default_is('public', 'saved_items', 'profile_id', 'auth.uid()',
  'saved_items.profile_id defaults to auth.uid()');

-- ===========================================================================
-- 2. The privilege inventory, per role.
-- ===========================================================================

-- anon: SELECT only (RLS yields zero rows; W1.3's local/CI parity reasoning).
select is(has_table_privilege('anon', 'public.sermon_notes', 'select'), true,
  'anon may SELECT sermon_notes (RLS yields zero rows)');
select is(has_table_privilege('anon', 'public.saved_items', 'select'), true,
  'anon may SELECT saved_items (RLS yields zero rows)');
select is(has_any_column_privilege('anon', 'public.sermon_notes', 'insert'),
  false, 'anon holds no INSERT on sermon_notes, not even one column');
select is(has_any_column_privilege('anon', 'public.saved_items', 'insert'),
  false, 'anon holds no INSERT on saved_items, not even one column');
select is(has_any_column_privilege('anon', 'public.sermon_notes', 'update'),
  false, 'anon holds no UPDATE on sermon_notes');
select is(has_table_privilege('anon', 'public.sermon_notes', 'delete'), false,
  'anon holds no DELETE on sermon_notes');
select is(has_table_privilege('anon', 'public.saved_items', 'delete'), false,
  'anon holds no DELETE on saved_items');
select is(has_table_privilege('anon', 'public.sermon_notes', 'truncate'), false,
  'anon holds no TRUNCATE on sermon_notes (#96''s blanket grant is gone)');
select is(has_table_privilege('anon', 'public.saved_items', 'truncate'), false,
  'anon holds no TRUNCATE on saved_items (#96''s blanket grant is gone)');

-- authenticated: exactly the scoped grants. has_column_privilege answers true
-- for a table-level grant too, so the false answers below also prove no
-- table-wide INSERT/UPDATE survived the revoke.
select is(has_table_privilege('authenticated', 'public.sermon_notes',
  'truncate'), false, 'authenticated holds no TRUNCATE on sermon_notes');
select is(has_table_privilege('authenticated', 'public.saved_items',
  'truncate'), false, 'authenticated holds no TRUNCATE on saved_items');

select is(has_column_privilege('authenticated', 'public.sermon_notes', 'body',
  'insert'), true, 'a member may INSERT a note''s body');
select is(has_column_privilege('authenticated', 'public.sermon_notes',
  'sermon_id', 'insert'), true, 'a member may INSERT a note''s sermon_id');
select is(has_column_privilege('authenticated', 'public.sermon_notes',
  'profile_id', 'insert'), false,
  'a member may NOT name profile_id on INSERT: identity is not an input');
select is(has_column_privilege('authenticated', 'public.sermon_notes',
  'created_at', 'insert'), false,
  'a member may NOT name created_at on INSERT');
select is(has_column_privilege('authenticated', 'public.sermon_notes', 'body',
  'update'), true, 'a member may UPDATE a note''s body');
select is(has_column_privilege('authenticated', 'public.sermon_notes',
  'sermon_id', 'update'), true,
  'sermon_id stays UPDATE-able: PostgREST''s upsert SETs every payload column');
select is(has_column_privilege('authenticated', 'public.sermon_notes',
  'profile_id', 'update'), false,
  'a member may NOT move a note to another profile');
select is(has_table_privilege('authenticated', 'public.sermon_notes', 'delete'),
  true, 'a member may DELETE their notes (RLS scopes whose)');

select is(has_column_privilege('authenticated', 'public.saved_items',
  'sermon_id', 'insert'), true, 'a member may INSERT a saved sermon_id');
select is(has_column_privilege('authenticated', 'public.saved_items',
  'profile_id', 'insert'), false,
  'a member may NOT name profile_id when saving');
select is(has_column_privilege('authenticated', 'public.saved_items',
  'created_at', 'insert'), false,
  'a member may NOT forge My List order via created_at');
select is(has_any_column_privilege('authenticated', 'public.saved_items',
  'update'), false,
  'nobody UPDATEs a saved item: it exists or it does not');
select is(has_table_privilege('authenticated', 'public.saved_items', 'delete'),
  true, 'a member may DELETE from their list (RLS scopes whose)');

-- ===========================================================================
-- 3. Behavior as a member: the client the grants were written for.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$insert into public.sermon_notes (sermon_id, body)
    values ('86000000-0000-4000-8000-00000000000a', 'first draft')$$,
  'a member writes a note without naming themselves');
select is(
  (select profile_id from public.sermon_notes
    where sermon_id = '86000000-0000-4000-8000-00000000000a'),
  '96000000-0000-4000-8000-00000000000a'::uuid,
  'the default assigned the caller as the owner');

select throws_ok(
  $$insert into public.sermon_notes (profile_id, sermon_id, body)
    values ('96000000-0000-4000-8000-00000000000a',
            '86000000-0000-4000-8000-00000000000b', 'named myself')$$,
  '42501', null,
  'naming profile_id is refused even when it is truthful');

-- The two-devices case, in PostgREST's own shape (merge-duplicates SETs every
-- payload column, which is why sermon_id sits in the SET below).
select lives_ok(
  $$insert into public.sermon_notes (sermon_id, body)
    values ('86000000-0000-4000-8000-00000000000a', 'second device wins')
    on conflict (profile_id, sermon_id)
    do update set sermon_id = excluded.sermon_id, body = excluded.body$$,
  'the autosave upsert lands on the existing document');
select is(
  (select count(*)::int from public.sermon_notes
    where sermon_id = '86000000-0000-4000-8000-00000000000a'),
  1, 'still one document: the upsert updated rather than split');
select is(
  (select body from public.sermon_notes
    where sermon_id = '86000000-0000-4000-8000-00000000000a'),
  'second device wins', 'the newest write holds the body');
select throws_ok(
  $$insert into public.sermon_notes (sermon_id, body)
    values ('86000000-0000-4000-8000-00000000000a', 'a second row')$$,
  '23505', null,
  'a bare duplicate insert refuses: one document is a constraint now');

select lives_ok(
  $$insert into public.saved_items (sermon_id)
    values ('86000000-0000-4000-8000-00000000000a')$$,
  'a member saves a message without naming themselves');
select lives_ok(
  $$insert into public.saved_items (sermon_id)
    values ('86000000-0000-4000-8000-00000000000a')
    on conflict (profile_id, sermon_id) do nothing$$,
  'a replayed save is a no-op, not an error (the queue''s idempotency)');
select is((select count(*)::int from public.saved_items), 1,
  'one save, however many times the wish replayed');
select lives_ok(
  $$delete from public.saved_items
    where sermon_id = '86000000-0000-4000-8000-00000000000a'$$,
  'unsaving needs no profile filter: RLS already scopes the rows');

-- Member B sees none of it.
reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000002"}';
select is((select count(*)::int from public.sermon_notes), 0,
  'another member sees no trace of A''s note');

-- ===========================================================================
-- 4. The trusted path still names identity explicitly.
-- ===========================================================================
reset role;
set local request.jwt.claims to '{}';

select lives_ok(
  $$insert into public.sermon_notes (profile_id, sermon_id, body)
    values ('96000000-0000-4000-8000-00000000000b',
            '86000000-0000-4000-8000-00000000000b', 'seeded note')$$,
  'the service path names profile_id explicitly and is unaffected');

select * from finish();
rollback;
