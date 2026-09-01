-- W4.1 slice 2: the bookshelf, attempted as real clients (docs/spec/14, `02`, `21` §4).
--
-- THE ASSERTION THIS FILE EXISTS FOR is `21` §4's own line, "member INSERT into
-- entitlements", which is `02`'s "paid state is never client-writable" read as an attack.
-- It is asserted twice on purpose, at both layers, because they fail differently and only
-- one of them is visible: the GRANT refuses with 42501 before RLS is consulted, and the
-- absence of any write POLICY is what would refuse it if a grant were ever widened. A test
-- that only proved the first would go green the day somebody added a policy "for the
-- dashboard" and left the grant alone.
--
-- The rest is the boundary around two tables full of strangers' email addresses
-- (`payhip_events`, `unmatched_purchases`), the entitlement gate on the private bucket, and
-- the four departures from `02` that this slice took deliberately.
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind; every privileged block
-- pairs it with `set local request.jwt.claims to '{}'`.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The privilege assertions below ask the catalogue.
--
-- TRAP (see 036/050): counts are scoped to THIS FILE'S OWN rows. A bucket-wide or
-- table-wide count passes on an empty database and fails the moment a seed adds one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- ===========================================================================
-- 0. Fixtures: an admin, an owner, a stranger, and three books.
-- ===========================================================================

\set glasgow '00000000-0000-4000-8000-000000000001'

\set admin    '96000000-0000-4000-8000-00000000000a'
\set owner    '96000000-0000-4000-8000-00000000000b'
\set stranger '96000000-0000-4000-8000-00000000000c'

\set sold     '96000000-0000-4000-8000-0000000000b1'
\set withdrawn '96000000-0000-4000-8000-0000000000b2'
\set unsold   '96000000-0000-4000-8000-0000000000b3'

insert into auth.users (id, email) values
  (:'admin',    'shelf-admin@test.local'),
  (:'owner',    'shelf-owner@test.local'),
  (:'stranger', 'shelf-stranger@test.local');

insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  (:'admin', 'shelf-admin@test.local', 'Shelf Admin', :'glasgow', 'admin', now(), now()),
  (:'owner', 'shelf-owner@test.local', 'Shelf Owner', :'glasgow', 'member', now(), now()),
  (:'stranger', 'shelf-stranger@test.local', 'Shelf Stranger', :'glasgow', 'member',
   now(), now());

-- Three shelf states: on sale, withdrawn from sale but owned, and never published.
insert into public.books
  (id, title, author, format, price_minor, price_currency, payhip_url, payhip_product_id,
   published_at)
values
  (:'sold', 'Grace Unmeasured', 'O. Ademiluka', 'pdf', 899, 'GBP',
   'https://payhip.com/b/shelf1', 'shelf-product-1', now()),
  (:'withdrawn', 'Out of Print', 'O. Ademiluka', 'epub', 1299, 'GBP',
   'https://payhip.com/b/shelf2', 'shelf-product-2', null),
  (:'unsold', 'Not Yet Announced', 'O. Ademiluka', 'pdf', 500, 'GBP',
   'https://payhip.com/b/shelf3', 'shelf-product-3', null);

-- The owner owns both the published one and the withdrawn one. The withdrawn one is the
-- interesting fixture: unpublishing a title must not empty somebody's Library.
insert into public.entitlements (profile_id, book_id, source, source_ref) values
  (:'owner', :'sold', 'payhip', 'shelf-txn-1'),
  (:'owner', :'withdrawn', 'payhip', 'shelf-txn-2');

-- ===========================================================================
-- 1. Paid state is never client-writable (`02` §Invariants, `21` §4).
-- ===========================================================================
-- Both layers, because they fail differently. See the header.

select ok(
  not has_table_privilege('authenticated', 'public.entitlements', 'insert'),
  'a member holds no INSERT on entitlements: the grant refuses before RLS is consulted, and a member who could write this table would be handing themselves the church''s books');
select ok(
  not has_table_privilege('authenticated', 'public.entitlements', 'update'),
  'nor UPDATE: clearing revoked_at is how a refunded book would come back');
select ok(
  not has_table_privilege('authenticated', 'public.entitlements', 'delete'),
  'nor DELETE');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'entitlements'
      and cmd <> 'SELECT'),
  0,
  'and entitlements carries no write POLICY of any kind, so widening the grant alone would still refuse');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select throws_ok(
  $$insert into public.entitlements (profile_id, book_id, source)
    values ('96000000-0000-4000-8000-00000000000b',
            '96000000-0000-4000-8000-0000000000b3', 'gift')$$,
  '42501',
  null,
  'a member granting themselves a book they never bought is refused');

-- The catalogue DOES grant insert and update to `authenticated`, because every human here is
-- the same Postgres role and the policy is what narrows it to admins. So the refusal is a
-- silent zero-row filter rather than a 42501, which is exactly why it is asserted.
select throws_ok(
  $$insert into public.books
      (title, author, format, price_minor, price_currency, payhip_url, payhip_product_id)
    values ('Free Money', 'Nobody', 'pdf', 1, 'GBP', 'https://payhip.com/b/x', 'shelf-rogue')$$,
  '42501',
  null,
  'a member cannot add a book: the INSERT policy is admins only, and RLS raises on a WITH CHECK it cannot satisfy');

update public.books set price_minor = 1 where id = '96000000-0000-4000-8000-0000000000b1';
select is(
  (select price_minor from public.books where id = :'sold'),
  899,
  'and a member repricing a book changes nothing: the UPDATE policy filters it to zero rows, silently, which is the failure mode worth a test');

-- ===========================================================================
-- 2. What each caller sees.
-- ===========================================================================

select is(
  (select count(*)::int from public.entitlements),
  2,
  'the owner sees their own two entitlements');

select is(
  (select count(*)::int from public.books
    where id in (:'sold', :'withdrawn', :'unsold')),
  2,
  'and two of this file''s three books: the one on sale, plus the withdrawn one they own');

select ok(
  exists (select 1 from public.books where id = :'withdrawn'),
  'THE WITHDRAWN BOOK IS THE POINT: unpublishing a title never takes it out of the Library of somebody who paid for it');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select is(
  (select count(*)::int from public.entitlements),
  0,
  'a stranger sees none of the owner''s entitlements');
select is(
  (select count(*)::int from public.books
    where id in (:'sold', :'withdrawn', :'unsold')),
  1,
  'and only the book that is actually on sale');

reset role;
set local request.jwt.claims to '{}';
set local role anon;

select is(
  (select count(*)::int from public.books
    where id in (:'sold', :'withdrawn', :'unsold')),
  1,
  'a guest browses the store without an account (docs/spec/14 §Permissions), and sees only what is on sale');
select ok(
  not has_table_privilege('anon', 'public.entitlements', 'select'),
  'a guest holds no grant on entitlements at all: a SELECT that can only ever return zero rows is surface for nothing');

reset role;
set local request.jwt.claims to '{}';

-- ===========================================================================
-- 3. The two tables full of other people's email addresses.
-- ===========================================================================
-- `02` matrix row 60: service-role only, FORCE RLS with ZERO policies. The negative is the
-- assertion, because the failure is silent: a policy added here would not break anything,
-- it would just start handing out addresses.

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename in ('payhip_events', 'unmatched_purchases')),
  0,
  'payhip_events and unmatched_purchases carry no policy at all: FORCE RLS with zero policies is the boundary');

select ok(
  not has_table_privilege('authenticated', 'public.payhip_events', 'select'),
  'a member cannot read the raw webhook inbox (buyer email, buyer IP)');
select ok(
  not has_table_privilege('anon', 'public.payhip_events', 'select'),
  'nor a guest');
select ok(
  not has_table_privilege('authenticated', 'public.unmatched_purchases', 'select'),
  'a member cannot read the unmatched queue, which is a list of strangers'' addresses');
select ok(
  not has_table_privilege('anon', 'public.unmatched_purchases', 'select'),
  'nor a guest');

-- The service role by NAME on all five, never by inheritance (20260831140000). `048`
-- asserts this schema-wide; it is repeated here because these five are the tables the
-- Payhip job and the website-shaped writers will actually use.
select ok(
  has_table_privilege('service_role', 'public.books', 'insert')
  and has_table_privilege('service_role', 'public.entitlements', 'insert')
  and has_table_privilege('service_role', 'public.reading_state', 'insert')
  and has_table_privilege('service_role', 'public.payhip_events', 'insert')
  and has_table_privilege('service_role', 'public.unmatched_purchases', 'insert'),
  'every one of the five names service_role in its own migration: an ambient grant is not a grant this repo owns');

-- ===========================================================================
-- 4. Identity is the server's on reading_state (the W3.1 slice 4 rule).
-- ===========================================================================

select ok(
  not has_column_privilege('authenticated', 'public.reading_state', 'profile_id', 'insert'),
  'a client cannot even NAME profile_id on an insert: the column is outside the grant, so a forgery is refused before RLS is consulted');
select ok(
  has_column_privilege('authenticated', 'public.reading_state', 'book_id', 'insert')
  and has_column_privilege('authenticated', 'public.reading_state', 'location', 'insert'),
  'the two columns a reader actually writes are granted');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select lives_ok(
  $$insert into public.reading_state (book_id, location)
    values ('96000000-0000-4000-8000-0000000000b1', 'epubcfi(/6/4!/4/2/2)')$$,
  'a reader saves their place without saying who they are');

select is(
  (select profile_id from public.reading_state where book_id = :'sold'),
  :'owner'::uuid,
  'and the server filled identity in from the session');

select throws_ok(
  $$insert into public.reading_state (profile_id, book_id, location)
    values ('96000000-0000-4000-8000-00000000000c',
            '96000000-0000-4000-8000-0000000000b2', 'page-1')$$,
  '42501',
  null,
  'naming somebody else''s profile_id is 42501, not a silent overwrite');

reset role;
set local request.jwt.claims to '{}';

-- ===========================================================================
-- 5. The buckets: two postures, and the difference is the OBJECT.
-- ===========================================================================

select is(
  (select public from storage.buckets where id = 'book-files'),
  false,
  'book-files is PRIVATE: it holds the asset somebody paid for');
select is(
  (select public from storage.buckets where id = 'book-covers'),
  true,
  'book-covers is PUBLIC-read: it holds the advertisement for it, on every card in a guest-first grid');
select is(
  (select allowed_mime_types from storage.buckets where id = 'book-files'),
  array['application/pdf', 'application/epub+zip'],
  'book-files accepts only the two formats READER can open');
select is(
  (select file_size_limit from storage.buckets where id = 'book-files'),
  104857600::bigint,
  'book-files caps a book at 100 MiB, under the local stack''s 200 MiB ceiling');

-- A member never writes either bucket, which is what makes the aal2 claim safe here where
-- it was ruled out on content tables.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('book-files', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf', 'v-book-x')$$,
  '42501',
  null,
  'a member cannot shelve a book file');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('book-files', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf', 'v-book-x')$$,
  '42501',
  null,
  'nor an admin whose session never cleared the second factor');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('book-files', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf', 'v-book-1')$$,
  'an admin at aal2 shelves the file');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('book-covers', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp', 'v-cover-1')$$,
  'and hangs the cover');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('book-files', 'grace-unmeasured-final-v2.pdf', 'v-book-2')$$,
  '42501',
  null,
  'a human-written filename is refused: names are machine-minted, because a filename is where a person''s name ends up in a URL');

update public.books set file_path = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf',
                        cover_path = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp'
  where id = :'sold';

reset role;
set local request.jwt.claims to '{}';

select is(
  (select file_path from public.books where id = :'sold'),
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf',
  'the book points at its file');

-- ===========================================================================
-- 6. "A book cannot point at a file that is not there".
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';

select throws_ok(
  $$update public.books set file_path = 'ffffffff-ffff-4fff-8fff-ffffffffffff.pdf'
     where id = '96000000-0000-4000-8000-0000000000b2'$$,
  '23514',
  null,
  'a dangling file_path is refused: a Read button that dies on open is worse than a book that says it is not ready');
select throws_ok(
  $$update public.books set cover_path = 'ffffffff-ffff-4fff-8fff-ffffffffffff.webp'
     where id = '96000000-0000-4000-8000-0000000000b2'$$,
  '23514',
  null,
  'and a dangling cover_path, where a designed placeholder belongs');

-- Storage refuses direct SQL deletes outright (storage.protect_delete(), a statement-level
-- trigger) unless this GUC is set, which is what the Storage API sets on its own delete
-- path. Setting it here emulates that path, so the thing left deciding is our RLS policy.
set local storage.allow_delete_query to 'true';

delete from storage.objects
  where bucket_id = 'book-files'
    and name = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'book-files'
      and name = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf'),
  1,
  'a file a book still points at is not deletable: the removal order is a mechanism, not a convention');

reset role;
set local request.jwt.claims to '{}';

-- ===========================================================================
-- 7. The mint permission IS the entitlement check.
-- ===========================================================================
-- `createSignedUrl()` only works for a caller the SELECT policy admits, so this is the
-- whole of `14`'s "signed URL per request after an entitlements check". Four callers.

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'book-files'
      and name = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf'),
  1,
  'the member who owns the book can mint a URL for its file');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'book-files'
      and name = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf'),
  0,
  'a member who does not own it cannot: the object row is simply not there for them');

reset role;
set local request.jwt.claims to '{}';
set local role anon;

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'book-files'),
  0,
  'and a guest cannot, unlike sermon-audio: a book is not guest content, and the 24h-TTL argument that fences the audio does not apply to something somebody paid for');

reset role;
set local request.jwt.claims to '{}';

-- A refund takes the file away, which is `14` §Revocation read at the storage layer.
update public.entitlements set revoked_at = now(), revoked_reason = 'refunded'
  where profile_id = :'owner' and book_id = :'sold';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'book-files'
      and name = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf'),
  0,
  'a REVOKED entitlement stops minting: the refunded book leaves the reader as well as the Library');
select is(
  (select count(*)::int from public.reading_state where book_id = :'sold'),
  1,
  'and the place they got to survives, so a re-purchase restores it (docs/spec/14, 12 months)');

reset role;
set local request.jwt.claims to '{}';

-- ===========================================================================
-- 8. The inbox counts an order and an event separately.
-- ===========================================================================
-- Payhip's refund webhook carries the ORIGINAL order id, so a single-column unique on
-- event_id would swallow every refund as a replay of its own sale. This is the departure
-- from `14`'s "unique event id" and the reason for it.

insert into public.payhip_events (event_id, event_type, payload) values
  ('order-1', 'paid', '{"id":"order-1","type":"paid"}'::jsonb);

select lives_ok(
  $$insert into public.payhip_events (event_id, event_type, payload)
    values ('order-1', 'refunded', '{"id":"order-1","type":"refunded"}'::jsonb)$$,
  'a refund for an order we already hold the sale of is a NEW event, not a replay');

select throws_ok(
  $$insert into public.payhip_events (event_id, event_type, payload)
    values ('order-1', 'paid', '{"id":"order-1","type":"paid"}'::jsonb)$$,
  '23505',
  null,
  'while the same event replayed is a no-op, which is what makes the receiver safe to retry');

select throws_ok(
  $$insert into public.unmatched_purchases (buyer_email, source_ref, payload)
    values ('Someone@Example.COM', 'order-9', '{}'::jsonb)$$,
  '23514',
  null,
  'an un-normalized address is refused at the column: the drain matches on equality, so a column that MIGHT be normalized is a match that might not happen');

-- ===========================================================================
-- 9. Retention reaches every new table (`20`, `21` §5).
-- ===========================================================================

insert into public.payhip_events (event_id, event_type, payload, processed_at) values
  ('order-2', 'paid',
   '{"id":"order-2","type":"paid","email":"buyer@example.com","ip_address":"1.2.3.4","price":"8.99","currency":"GBP","items":[],"date":"2026-01-01"}'::jsonb,
   now());

select lives_ok(
  $$select public.run_retention_purges()$$,
  'the purge runs with the new arms in it');

select is(
  (select array(select jsonb_object_keys(payload) order by 1)
     from public.payhip_events where event_id = 'order-2'),
  array['currency', 'date', 'id', 'items', 'price', 'type'],
  'a processed webhook body keeps exactly the six non-PII keys: the buyer''s email and IP are gone (`20`), and the order id and price stay because that is what a support question is answered from');
select ok(
  (select redacted_at is not null from public.payhip_events where event_id = 'order-2'),
  'and it says when that happened');
select ok(
  (select payload ? 'id' from public.payhip_events
    where event_id = 'order-1' and event_type = 'paid'),
  'an UNPROCESSED event is left alone: redaction follows processing, not the clock');

select ok(
  exists (select 1 from public.run_retention_purges() where item = 'broadcast_deliveries'),
  'broadcast_deliveries finally has a purge (`21` §5 has listed it since W3.5 and nothing built it)');
select ok(
  exists (select 1 from public.run_retention_purges() where item = 'unmatched_purchases')
  and exists (select 1 from public.run_retention_purges() where item = 'reading_state'),
  'and so do the unmatched queue and the reading places a revocation left behind');

select * from finish();
rollback;
