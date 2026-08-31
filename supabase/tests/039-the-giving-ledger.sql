-- Track P: `public.donations` (20260817120000), the website's giving ledger now that
-- production is a project of our own (ADR 0023).
--
-- This file does a job the CI fence-guard used to do and does it better. Until this
-- change, `donations` was protected by a grep over migrations that refused to let us
-- MENTION it, because it lived in someone else's project. Now it is ours, and what
-- needs protecting is no longer the name but the SHAPE: nineteen columns that another
-- repository's Stripe webhook inserts into, on its own release schedule, with no
-- compile step between the two. A grep cannot see a retyped column. This can.
--
-- So the column inventory below is exhaustive on purpose, the same reasoning as
-- 035's privilege inventory: the next column added to this table, or the next one
-- retyped or made NOT NULL, is a decision somebody makes with `Desktop/agbc` open,
-- rather than a discovery made when a donor has already been charged.
--
-- Four claims under test:
--
--   1. The cross-repo CONTRACT: exactly these nineteen columns, these types, this
--      nullability. Anything the website does not send stays nullable or defaulted.
--   2. IDEMPOTENCY works the way the website reads it: a replayed Stripe event hits
--      23505 and is treated as "already recorded", while the null-heavy sibling keys
--      do not collide with each other.
--   3. The LOCKDOWN: forced RLS, zero policies, and nothing at all held by anon or
--      authenticated. Issue #96's blanket grants over donor PII never exist here.
--   4. The FK TRAP from the old project is fixed: deleting an auth user nulls the
--      reference instead of refusing, and the giving record survives.
--   5. The SAME contract on `course_registrations`, the other table the website
--      writes, which never had a fence and until now had no shape assertion either.
--
-- No role switching anywhere in this file, deliberately: every privilege claim is
-- answered from the catalogue (has_table_privilege / has_any_column_privilege), so
-- 009's `reset role` trap (which leaves request.jwt.claims behind) has no way in.

begin;
create extension if not exists pgtap with schema extensions;
select plan(98);

-- ===========================================================================
-- 1. The contract: exactly these columns, these types, this nullability.
-- ===========================================================================

select columns_are('public', 'donations', array[
  'id', 'created_at', 'donor_name', 'email', 'amount', 'currency', 'frequency',
  'branch', 'stripe_session_id', 'stripe_subscription_id', 'stripe_invoice_id',
  'payment_status', 'gift_aid_eligible', 'donor_address', 'user_id', 'giving_type',
  'reference', 'stripe_payment_intent_id', 'source'
], 'donations carries exactly the nineteen columns Desktop/agbc''s types declare');

select col_type_is('public', 'donations', 'id', 'uuid',
  'id is uuid');
select col_type_is('public', 'donations', 'created_at', 'timestamp with time zone',
  'created_at is timestamptz (never a zone-less timestamp)');
select col_type_is('public', 'donations', 'donor_name', 'text',
  'donor_name is text');
select col_type_is('public', 'donations', 'email', 'text',
  'email is text');
select col_type_is('public', 'donations', 'amount', 'integer',
  'amount is integer: Stripe MINOR units, counted and never measured');
select col_type_is('public', 'donations', 'currency', 'text',
  'currency is text');
select col_type_is('public', 'donations', 'frequency', 'text',
  'frequency is text');
select col_type_is('public', 'donations', 'branch', 'text',
  'branch is text: a display name, not an FK to public.branches');
select col_type_is('public', 'donations', 'stripe_session_id', 'text',
  'stripe_session_id is text');
select col_type_is('public', 'donations', 'stripe_subscription_id', 'text',
  'stripe_subscription_id is text');
select col_type_is('public', 'donations', 'stripe_invoice_id', 'text',
  'stripe_invoice_id is text');
select col_type_is('public', 'donations', 'payment_status', 'text',
  'payment_status is text');
select col_type_is('public', 'donations', 'gift_aid_eligible', 'boolean',
  'gift_aid_eligible is boolean');
select col_type_is('public', 'donations', 'donor_address', 'text',
  'donor_address is text');
select col_type_is('public', 'donations', 'user_id', 'uuid',
  'user_id is uuid');
select col_type_is('public', 'donations', 'giving_type', 'text',
  'giving_type is text');
select col_type_is('public', 'donations', 'reference', 'text',
  'reference is text');
select col_type_is('public', 'donations', 'stripe_payment_intent_id', 'text',
  'stripe_payment_intent_id is text');
select col_type_is('public', 'donations', 'source', 'text',
  'source is text');

-- NOT NULL exactly where the website's Insert type marks a field required, plus the
-- two the database fills itself.
select col_not_null('public', 'donations', 'id', 'id is not null');
select col_not_null('public', 'donations', 'created_at', 'created_at is not null');
select col_not_null('public', 'donations', 'email', 'email is not null');
select col_not_null('public', 'donations', 'amount', 'amount is not null');
select col_not_null('public', 'donations', 'currency', 'currency is not null');
select col_not_null('public', 'donations', 'frequency', 'frequency is not null');
select col_not_null('public', 'donations', 'payment_status',
  'payment_status is not null (it has a default, so the website may omit it)');

-- Nullable everywhere else. This half of the contract is the one that breaks quietly:
-- the website sends none of these, so a column made NOT NULL here would fail every
-- insert on the live site while every test in THIS repo stayed green.
select col_is_null('public', 'donations', 'donor_name', 'donor_name is nullable');
select col_is_null('public', 'donations', 'branch', 'branch is nullable');
select col_is_null('public', 'donations', 'stripe_session_id',
  'stripe_session_id is nullable (recurring gifts have none)');
select col_is_null('public', 'donations', 'stripe_subscription_id',
  'stripe_subscription_id is nullable (one-time gifts have none)');
select col_is_null('public', 'donations', 'stripe_invoice_id',
  'stripe_invoice_id is nullable (one-time gifts have none)');
select col_is_null('public', 'donations', 'gift_aid_eligible',
  'gift_aid_eligible is nullable (the giving form does not collect it)');
select col_is_null('public', 'donations', 'donor_address',
  'donor_address is nullable (the giving form does not collect it)');
select col_is_null('public', 'donations', 'user_id',
  'user_id is nullable (nothing writes it, and erasure nulls it)');
select col_is_null('public', 'donations', 'giving_type', 'giving_type is nullable');
select col_is_null('public', 'donations', 'reference', 'reference is nullable');
select col_is_null('public', 'donations', 'stripe_payment_intent_id',
  'stripe_payment_intent_id is nullable');
select col_is_null('public', 'donations', 'source', 'source is nullable');

select col_is_pk('public', 'donations', 'id', 'id is the primary key');

select col_default_is('public', 'donations', 'payment_status', 'pending',
  'payment_status defaults to pending: a status-less row never reads as money received');

-- ===========================================================================
-- 2. Idempotency: the three keys the website reads 23505 off.
-- ===========================================================================

select col_is_unique('public', 'donations', 'stripe_session_id',
  'stripe_session_id is unique: one-time gifts dedupe on it');
select col_is_unique('public', 'donations', 'stripe_invoice_id',
  'stripe_invoice_id is unique: recurring charges dedupe on it');
select col_is_unique('public', 'donations', 'stripe_payment_intent_id',
  'stripe_payment_intent_id is unique');

-- The one that must NOT be unique, and the reason it is easy to get wrong: it sits in
-- the middle of three keys that are. A subscription emits one invoice a month, all
-- carrying the same subscription id, so a unique key here would refuse every renewal
-- after the first.
select is(
  (select count(*) from pg_index i
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    where i.indrelid = 'public.donations'::regclass
      and i.indisunique
      and a.attname = 'stripe_subscription_id'),
  0::bigint,
  'stripe_subscription_id is NOT unique: a monthly gift writes one row per invoice');

insert into public.donations
  (id, email, amount, currency, frequency, payment_status, stripe_session_id, source)
values
  ('d0000000-0000-4000-8000-00000000000a', 'giver-a@test.local', 2500, 'gbp',
   'one_time', 'paid', 'cs_test_giving_ledger_a', 'web');

select throws_ok(
  $$insert into public.donations
      (email, amount, currency, frequency, payment_status, stripe_session_id)
    values ('giver-a@test.local', 2500, 'gbp', 'one_time', 'paid',
            'cs_test_giving_ledger_a')$$,
  '23505', null,
  'a replayed checkout.session.completed raises 23505, which the website reads as "already recorded"');

insert into public.donations
  (id, email, amount, currency, frequency, payment_status, stripe_subscription_id,
   stripe_invoice_id, source)
values
  ('d0000000-0000-4000-8000-00000000000b', 'giver-b@test.local', 1000, 'gbp',
   'monthly', 'paid', 'sub_test_giving_ledger', 'in_test_giving_ledger_1', 'web');

select throws_ok(
  $$insert into public.donations
      (email, amount, currency, frequency, payment_status, stripe_subscription_id,
       stripe_invoice_id)
    values ('giver-b@test.local', 1000, 'gbp', 'monthly', 'paid',
            'sub_test_giving_ledger', 'in_test_giving_ledger_1')$$,
  '23505', null,
  'a replayed invoice.payment_succeeded raises 23505 on the invoice key');

select lives_ok(
  $$insert into public.donations
      (email, amount, currency, frequency, payment_status, stripe_subscription_id,
       stripe_invoice_id)
    values ('giver-b@test.local', 1000, 'gbp', 'monthly', 'paid',
            'sub_test_giving_ledger', 'in_test_giving_ledger_2')$$,
  'the same subscription may charge again: only the invoice key is unique');

-- Nulls are distinct, which is what makes three nullable unique keys workable at all:
-- every one-time row carries a null invoice id and every recurring row a null session
-- id, and neither collides with its own kind.
select lives_ok(
  $$insert into public.donations
      (email, amount, currency, frequency, payment_status, giving_type)
    values ('giver-c@test.local', 500, 'gbp', 'one_time', 'paid', 'General'),
           ('giver-d@test.local', 500, 'gbp', 'one_time', 'paid', 'General')$$,
  'two rows with every Stripe key null coexist (nulls are distinct)');

select throws_ok(
  $$insert into public.donations (email, amount, currency, frequency)
    values ('giver-e@test.local', -1, 'gbp', 'one_time')$$,
  '23514', null,
  'a negative amount is refused: the one arithmetic guard, and one Stripe cannot trip');

-- ===========================================================================
-- 3. The lockdown. Donor PII with no client road to it at all.
-- ===========================================================================

select is(
  (select relrowsecurity from pg_class where oid = 'public.donations'::regclass),
  true, 'donations has RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.donations'::regclass),
  true, 'donations has RLS FORCED (the owner is subject to it too)');

select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'donations'),
  0::bigint,
  'donations has ZERO policies: the only writer holds BYPASSRLS and no client reads it');

-- anon: nothing. On the old project this role held SELECT, INSERT, UPDATE, DELETE and
-- TRUNCATE over donor names, addresses and email, with only the absence of a policy in
-- the way (issue #96). Here there is no grant to widen.
select is(has_table_privilege('anon', 'public.donations', 'select'), false,
  'anon holds no SELECT on donations');
select is(has_any_column_privilege('anon', 'public.donations', 'insert'), false,
  'anon holds no INSERT on donations, not even one column');
select is(has_any_column_privilege('anon', 'public.donations', 'update'), false,
  'anon holds no UPDATE on donations, not even one column');
select is(has_table_privilege('anon', 'public.donations', 'delete'), false,
  'anon holds no DELETE on donations');
select is(has_table_privilege('anon', 'public.donations', 'truncate'), false,
  'anon holds no TRUNCATE on donations (#96''s blanket grant never exists here)');

-- authenticated: also nothing. A member is not a donor-record reader, and giving links
-- out of the app entirely (ADR 0004), so there is no surface to serve.
select is(has_table_privilege('authenticated', 'public.donations', 'select'), false,
  'authenticated holds no SELECT on donations');
select is(has_any_column_privilege('authenticated', 'public.donations', 'insert'), false,
  'authenticated holds no INSERT on donations');
select is(has_any_column_privilege('authenticated', 'public.donations', 'update'), false,
  'authenticated holds no UPDATE on donations');
select is(has_table_privilege('authenticated', 'public.donations', 'delete'), false,
  'authenticated holds no DELETE on donations');
select is(has_table_privilege('authenticated', 'public.donations', 'truncate'), false,
  'authenticated holds no TRUNCATE on donations');

-- service_role is the website's identity, and the only one with a road in.
select is(has_table_privilege('service_role', 'public.donations', 'insert'), true,
  'service_role may INSERT: this is the website''s Stripe webhook');
select is(has_table_privilege('service_role', 'public.donations', 'select'), true,
  'service_role may SELECT');

-- ===========================================================================
-- 4. The FK trap from the old project, fixed.
-- ===========================================================================

select is(
  (select confdeltype from pg_constraint
    where conrelid = 'public.donations'::regclass and contype = 'f'
      and conname = 'donations_user_id_fkey'),
  'n'::"char",
  'donations_user_id_fkey is ON DELETE SET NULL, never NO ACTION and never CASCADE');

select has_index('public', 'donations', 'donations_user_id_idx',
  'the FK column is indexed: ON DELETE SET NULL scans this table on every user deletion');

-- The trap, played out. On the old project this FK had no ON DELETE, four of twelve
-- rows pointed at live auth users, and `19` step 5 ("remove stale Grace Portal auth
-- users") was therefore refused by the database, with CASCADE sitting there looking
-- like the way through.
insert into auth.users (id, email)
values ('d9000000-0000-4000-8000-00000000000a', 'giving-erasure@test.local');

insert into public.donations
  (id, email, amount, currency, frequency, payment_status, user_id, stripe_session_id)
values
  ('d0000000-0000-4000-8000-00000000000e', 'giving-erasure@test.local', 5000, 'gbp',
   'one_time', 'paid', 'd9000000-0000-4000-8000-00000000000a',
   'cs_test_giving_ledger_erasure');

select lives_ok(
  $$delete from auth.users where id = 'd9000000-0000-4000-8000-00000000000a'$$,
  'deleting the auth user is permitted: the FK nulls instead of refusing');

select is(
  (select user_id from public.donations
    where id = 'd0000000-0000-4000-8000-00000000000e'),
  null::uuid,
  'the reference is nulled by the delete');

select is(
  (select amount from public.donations
    where id = 'd0000000-0000-4000-8000-00000000000e'),
  5000,
  'and the giving record itself survives the account that made it');

-- ===========================================================================
-- 5. The OTHER shared table, for the same reason.
-- ===========================================================================
--
-- `course_registrations` carries identical cross-repo risk and never had a fence at
-- all: ADR 0017 lowered it so the app and the website could share one table, and what
-- replaced the fence was a sentence in CLAUDE.md asking nobody to drop, rename or
-- retype the website's columns. 032 pins which of them a CLIENT may read, which is a
-- different question. These are the thirteen the website's own Insert type names
-- (Desktop/agbc/src/lib/server/database.types.ts, read 2026-08-17), asserted here so
-- both shared tables are guarded by the same mechanism.

select col_type_is('public', 'course_registrations', 'id', 'uuid', 'cr.id is uuid');
select col_type_is('public', 'course_registrations', 'created_at',
  'timestamp with time zone', 'cr.created_at is timestamptz');
select col_type_is('public', 'course_registrations', 'course', 'text',
  'cr.course is text (the website''s content slug)');
select col_type_is('public', 'course_registrations', 'format', 'text',
  'cr.format is text');
select col_type_is('public', 'course_registrations', 'full_name', 'text',
  'cr.full_name is text');
select col_type_is('public', 'course_registrations', 'email', 'text',
  'cr.email is text');
select col_type_is('public', 'course_registrations', 'city', 'text', 'cr.city is text');
select col_type_is('public', 'course_registrations', 'country', 'text',
  'cr.country is text');
select col_type_is('public', 'course_registrations', 'branch', 'text',
  'cr.branch is text (a display name, never used for scoping)');
select col_type_is('public', 'course_registrations', 'amount', 'integer',
  'cr.amount is integer (Stripe minor units)');
select col_type_is('public', 'course_registrations', 'currency', 'text',
  'cr.currency is text');
select col_type_is('public', 'course_registrations', 'payment_status', 'text',
  'cr.payment_status is text');
select col_type_is('public', 'course_registrations', 'stripe_session_id', 'text',
  'cr.stripe_session_id is text');

-- Required on the website's Insert, so NOT NULL here.
select col_not_null('public', 'course_registrations', 'course', 'cr.course is not null');
select col_not_null('public', 'course_registrations', 'format', 'cr.format is not null');
select col_not_null('public', 'course_registrations', 'full_name',
  'cr.full_name is not null');
select col_not_null('public', 'course_registrations', 'email', 'cr.email is not null');
select col_not_null('public', 'course_registrations', 'city', 'cr.city is not null');
select col_not_null('public', 'course_registrations', 'country', 'cr.country is not null');
select col_not_null('public', 'course_registrations', 'amount', 'cr.amount is not null');

-- Omitted by the website's insert, so each of these must stay nullable or defaulted.
-- This is the half that breaks silently on the live site while this repo stays green.
select col_is_null('public', 'course_registrations', 'branch', 'cr.branch is nullable');
select col_is_null('public', 'course_registrations', 'stripe_session_id',
  'cr.stripe_session_id is nullable');
select col_has_default('public', 'course_registrations', 'currency',
  'cr.currency has a default, so an insert may omit it');
select col_has_default('public', 'course_registrations', 'payment_status',
  'cr.payment_status has a default, so an insert may omit it');
select col_has_default('public', 'course_registrations', 'id', 'cr.id has a default');
select col_has_default('public', 'course_registrations', 'created_at',
  'cr.created_at has a default');

-- #164 added these two, and they belong in exactly this half. The website's insert has never
-- heard of them, so a NOT NULL here would refuse every live registration, charge the donor,
-- and leave every test in this repo green while it happened.
select col_is_null('public', 'course_registrations', 'set_aside_at',
  'cr.set_aside_at is nullable (#164): the website never names it');
select col_is_null('public', 'course_registrations', 'set_aside_by',
  'cr.set_aside_by is nullable (#164): the website never names it');

select * from finish();
rollback;
