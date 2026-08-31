-- The Academy domain (W2.9 slice 2; migrations 20260809200000-204000): the catalog,
-- interest, proven addresses, and the ONE registrations table shared with the live
-- website (ADR 0017).
--
-- What this file is really about is a stranger's payment record. course_registrations
-- rows carry somebody's full_name, email, city, country and what they paid, and three
-- walls stand around them, each asserted here because each fails differently:
--
--   1. GRANTS choose columns (RLS never does): the whole column matrix is asserted
--      exactly, so the next column added to this table is a decision, not an oversight
--      (CLAUDE.md trap 3, issue #96).
--   2. POLICIES choose rows: a member sees their own and their proven addresses'; a
--      leader sees linked-or-branched rows in their branch and NOTHING unlinked
--      (ADR 0017 decision 5, Ayo's call: asserted so a loosening has to be deliberate).
--   3. TRIGGERS hold for every writer, the website's service key included: terminal
--      cancellation, the member's cancel-only transition, the double-booking partial
--      unique, and the audit row on every change of owner.
--
-- The test the ADR names outright: a member ATTEMPTING TO CLAIM a registration that is
-- not theirs, not merely reading one that is.
--
-- Privileges are asserted with has_function_privilege and never by attempting a call:
-- calling a function you lack EXECUTE on takes down this local backend.

begin;
create extension if not exists pgtap with schema extensions;
select plan(70);

\set glasgow '00000000-0000-4000-8000-000000000001'
\set emmen '00000000-0000-4000-8000-000000000003'

\set member1 'a0000000-0000-4000-8000-0000000032a1'
\set member2 'a0000000-0000-4000-8000-0000000032a2'
\set leader_gla 'a0000000-0000-4000-8000-0000000032a3'
\set leader_emm 'a0000000-0000-4000-8000-0000000032a4'
\set admin 'a0000000-0000-4000-8000-0000000032a5'

\set regA 'c0320000-0000-4000-8000-000000000001'
\set regB 'c0320000-0000-4000-8000-000000000002'
\set regC 'c0320000-0000-4000-8000-000000000003'
\set regD 'c0320000-0000-4000-8000-000000000004'
\set regE 'c0320000-0000-4000-8000-000000000005'
\set regF 'c0320000-0000-4000-8000-000000000006'
-- ...007 is NOT free: section 8's double-booking fixture spells it inline rather than
-- naming it here, so the next id to hand out is 008.
\set regG 'c0320000-0000-4000-8000-000000000008'
\set regH 'c0320000-0000-4000-8000-000000000009'

insert into auth.users (id, email) values
  (:'member1', 't032-m1@test.local'),
  (:'member2', 't032-m2@test.local'),
  (:'leader_gla', 't032-lg@test.local'),
  (:'leader_emm', 't032-le@test.local'),
  (:'admin', 't032-admin@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  (:'member1', 't032-m1@test.local', 'T032 Member One', :'glasgow', 'member', now()),
  (:'member2', 't032-m2@test.local', 'T032 Member Two', :'glasgow', 'member', now()),
  (:'leader_gla', 't032-lg@test.local', 'T032 Leader Glasgow', :'glasgow', 'leader', now()),
  (:'leader_emm', 't032-le@test.local', 'T032 Leader Emmen', :'emmen', 'leader', now()),
  (:'admin', 't032-admin@test.local', 'T032 Admin', :'glasgow', 'admin', now());

-- --- 1. every new table forces row level security ---------------------------------------------

select ok(
  (select bool_and(relforcerowsecurity) from pg_class
    where oid in ('public.courses'::regclass, 'public.course_fees_regional'::regclass,
                  'public.course_interest'::regclass, 'public.profile_emails'::regclass,
                  'public.course_registrations'::regclass,
                  'public.course_handoff_tokens'::regclass)),
  'all six Academy tables force row level security');

-- --- 2. the grant matrix, exactly --------------------------------------------------------------

-- The full SELECT column list, sorted. linked_by and set_aside_by are DELIBERATELY absent
-- (which staff member made the call is internal, the moderated_by reasoning); adding a
-- column to this table must come back here and decide. This assertion is exactly what
-- forced #164's set_aside_at to be a decision rather than an oversight: the migration
-- turned this red, which is the guard working.
select is(
  (select array_agg(distinct column_name::text order by column_name::text)
     from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'course_registrations'
      and grantee = 'authenticated' and privilege_type = 'SELECT'),
  array['amount','branch','branch_id','city','country','course','course_id','created_at',
        'currency','email','format','full_name','id','link_method','linked_at','notes',
        'payment_status','profile_id','set_aside_at','source','status','stripe_session_id'],
  'members read exactly the named registration columns; neither linked_by nor set_aside_by is among them');

select is(
  (select array_agg(distinct column_name::text order by column_name::text)
     from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'course_registrations'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  array['status'],
  'status is the only registration column any client may write: the cancel transition');

select is(
  (select count(*)::int from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'course_registrations'
      and grantee = 'anon'),
  0, 'a guest holds not one registration column');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'course_registrations'
      and grantee in ('anon', 'authenticated')),
  0, 'and no client role holds a whole-table grant there: INSERT and DELETE exist for nobody');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('courses', 'course_fees_regional')
      and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'),
  0, 'the catalog is read-only to every client');

select is(
  (select array_agg(distinct privilege_type::text order by privilege_type::text)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'course_interest'
      and grantee = 'authenticated'),
  array['DELETE','INSERT','SELECT'],
  'interest is a member''s to record, read, and withdraw; never to edit');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'course_interest' and grantee = 'anon'),
  0, 'a guest cannot register interest: Notify me is the gate''s job');

select is(
  (select array_agg(distinct privilege_type::text order by privilege_type::text)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'profile_emails'
      and grantee = 'authenticated'),
  array['DELETE','SELECT'],
  'proven addresses are readable and removable by their owner, and writable by no client at all');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'profile_emails' and grantee = 'anon'),
  0, 'guests hold nothing on proven addresses');

select is(
  (select count(*)::int
     from (
       select grantee from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = 'course_handoff_tokens'
          and grantee in ('anon', 'authenticated', 'service_role')
       union all
       select grantee from information_schema.role_column_grants
        where table_schema = 'public'
          and table_name = 'course_handoff_tokens'
          and grantee in ('anon', 'authenticated', 'service_role')
     ) g),
  0, 'handoff tokens grant nothing to any API role: the RPCs are the only doors');

-- --- 3. the catalog: public reads, converted money ---------------------------------------------

set local role anon;

select cmp_ok(
  (select count(*)::int from public.courses), '>=', 3,
  'a guest browses the whole pathway, upcoming levels included');

select cmp_ok(
  (select count(*)::int from public.course_fees_regional), '>=', 2,
  'and sees the regional fees');

select throws_ok(
  $$insert into public.courses (slug, name, level, level_name, summary)
    values ('rogue', 'Rogue', '09', 'Rogue', '{}'::jsonb)$$,
  '42501', null,
  'but writes nothing');

reset role;

-- The conversion script's output, asserted where it matters: symbol majors became
-- minor units + ISO codes (docs/spec/02; £25 -> 2500 GBP, £40 -> 4000 GBP, and the
-- Nigeria overrides 5000 -> 500000 NGN, 8000 -> 800000 NGN).
select is(
  (select fee_minor::text || ' ' || fee_currency from public.courses
    where slug = 'grace-reset'),
  '2500 GBP',
  'Grace Reset costs 2500 minor units of GBP, never "£25"');

select is(
  (select fee_minor::text || ' ' || fee_currency from public.courses
    where slug = 'grace-masterclass'),
  '4000 GBP',
  'Grace Masterclass costs 4000 minor units of GBP');

select is(
  (select prereq_slug from public.courses where slug = 'grace-masterclass'),
  'grace-reset',
  'and requires Grace Reset first (docs/spec/13)');

select is(
  (select f.fee_minor::text || ' ' || f.currency
     from public.course_fees_regional f
     join public.courses c on c.id = f.course_id
    where c.slug = 'grace-reset' and f.country_code = 'NG'),
  '500000 NGN',
  'the Nigeria override for Reset is 500000 kobo');

select is(
  (select f.fee_minor::text || ' ' || f.currency
     from public.course_fees_regional f
     join public.courses c on c.id = f.course_id
    where c.slug = 'grace-masterclass' and f.country_code = 'NG'),
  '800000 NGN',
  'and for Masterclass 800000 kobo');

select ok(
  (select upcoming and fee_minor is null from public.courses where slug = 'further'),
  'the upcoming level exists as a row with no fee: Notify me needs something to point at');

-- --- 4. interest: identity forced, once per course, read along branch lines --------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

-- The forged profile_id in VALUES is member2's; the guard makes the row member1's.
insert into public.course_interest (course_id, profile_id)
values ((select id from public.courses where slug = 'further'), :'member2');

select is(
  (select profile_id from public.course_interest
    where course_id = (select id from public.courses where slug = 'further')),
  :'member1'::uuid,
  'interest identity cannot be forged: the row belongs to the caller');

select throws_ok(
  format($$insert into public.course_interest (course_id, profile_id)
           values ((select id from public.courses where slug = 'further'), %L)$$, :'member1'),
  '23505', null,
  'Notify me is a fact, not a counter: once per member per course');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*)::int from public.course_interest),
  1, 'a leader sees interest from their own branch''s members');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a4", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000003"}';

select is(
  (select count(*)::int from public.course_interest),
  0, 'and none from anybody else''s');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a5", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*)::int from public.course_interest),
  1, 'an admin sees it all');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

delete from public.course_interest;

select is(
  (select count(*)::int from public.course_interest),
  0, 'changing your mind is a delete, and it is yours to make');

reset role;
select set_config('request.jwt.claims', '', true);

-- --- 5. registrations arrive as the website writes them ----------------------------------------

-- Trusted inserts on a direct connection: exactly how the website's service key and
-- the prod rows behave. regA/regB carry only the website's columns.
insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency, payment_status)
values
  (:'regA', 'grace-reset', 'Intensive (2 weeks)', 'Stranger Guest',
   't032-stranger@test.local', 'Lagos', 'Nigeria', 500000, 'ngn', 'paid'),
  (:'regB', 'grace-reset', 'Part-time (4 weeks)', 'Member One As Guest',
   'T032-M1@test.local', 'Glasgow', 'Scotland, UK', 2500, 'gbp', 'paid');

insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency, payment_status,
   profile_id, source, link_method, linked_by, linked_at)
values
  (:'regC', 'grace-reset', 'Part-time (4 weeks)', 'T032 Member Two',
   't032-m2@test.local', 'Glasgow', 'Scotland, UK', 2500, 'gbp', 'paid',
   :'member2', 'app', 'handoff', :'member2', now());

insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency, payment_status,
   branch_id)
values
  (:'regD', 'grace-masterclass', 'Part-time (6 weeks)', 'Branched Guest',
   't032-branched@test.local', 'Emmen', 'Netherlands', 4000, 'gbp', 'paid', :'emmen');

insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency, payment_status)
values
  -- STORED MESSY ON PURPOSE, and on THIS side of the match rather than on the proof side.
  -- The proof side is now constrained to be normalized (`profile_emails_normalized`,
  -- 20260831150000), which is what lets the dashboard read it back with a plain equality. This
  -- column is the website's: `02`'s contract forbids us constraining it, so whitespace and
  -- capitals are a live possibility here and nowhere else. It is therefore the honest half to
  -- make messy, and the claim under test is unchanged: the match normalizes BOTH sides.
  (:'regE', 'grace-masterclass', 'Intensive (3 weeks)', 'Second Address',
   '  T032-Extra@test.local  ', 'Berlin', 'Germany', 4000, 'gbp', 'paid'),
  (:'regF', 'a-course-nobody-knows', 'Intensive', 'Unknown Slug',
   't032-unknown@test.local', 'Nowhere', 'Nowhere', 100, 'gbp', 'paid');

select is(
  (select course_id from public.course_registrations where id = :'regA'),
  (select id from public.courses where slug = 'grace-reset'),
  'a website row''s course slug resolves to course_id at birth');

select ok(
  (select course_id is null from public.course_registrations where id = :'regF'),
  'a slug the catalog does not know stays unresolved rather than failing the website''s write');

-- --- 6. who sees a payment record --------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(id)::int from public.course_registrations),
  1, 'a member sees exactly the registrations that are theirs');

select is(
  (select id from public.course_registrations limit 1),
  :'regB'::uuid,
  'and theirs means the sign-in email match, stray capitals notwithstanding');

select is(
  (select count(id)::int from public.course_registrations
    where id in (:'regA', :'regC', :'regD', :'regE')),
  0, 'a stranger''s purchase, another member''s row, and unproven addresses are invisible');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a2", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(id)::int from public.course_registrations where id = :'regC'),
  1, 'a linked member sees their registration by the link alone');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(id)::int from public.course_registrations where id = :'regC'),
  1, 'a leader sees a LINKED registration whose member is in their branch');

-- The decision Ayo made (ADR 0017 decision 5), held still: regB's email even belongs
-- to a Glasgow member, and the leader still sees nothing until somebody links it.
select is(
  (select count(id)::int from public.course_registrations
    where id in (:'regA', :'regB', :'regE', :'regF')),
  0, 'an UNLINKED website registration is invisible to a branch leader, whoever''s email it carries');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a4", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000003"}';

select is(
  (select count(id)::int from public.course_registrations where id = :'regD'),
  1, 'a row GIVEN a branch falls under the normal in-branch rule');

select is(
  (select count(id)::int from public.course_registrations where id = :'regC'),
  0, 'and another branch''s linked rows stay another branch''s');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a5", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(id)::int from public.course_registrations
    where id in (:'regA', :'regB', :'regC', :'regD', :'regE', :'regF')),
  6, 'admins see every registration, the unlinked included: somebody has to be able to link them');

reset role;
select set_config('request.jwt.claims', '', true);

set local role anon;

select throws_ok(
  $$select id from public.course_registrations$$,
  '42501', null,
  'a guest cannot read payment records at all');

reset role;

-- --- 7. the claim attempt: a member reaches for a stranger's registration ----------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

-- The ADR's named test. The wall is the GRANT: profile_id is not a column any client
-- may write, so pointing a stranger's registration at yourself dies before RLS or
-- triggers are even consulted.
select throws_ok(
  format($$update public.course_registrations set profile_id = %L where id = %L$$,
         :'member1', :'regA'),
  '42501', null,
  'a member cannot claim a stranger''s registration: profile_id is unwritable from any client');

select throws_ok(
  format($$update public.course_registrations set linked_at = now() where id = %L$$, :'regB'),
  '42501', null,
  'the link trio is unwritable too, even on a row the member can see');

select throws_ok(
  format($$update public.course_registrations set notes = 'mine now' where id = %L$$, :'regB'),
  '42501', null,
  'and so is every other column: status is the only writable one');

-- Cancelling a stranger's row: the policy simply matches nothing.
update public.course_registrations set status = 'cancelled' where id = :'regA';

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select status from public.course_registrations where id = :'regA'),
  'pending'::public.course_registration_status,
  'a cancel aimed at a stranger''s registration touches nothing');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

update public.course_registrations set status = 'cancelled' where id = :'regB';

select is(
  (select status from public.course_registrations where id = :'regB'),
  'cancelled'::public.course_registration_status,
  'a member cancels their own registration: the one write the app has (docs/spec/13)');

select throws_ok(
  format($$update public.course_registrations set status = 'pending' where id = %L$$, :'regB'),
  '23514', null,
  'and there is no un-cancel: re-registering is a new row');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a2", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  format($$update public.course_registrations set status = 'confirmed' where id = %L$$, :'regC'),
  '23514', null,
  'confirming a place is an enrolment decision, never the member''s own hand');

reset role;
select set_config('request.jwt.claims', '', true);

-- --- 8. the double-booking wall holds for the website's own writer -----------------------------

select throws_ok(
  format($$insert into public.course_registrations
             (course, format, full_name, email, city, country, amount, currency,
              payment_status, profile_id)
           values ('grace-reset', 'Intensive (2 weeks)', 'T032 Member Two',
                   't032-m2@test.local', 'Glasgow', 'Scotland, UK', 2500, 'gbp',
                   'paid', %L)$$, :'member2'),
  '23505', null,
  'a second live registration for the same member and course is refused, service key or not');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a2", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

update public.course_registrations set status = 'cancelled' where id = :'regC';

reset role;
select set_config('request.jwt.claims', '', true);

select lives_ok(
  format($$insert into public.course_registrations
             (id, course, format, full_name, email, city, country, amount, currency,
              payment_status, profile_id)
           values ('c0320000-0000-4000-8000-000000000007', 'grace-reset',
                   'Intensive (2 weeks)', 'T032 Member Two', 't032-m2@test.local',
                   'Glasgow', 'Scotland, UK', 2500, 'gbp', 'paid', %L)$$, :'member2'),
  'a cancelled registration frees the slot: registering again is a new row');

update public.course_registrations set status = 'confirmed'
  where id = 'c0320000-0000-4000-8000-000000000007';

select is(
  (select status from public.course_registrations
    where id = 'c0320000-0000-4000-8000-000000000007'),
  'confirmed'::public.course_registration_status,
  'a trusted writer may confirm a place: that is the enrolment decision');

select throws_ok(
  format($$update public.course_registrations set status = 'confirmed' where id = %L$$, :'regB'),
  '23514', null,
  'but cancelled is terminal for EVERY writer, the service key included');

-- The insert wall behind the missing grant: a request carrying a user identity is
-- refused by the trigger even if some future grant would let it through.
select set_config('request.jwt.claims',
  '{"sub": "a0000000-0000-4000-8000-0000000032a1"}', true);

select throws_ok(
  $$insert into public.course_registrations
      (course, format, full_name, email, city, country, amount, currency)
    values ('grace-reset', 'x', 'x', 'x@test.local', 'x', 'x', 1, 'gbp')$$,
  '42501', null,
  'the app never writes a registration, by trigger as well as by grant (ADR 0017)');

select set_config('request.jwt.claims', '', true);

-- --- 9. linking is audited, on every path ------------------------------------------------------

select is(
  (select count(*)::int from public.privileged_actions
    where action = 'registration_linked'
      and (after ->> 'registration_id')::uuid = :'regC'),
  0, 'a row BORN linked (the handoff) writes no audit row: the member''s own act');

update public.course_registrations
  set profile_id = :'member2', link_method = 'leader',
      linked_by = :'admin', linked_at = now()
  where id = :'regD';

select ok(
  exists (
    select 1 from public.privileged_actions
    where action = 'registration_linked'
      and target_id = :'member2'
      and (after ->> 'registration_id')::uuid = :'regD'
      and after ->> 'link_method' = 'leader'
  ),
  'linking an existing row writes privileged_actions by TRIGGER, whoever the caller was');

-- --- 10. proven addresses: the set the email match reads ---------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  format($$insert into public.profile_emails (profile_id, email)
           values (%L, 't032-extra@test.local')$$, :'member1'),
  '42501', null,
  'a member cannot write their own proof: the insert IS the claim being proven');

select is(
  (select count(id)::int from public.course_registrations where id = :'regE'),
  0, 'before the claim, a registration by the second address is invisible');

reset role;
select set_config('request.jwt.claims', '', true);

-- The proof, written the way every writer has always written it: normalized. The mess that
-- makes this a test of BOTH sides now sits on regE, which is the website's column and the only
-- one of the two that can actually be messy in life (see the fixture's note).
insert into public.profile_emails (profile_id, email)
values (:'member1', 't032-extra@test.local');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(id)::int from public.course_registrations where id = :'regE'),
  1, 'after the claim, the email match works from the proven second address');

select is(
  (select count(id)::int from public.profile_emails),
  1, 'a member reads their own proven addresses');

reset role;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  format($$insert into public.profile_emails (profile_id, email)
           values (%L, 't032-m2@test.local')$$, :'member1'),
  '23514', null,
  'an address that is another account''s sign-in address can never become a proof');

-- TWO GUARANTEES, AND THEY ARE NOT THE SAME ONE. This used to be a single assertion that a
-- capitalized duplicate hit 23505, which proved uniqueness sees through case. Since
-- `profile_emails_normalized` (20260831150000) the capitalized form never reaches the index at
-- all, so both halves are now asserted separately: the column refuses a stray capital, and the
-- normalized form still refuses a second owner. Collapsing them again would let either one
-- disappear behind the other.
select throws_ok(
  format($$insert into public.profile_emails (profile_id, email)
           values (%L, 't032-extra@TEST.local')$$, :'member2'),
  '23514', null,
  'the column refuses a stray capital: proofs are stored the way they are matched');

select throws_ok(
  format($$insert into public.profile_emails (profile_id, email)
           values (%L, 't032-extra@test.local')$$, :'member2'),
  '23505', null,
  'one owner per address: a second member cannot prove one that is already proven');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a2", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(id)::int from public.profile_emails),
  0, 'and nobody reads anybody else''s');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000032a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

delete from public.profile_emails;

select is(
  (select count(id)::int from public.course_registrations where id = :'regE'),
  0, 'removing a proven address stops the matching, immediately');

-- --- 11. the secret ledger is a closed room ----------------------------------------------------
-- email_claims was the other one until the self-service claim was retired (2026-08-11).

select throws_ok(
  $$select id from public.course_handoff_tokens$$,
  '42501', null,
  'no client reads handoff tokens');

reset role;
select set_config('request.jwt.claims', '', true);

-- --- 12. who may call what ---------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.email_belongs_to_caller(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.email_belongs_to_caller(text)', 'EXECUTE'),
  'the email match answers members and never guests');

select ok(
  (select bool_and(has_function_privilege('service_role', f.signature, 'EXECUTE'))
     from unnest(array[
       'public.mint_course_handoff(uuid, text)',
       'public.redeem_course_handoff(text, text, boolean)'
     ]) as f(signature)),
  'both RPCs answer the service role: the edge function and the website');

select is(
  (select count(*)::int
     from unnest(array[
       'public.mint_course_handoff(uuid, text)',
       'public.redeem_course_handoff(text, text, boolean)'
     ]) as f(signature)
     cross join unnest(array['anon', 'authenticated']) as r(who)
    where has_function_privilege(r.who, f.signature, 'EXECUTE')),
  0, 'and no client may mint or redeem directly');

-- The claim RPCs were dropped with the self-service flow (2026-08-11, ADR 0017
-- amendment). Asserted gone so a revert has to be deliberate rather than accidental.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('request_email_claim', 'verify_email_claim')),
  0, 'the retired claim RPCs are gone, and profile_emails outlives them');

-- --- 13. a row born attached says WHEN (20260831160000) ----------------------------------------
-- Deliberately last in the file: these fixtures attach rows to a member, and section 6
-- asserts exact per-member row counts. A new visible row up there is a red build down here
-- for the wrong reason.
--
-- The gap this closes was invisible to every test above precisely because every fixture in
-- them names `linked_at` itself. The website does not. regG is inserted the way a handoff
-- checkout actually arrives: profile_id and link_method, no timestamp.
--
-- BOTH ROWS CARRY A SLUG THE CATALOG DOES NOT KNOW, so course_id stays null and the
-- double-booking partial unique on (course_id, profile_id) cannot interfere. `052`'s fixture
-- made the same choice, and `20260831150000` was right to call that a mistake THERE, in a
-- file about the link routine, where the collision is the behaviour under test. Here it is
-- pure noise: what is asserted is that a profile_id present at INSERT produces a linked_at,
-- and the course has nothing to do with it. Sections 8 and 9 already spend both members'
-- enrolments on the real courses, so naming one would only make these four assertions
-- hostage to a fixture three sections away.

-- The trusted-writer context, restated rather than assumed: `reset role` alone leaves the
-- last member's claims in place, and the insert guard refuses any write made with a user
-- context (CLAUDE.md pgTAP trap).
reset role;
select set_config('request.jwt.claims', '', true);

insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency, payment_status,
   profile_id, source, link_method)
values
  (:'regG', 'a-course-only-section-13-knows', 'Intensive (3 weeks)', 'T032 Born Attached',
   't032-born@test.local', 'Glasgow', 'Scotland, UK', 4000, 'gbp', 'paid',
   :'member2', 'app', 'handoff');

select ok(
  (select linked_at is not null from public.course_registrations where id = :'regG'),
  'a row that arrives already carrying a member is linked at birth, not two thirds linked');

-- The other half of the same rule, and the one that makes it safe to run over seeds and
-- fixtures: a caller who names the column keeps the value it chose. Without this, a trigger
-- written to fill a gap would silently rewrite history every importer restated.
insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency, payment_status,
   profile_id, source, link_method, linked_at)
values
  (:'regH', 'another-course-only-section-13-knows', 'Part-time (4 weeks)',
   'T032 Linked Long Ago', 't032-longago@test.local', 'Glasgow', 'Scotland, UK',
   2500, 'gbp', 'paid', :'member1', 'app', 'handoff', '2026-01-02 03:04:05+00');

select is(
  (select linked_at from public.course_registrations where id = :'regH'),
  '2026-01-02 03:04:05+00'::timestamptz,
  'and a writer that names the column keeps the value it chose: never an overwrite');

select ok(
  (select linked_at is null from public.course_registrations where id = :'regA'),
  'an unattached website row is given no link date to explain');

-- The invariant the header of 20260831160000 declines to write as a CHECK, because
-- profile_id is a column the website sends and a refused insert there is a charged member
-- with no record. Being wrong costs a red build here instead.
select is(
  (select count(*)::int from public.course_registrations
    where profile_id is not null and linked_at is null),
  0, 'no row anywhere holds a member without the date it gained one');

select * from finish();
rollback;
