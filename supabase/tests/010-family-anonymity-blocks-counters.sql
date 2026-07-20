-- Three guarantees that the Family feeds live or die by (docs/spec/09, 02, 20):
--
--   1. An anonymous request is anonymous IN THE DATA, not in the presentation. The
--      author_id must not reach a client through any read path, and must not reach
--      one through the realtime broadcast either. The Done criterion for W1.5 says
--      "verify against the network trace, not the UI"; the equivalent here is
--      asserting on the view output and on the row realtime.send actually wrote.
--   2. A block hides content in BOTH directions, immediately, server-side.
--   3. The counts on a card are the database's arithmetic, never the client's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (id, email) values
  ('92000000-0000-4000-8000-00000000000a', 'anon-author@test.local'),
  ('92000000-0000-4000-8000-00000000000b', 'anon-reader@test.local'),
  ('92000000-0000-4000-8000-00000000000c', 'anon-third@test.local'),
  ('92000000-0000-4000-8000-00000000000d', 'anon-leader@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('92000000-0000-4000-8000-00000000000a', 'anon-author@test.local', 'Quiet Author',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('92000000-0000-4000-8000-00000000000b', 'anon-reader@test.local', 'Reader',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('92000000-0000-4000-8000-00000000000c', 'anon-third@test.local', 'Bystander',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('92000000-0000-4000-8000-00000000000d', 'anon-leader@test.local', 'Branch Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now());

insert into public.prayers
  (id, author_id, branch_id, body, is_anonymous, status, consent_version)
values
  ('86000000-0000-4000-8000-00000000000a', '92000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'anon hidden request', true,
   'approved', 'tap-v1'),
  ('86000000-0000-4000-8000-00000000000b', '92000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'anon named request', false,
   'approved', 'tap-v1');

-- ===========================================================================
-- 1. Anonymity is a property of the data.
-- ===========================================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is(
  (select author_id from public.prayer_feed
    where body = 'anon hidden request'),
  null::uuid, 'a guest gets no author_id for an anonymous request');
select is(
  (select author_name from public.prayer_feed
    where body = 'anon hidden request'),
  null::text, 'nor a display name');
select is(
  (select author_avatar_url from public.prayer_feed
    where body = 'anon hidden request'),
  null::text, 'nor an avatar to correlate on');
select is(
  (select author_name from public.prayer_feed
    where body = 'anon named request'),
  'Quiet Author', 'a named request still carries its author, or the feed would be useless');
-- The stripping is unconditional, not "hidden from everyone except X": there is no
-- caller for whom the feed yields the anonymous author.
select is(
  (select count(*) from public.prayer_feed
    where body = 'anon hidden request'
      and author_id = '92000000-0000-4000-8000-00000000000a')::int,
  0, 'and no filter on the feed can recover it');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select author_id from public.prayer_feed
    where body = 'anon hidden request'),
  null::uuid, 'not even to the author themselves through the public feed');

set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*) from public.prayers where body = 'anon hidden request')::int,
  0, 'and the base table hands another member nothing to read around it');

-- The moderation plane is the deliberate exception: safeguarding needs a name.
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select author_id from public.prayers where body = 'anon hidden request'),
  '92000000-0000-4000-8000-00000000000a'::uuid,
  'the branch leader can still see who wrote it (safeguarding, docs/spec/17)');

-- The realtime path is the one that bypasses views, so it gets its own assertion:
-- publish an anonymous request and read back what realtime.send actually wrote.
reset role;
set local request.jwt.claims to '{}';
insert into public.prayers
  (id, author_id, branch_id, body, is_anonymous, status, consent_version)
values
  ('86000000-0000-4000-8000-00000000000c', '92000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'anon broadcast probe', true,
   'pending', 'tap-v1');
update public.prayers set status = 'approved'
  where id = '86000000-0000-4000-8000-00000000000c';

-- Asserted over ALL messages for this row, never "the latest": every statement in
-- this transaction shares one now(), so inserted_at cannot order them.
select is(
  (select count(*) from realtime.messages
    where payload ->> 'id' = '86000000-0000-4000-8000-00000000000c'
      and payload ->> 'author_id' is not null)::int,
  0, 'no broadcast for an anonymous request carries an author_id, on any channel');
select is(
  (select count(*) from realtime.messages
    where topic = 'family:all'
      and payload ->> 'id' = '86000000-0000-4000-8000-00000000000c'
      and payload ->> 'action' = 'inserted')::int,
  1, 'approval is what puts a request on the live feeds');
select is(
  (select count(*) from realtime.messages
    where topic = 'family:branch:00000000-0000-4000-8000-000000000001'
      and payload ->> 'id' = '86000000-0000-4000-8000-00000000000c')::int,
  1, 'and it reaches the branch channel as well as Everywhere');

-- Withdrawal must not wait for a refetch: leaving public visibility broadcasts a
-- removal so live clients drop the card (docs/spec/02, 20).
update public.prayers set deleted_at = now()
  where id = '86000000-0000-4000-8000-00000000000c';
select is(
  (select count(*) from realtime.messages
    where topic = 'family:all'
      and payload ->> 'id' = '86000000-0000-4000-8000-00000000000c'
      and payload ->> 'action' = 'removed')::int,
  1, 'deleting an approved request broadcasts a removal immediately');

-- ===========================================================================
-- 2. A block hides content in both directions.
-- ===========================================================================
insert into public.testimonies
  (id, author_id, branch_id, body, status, consent_version)
values
  ('87000000-0000-4000-8000-00000000000a', '92000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'blk by author', 'approved', 'tap-v1'),
  ('87000000-0000-4000-8000-00000000000b', '92000000-0000-4000-8000-00000000000b',
   '00000000-0000-4000-8000-000000000001', 'blk by reader', 'approved', 'tap-v1');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*) from public.testimony_feed where body like 'blk %')::int,
  2, 'before any block, the reader sees both testimonies');

-- The reader blocks the author, forging someone else's blocker_id on the way in.
select lives_ok(
  $$insert into public.blocked_users (blocker_id, blocked_id)
    values ('92000000-0000-4000-8000-00000000000c',
            '92000000-0000-4000-8000-00000000000a')$$,
  'the reader blocks the author');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select blocker_id from public.blocked_users
    where blocked_id = '92000000-0000-4000-8000-00000000000a'),
  '92000000-0000-4000-8000-00000000000b'::uuid,
  'and the block is recorded against the caller, not the supplied blocker_id');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*) from public.testimony_feed where body = 'blk by author')::int,
  0, 'the blocked author''s testimony leaves the blocker''s feed');
select is(
  (select count(*) from public.prayer_feed where body = 'anon named request')::int,
  0, 'across both feeds');

-- The other direction: the blocked author must not see the blocker either, and must
-- not be able to find out that they were blocked.
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*) from public.testimony_feed where body = 'blk by reader')::int,
  0, 'and the blocker''s content disappears for the blocked member too (two-way)');
select is(
  (select count(*) from public.blocked_users)::int,
  0, 'while "who blocked me" stays undisclosed: the row is unreadable to them');
-- And there is no side door: the two-way filter lives inline in the feed views, so
-- no client-callable function exists that would answer the question the policy
-- above refuses (see the note in the migration for why a helper was rejected).
select is(
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_blocked_with')::int,
  0, 'and no block-probing helper exists for them to call');
select is(
  (select count(*) from public.testimony_feed where body = 'blk by author')::int,
  1, 'their own testimony is of course still there');

-- A bystander is unaffected by other people's blocks.
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*) from public.testimony_feed where body like 'blk %')::int,
  2, 'a bystander still sees both');

set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$delete from public.blocked_users
    where blocked_id = '92000000-0000-4000-8000-00000000000a'$$,
  'the reader unblocks');
select is(
  (select count(*) from public.testimony_feed where body like 'blk %')::int,
  2, 'and both testimonies come back');

-- ===========================================================================
-- 3. Counts are the database's arithmetic.
-- ===========================================================================
select lives_ok(
  $$insert into public.glory_reactions (testimony_id, profile_id)
    values ('87000000-0000-4000-8000-00000000000a',
            '92000000-0000-4000-8000-00000000000b')
    on conflict do nothing$$,
  'the reader gives Glory');
select is(
  (select glory_count from public.testimony_feed
    where id = '87000000-0000-4000-8000-00000000000a'),
  1, 'the count is one');
-- The offline queue replays writes; a replayed tap must not double-count. The
-- skipped conflicting insert fires no trigger, which is the whole reason the client
-- is told to use ON CONFLICT DO NOTHING (docs/spec/02).
select lives_ok(
  $$insert into public.glory_reactions (testimony_id, profile_id)
    values ('87000000-0000-4000-8000-00000000000a',
            '92000000-0000-4000-8000-00000000000b')
    on conflict do nothing$$,
  'a replayed offline tap is accepted');
select is(
  (select glory_count from public.testimony_feed
    where id = '87000000-0000-4000-8000-00000000000a'),
  1, 'and does not double-count');
select lives_ok(
  $$delete from public.glory_reactions
    where testimony_id = '87000000-0000-4000-8000-00000000000a'
      and profile_id = '92000000-0000-4000-8000-00000000000b'$$,
  'taking the reaction back');
select is(
  (select glory_count from public.testimony_feed
    where id = '87000000-0000-4000-8000-00000000000a'),
  0, 'returns the count to zero');

-- The two-step commitment moves a member between the two prayer counts.
select lives_ok(
  $$insert into public.prayer_intercessions (prayer_id, profile_id)
    values ('86000000-0000-4000-8000-00000000000b',
            '92000000-0000-4000-8000-00000000000b')$$,
  '"I will pray"');
select results_eq(
  $$select praying_count, prayed_count from public.prayer_feed
    where id = '86000000-0000-4000-8000-00000000000b'$$,
  $$values (1, 0)$$,
  'puts them in the praying count and nowhere else');
select lives_ok(
  $$update public.prayer_intercessions set state = 'prayed'
    where prayer_id = '86000000-0000-4000-8000-00000000000b'
      and profile_id = '92000000-0000-4000-8000-00000000000b'$$,
  '"I prayed"');
select results_eq(
  $$select praying_count, prayed_count from public.prayer_feed
    where id = '86000000-0000-4000-8000-00000000000b'$$,
  $$values (0, 1)$$,
  'moves them across, rather than counting them twice');
select lives_ok(
  $$delete from public.prayer_intercessions
    where prayer_id = '86000000-0000-4000-8000-00000000000b'
      and profile_id = '92000000-0000-4000-8000-00000000000b'$$,
  'withdrawing a fulfilled commitment');
select results_eq(
  $$select praying_count, prayed_count from public.prayer_feed
    where id = '86000000-0000-4000-8000-00000000000b'$$,
  $$values (0, 0)$$,
  'decrements the count it actually belonged to');

select * from finish();
rollback;
