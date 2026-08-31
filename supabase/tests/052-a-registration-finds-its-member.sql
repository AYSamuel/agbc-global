-- #164 (migration 20260831120000): an admin attaches a website registration to a member
-- by hand, and can undo it.
--
-- This file is about a stranger's payment record and the three ways somebody can be hurt
-- through one, so it is organised by harm rather than by function:
--
--   1. THE WRONG PERSON ACTS. All four routines are granted to `authenticated`, so the
--      boundary is the admin check INSIDE each one, not the grant. A leader and a member are
--      refused separately by every routine rather than once through a shared helper, and
--      every refusal asserts WHAT DID NOT CHANGE. An UPDATE a caller is not entitled to make
--      is filtered by RLS silently, so "it threw" proves nothing on its own.
--   2. THE WRONG MEMBER IS LINKED. The admin is the judge, so a mismatched name must SUCCEED
--      (asserted, because it is the case the issue exists for). What must NOT succeed is
--      linking an address somebody else has already proven, because ADR 0017's auto-match
--      would then repeat the mistake forever with no human in the loop.
--   3. THE RECORD LIES ABOUT ITSELF. Linking and unlinking are audited by the EXISTING
--      trigger; setting aside changes no owner, fires no trigger, and writes its own row.
--      All three are asserted, since an audit nobody checks is not an audit.
--
-- TRAPS OBSERVED HERE:
--   * `reset role` leaves request.jwt.claims behind (009), so every block clears it.
--   * `anon` holds no EXECUTE on these four, and CALLING a function you lack EXECUTE on takes
--     down this local backend. anon is therefore asserted from the catalogue, never invoked.
--   * Counts are scoped to this file's own fixtures (#184): a bare count over
--     privileged_actions or profile_emails is a race with every other parallel file.
--   * `course_registrations_insert_guard` refuses any INSERT while auth.uid() is set, so the
--     fixtures go in on the trusted path with claims explicitly cleared.

begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

\set glasgow '00000000-0000-4000-8000-000000000001'
\set berlin  '00000000-0000-4000-8000-000000000002'
\set emmen   '00000000-0000-4000-8000-000000000003'

\set admin     'a0000000-0000-4000-8000-0000000052a1'
\set leader    'a0000000-0000-4000-8000-0000000052a2'
\set member    'a0000000-0000-4000-8000-0000000052a3'
\set grace_ber 'a0000000-0000-4000-8000-0000000052a4'
\set grace_gla 'a0000000-0000-4000-8000-0000000052a5'
\set other     'a0000000-0000-4000-8000-0000000052a6'

\set regQueue    'c0520000-0000-4000-8000-000000000001'
\set regLinked   'c0520000-0000-4000-8000-000000000002'
\set regAside    'c0520000-0000-4000-8000-000000000003'
\set regTaken    'c0520000-0000-4000-8000-000000000004'
\set regSame     'c0520000-0000-4000-8000-000000000005'
\set regMismatch 'c0520000-0000-4000-8000-000000000006'
\set regSignin   'c0520000-0000-4000-8000-000000000007'
\set regEnrolA   'c0520000-0000-4000-8000-000000000008'
\set regEnrolB   'c0520000-0000-4000-8000-000000000009'

-- The insert guard refuses a registration while auth.uid() is set: these rows belong to the
-- website's service key in life, and to the trusted path here.
select set_config('request.jwt.claims', '', true);

insert into auth.users (id, email) values
  (:'admin',     't052-admin@test.local'),
  (:'leader',    't052-leader@test.local'),
  (:'member',    't052-member@test.local'),
  (:'grace_ber', 't052-grace-berlin@test.local'),
  (:'grace_gla', 't052-grace-glasgow@test.local'),
  (:'other',     't052-other@test.local');

-- Two members share the display name 'Grace Adeyemi' on purpose: name similarity ties
-- constantly across a diaspora church (SPEC open risk 2), so the BRANCH tiebreak is the only
-- thing separating them and it is asserted below rather than assumed.
insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  (:'admin',     't052-admin@test.local',         'T052 Admin',        :'glasgow', 'admin',  now()),
  (:'leader',    't052-leader@test.local',        'T052 Leader',       :'glasgow', 'leader', now()),
  (:'member',    't052-member@test.local',        'T052 Member',       :'glasgow', 'member', now()),
  (:'grace_ber', 't052-grace-berlin@test.local',  'Grace Adeyemi',     :'berlin',  'member', now()),
  (:'grace_gla', 't052-grace-glasgow@test.local', 'Grace Adeyemi',     :'glasgow', 'member', now()),
  (:'other',     't052-other@test.local',         'Zebedee Nakamura',  :'emmen',   'member', now());

-- Course strings deliberately match no slug, so course_id stays null and the double-booking
-- partial unique on (course_id, profile_id) cannot interfere with linking several fixtures to
-- one member. This file is about identity, not enrolment.
--
-- THAT EXEMPTION IS ALSO HOW THE DOUBLE-BOOKING REFUSAL WENT UNTESTED for a whole work item,
-- so the last two rows break it on purpose: `grace-reset` is a seeded slug, they resolve to a
-- real course_id, and section 4b drives the collision a real admin actually meets. Everything
-- above them keeps the exemption, which is still right for the identity half.
insert into public.course_registrations
  (id, course, format, full_name, email, city, country, branch, amount, currency)
values
  (:'regQueue',    't052-alpha', 'online', 'Grace Adeyemi',        'grace-payer@test.local',
   'Berlin', 'DE', 'AGBC Lighthouse Berlin', 5000, 'eur'),
  (:'regLinked',   't052-bravo', 'online', 'T052 Member',          't052-member@test.local',
   'Glasgow', 'GB', 'AGBC Glasgow', 5000, 'gbp'),
  (:'regAside',    't052-charlie', 'online', 'Nobody At All',      'nobody@test.local',
   'Glasgow', 'GB', 'AGBC Glasgow', 5000, 'gbp'),
  (:'regTaken',    't052-delta', 'online', 'Grace Adeyemi',        'owned-elsewhere@test.local',
   'Glasgow', 'GB', 'AGBC Glasgow', 5000, 'gbp'),
  (:'regSame',     't052-echo', 'online', 'Grace Adeyemi',         'grace-payer@test.local',
   'Berlin', 'DE', 'AGBC Lighthouse Berlin', 5000, 'eur'),
  (:'regMismatch', 't052-foxtrot', 'online', 'Someone Entirely Else', 'mismatch@test.local',
   'Berlin', 'DE', 'AGBC Lighthouse Berlin', 5000, 'eur'),
  (:'regSignin',   't052-golf', 'online', 'Grace Adeyemi',         't052-leader@test.local',
   'Berlin', 'DE', 'AGBC Lighthouse Berlin', 5000, 'eur'),
  (:'regEnrolA',   'grace-reset', 'online', 'Zebedee Nakamura',    'zeb-first@test.local',
   'Emmen', 'NL', 'AGBC Emmen', 5000, 'eur'),
  (:'regEnrolB',   'grace-reset', 'online', 'Zebedee Nakamura',    'zeb-second@test.local',
   'Emmen', 'NL', 'AGBC Emmen', 5000, 'eur');

-- regLinked starts life already attached, so the unlink paths have something to act on.
update public.course_registrations
  set profile_id = :'member', link_method = 'leader', linked_by = :'admin', linked_at = now()
  where id = :'regLinked';

-- An address already proven by the OTHER Grace, for the collision this feature is most
-- dangerous without.
insert into public.profile_emails (profile_id, email)
values (:'grace_gla', 'owned-elsewhere@test.local');

-- --- 1. the shape: who may call, and who may read what ----------------------------------

select ok(
  (select bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('link_registration', 'unlink_registration',
                        'set_registration_aside', 'registration_match_suggestions')),
  'staff call all four routines with their OWN token: authenticated holds EXECUTE');

-- Asserted from the catalogue and NEVER by calling: invoking a function you lack EXECUTE on
-- takes down this local backend.
select ok(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('link_registration', 'unlink_registration',
                        'set_registration_aside', 'registration_match_suggestions')),
  'a signed-out visitor cannot reach any of the four routines');

-- The grant that decides whether the queue screen can see its own filter. set_aside_by is
-- withheld on the linked_by / moderated_by reasoning: which staff member made the call is
-- internal, and every human client is the same `authenticated` role.
select is(
  (select array_agg(column_name::text order by column_name::text)
     from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'course_registrations'
      and grantee = 'authenticated' and privilege_type = 'SELECT'
      and column_name like 'set_aside%'),
  array['set_aside_at'],
  'the queue may read WHETHER a row was set aside, never WHO decided it');

select is(
  (select count(*)::int
     from information_schema.role_column_grants
    where table_schema = 'public' and table_name = 'course_registrations'
      and grantee in ('authenticated', 'anon') and privilege_type = 'UPDATE'
      and column_name like 'set_aside%'),
  0,
  'no client writes either set-aside column: it moves through the routine or not at all');

-- --- 2. the wrong person acts ------------------------------------------------------------
--
-- Every refusal is followed by an assertion of what DID NOT change, checked as the trusted
-- path. A leader reading the row under their own RLS sees nothing here anyway, which is
-- exactly why "it threw" is not evidence.

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000052a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  format($$select public.link_registration(%L, %L)$$, :'regQueue', :'grace_ber'),
  '42501', 'linking a payment record to a member is an admin action',
  'a branch leader cannot link a stranger''s payment record (ADR 0017 decision 5)');

select throws_ok(
  format($$select public.set_registration_aside(%L, true)$$, :'regQueue'),
  '42501', 'setting a registration aside is an admin action',
  'a branch leader cannot set a registration aside');

select throws_ok(
  format($$select public.unlink_registration(%L)$$, :'regLinked'),
  '42501', 'unlinking a payment record is an admin action',
  'a branch leader cannot detach a member from a course they paid for');

select throws_ok(
  format($$select * from public.registration_match_suggestions(%L)$$, :'regQueue'),
  '42501', 'suggesting members for a payment record is an admin action',
  'a branch leader cannot ask who a stranger might be');

reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select profile_id is null and set_aside_at is null
     from public.course_registrations where id = :'regQueue'),
  'after every leader attempt the row is STILL unlinked and still in the queue');

select is(
  (select profile_id from public.course_registrations where id = :'regLinked'),
  :'member'::uuid,
  'after the leader''s unlink attempt the member is STILL attached');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000052a3", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  format($$select public.link_registration(%L, %L)$$, :'regQueue', :'member'),
  '42501', 'linking a payment record to a member is an admin action',
  'a member cannot claim a registration for themselves: the cut claim flow stays cut');

select throws_ok(
  format($$select public.set_registration_aside(%L, true)$$, :'regQueue'),
  '42501', 'setting a registration aside is an admin action',
  'a member cannot set a registration aside');

reset role;
select set_config('request.jwt.claims', '', true);

select ok(
  (select profile_id is null and set_aside_at is null
     from public.course_registrations where id = :'regQueue'),
  'after every member attempt the row is STILL unlinked and still in the queue');

-- --- 3. the admin links, and the link teaches the auto-match -----------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000052a1", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  format($$select public.link_registration(%L, %L)$$, :'regQueue', :'grace_ber'),
  'an admin links the payment record to the member');

select is(
  (select profile_id from public.course_registrations where id = :'regQueue'),
  :'grace_ber'::uuid,
  'the registration now belongs to the member');

select is(
  (select link_method::text from public.course_registrations where id = :'regQueue'),
  'leader',
  'the row records HOW it was linked: by hand, not by the email match');

-- From here the ROLE returns to the trusted path while the CLAIMS stay the admin's. That is
-- the 009 trap used ON PURPOSE rather than fallen into, and it is sound because the routines
-- are SECURITY DEFINER: their bodies run as the owner either way, so the call behaves
-- identically, while the assertions regain the privilege to read linked_by and set_aside_by,
-- which are WITHHELD from every client deliberately. The three tests above already proved a
-- real authenticated admin can make the call; everything below is about what the call DID.
reset role;

select ok(
  (select linked_by = :'admin'::uuid and linked_at is not null
     from public.course_registrations where id = :'regQueue'),
  'the trio records which admin linked it and when');

-- The point of the whole feature: the member stops hitting this on their next registration.
select is(
  (select count(*)::int from public.profile_emails
    where profile_id = :'grace_ber' and email = 'grace-payer@test.local'),
  1,
  'linking PROVES the address, so ADR 0017''s auto-match answers next time');

select ok(
  exists (
    select 1 from public.privileged_actions
    where action = 'registration_linked'
      and target_id = :'grace_ber'
      and (after ->> 'registration_id')::uuid = :'regQueue'::uuid
  ),
  'the existing trigger audited the link; the routine did not have to remember to');

-- A second registration from the SAME address to the SAME member is not a collision.
select lives_ok(
  format($$select public.link_registration(%L, %L)$$, :'regSame', :'grace_ber'),
  'a second registration from an address this member has already proven links fine');

select is(
  (select count(*)::int from public.profile_emails
    where profile_id = :'grace_ber' and email = 'grace-payer@test.local'),
  1,
  'and proving it twice does not duplicate the address');

-- --- 4. the states a link may not be made from -------------------------------------------

select throws_ok(
  format($$select public.link_registration(%L, %L)$$, :'regQueue', :'grace_gla'),
  '23514', 'this registration is already linked; unlink it first',
  'an already-linked row is not silently re-linked: a double submit cannot move a course');

select is(
  (select profile_id from public.course_registrations where id = :'regQueue'),
  :'grace_ber'::uuid,
  'and the original owner is untouched by the refused attempt');

select lives_ok(
  format($$select public.set_registration_aside(%L, true)$$, :'regAside'),
  'an admin sets an un-matchable row aside');

select throws_ok(
  format($$select public.link_registration(%L, %L)$$, :'regAside', :'grace_ber'),
  '23514', 'this registration was set aside; bring it back first',
  'a set-aside row must be brought back before it can be linked');

select throws_ok(
  format($$select public.set_registration_aside(%L, true)$$, :'regQueue'),
  '23514', 'a linked registration is not un-matchable; unlink it first',
  'a LINKED row is not un-matchable: it has already been matched');

-- The two "it is not there" refusals. They are asserted for the same reason as every other
-- message in this file: the dashboard maps these strings to the words on screen
-- (`apps/dashboard/src/server/registrations.ts`), because one SQLSTATE covers four different
-- refusals and they do not all mean the same thing to the person reading them. A migration
-- that rewords one turns this red rather than quietly degrading the screen to "something
-- went wrong".
select throws_ok(
  format($$select public.link_registration(%L, %L)$$,
         '00000000-0000-4000-8000-0000000000ff', :'grace_ber'),
  'P0002', 'no such registration',
  'a registration id that is not there is refused as such, not as a link failure');

-- regTaken and not regAside: the member check sits BELOW the set-aside check in the routine,
-- so a row that has just been set aside would raise the wrong refusal and prove nothing.
select throws_ok(
  format($$select public.link_registration(%L, %L)$$,
         :'regTaken', '00000000-0000-4000-8000-0000000000fe'),
  'P0002', 'no such member',
  'and a member who is not there is a different refusal again');

select throws_ok(
  format($$select public.unlink_registration(%L)$$, :'regAside'),
  '23514', 'this registration is not linked',
  'unlinking a row that was never linked is refused rather than silently doing nothing');

-- --- 4b. the double-booking wall, in words (migration 20260831150000) ---------------------
--
-- THE ONE STATE THIS FILE'S OWN FIXTURES WERE BUILT TO AVOID. The note above the inserts says
-- the course strings match no slug "so the double-booking partial unique cannot interfere",
-- which was right for a file about identity and is exactly why the collision a real admin
-- meets went untested until a review drove the screens by hand. `link_registration` ends in an
-- UPDATE that sets profile_id, so a member who already holds a live registration for that
-- course made it raise a bare 23505, which the dashboard could only report as "That did not
-- go through. Try again." Retrying could never work, and the member in question is the one
-- who paid twice, which is the whole premise of #164.
--
-- regEnrolA and regEnrolB therefore carry a REAL slug and are the only two fixtures in this
-- file that resolve to a course. They go in with the others at the top, where the insert
-- guard's cleared claims already are; only the acting happens here, on the ambient admin
-- claims this section already runs under.
select isnt(
  (select course_id from public.course_registrations where id = :'regEnrolA'),
  null,
  'the fixture resolved to a real course, so the double-booking index can actually bite');

select lives_ok(
  format($$select public.link_registration(%L, %L)$$, :'regEnrolA', :'other'),
  'the first payment for a course attaches to the member normally');

select throws_ok(
  format($$select public.link_registration(%L, %L)$$, :'regEnrolB', :'other'),
  '23514', 'this member already has a place on that course',
  'a SECOND payment for the same course refuses in words, not as a bare unique violation');

select ok(
  (select profile_id is null and linked_at is null
     from public.course_registrations where id = :'regEnrolB'),
  'and the refused row is untouched: no half-link, no linked_at');

-- THE REFUSAL MUST NOT BE WIDER THAN THE INDEX IT SPEAKS FOR. A cancelled registration is
-- outside `course_registrations_active_enrolment_uniq` (partial on status <> 'cancelled'), so
-- the slot is genuinely free and the second payment must link. Without this the routine could
-- quietly refuse links the database would have allowed, and nothing would say so.
update public.course_registrations set status = 'cancelled' where id = :'regEnrolA';

select lives_ok(
  format($$select public.link_registration(%L, %L)$$, :'regEnrolB', :'other'),
  'a cancelled registration frees the slot, exactly as the index reads it');

-- --- 5. the collision this feature is most dangerous without -----------------------------
--
-- Decision 5 accepted that an admin link is a JUDGEMENT rather than proof of address
-- ownership. Where the address is already spoken for, the honest answer is to refuse the
-- whole link: linking quietly WITHOUT proving the address would leave an admin believing the
-- auto-match had been taught when it had not.

select throws_ok(
  format($$select public.link_registration(%L, %L)$$, :'regTaken', :'grace_ber'),
  '23514', 'that address is already proven by another member',
  'an address another member has already proven refuses the link outright');

select ok(
  (select profile_id is null from public.course_registrations where id = :'regTaken'),
  'and the registration stays in the queue rather than half-linking');

select is(
  (select profile_id from public.profile_emails where email = 'owned-elsewhere@test.local'),
  :'grace_gla'::uuid,
  'the member who already proved that address still owns it');

select throws_ok(
  format($$select public.link_registration(%L, %L)$$, :'regSignin', :'grace_ber'),
  '23514', 'this address is another account''s sign-in address',
  'an address that is another account''s SIGN-IN is refused too: the guard is left to speak');

-- --- 6. the admin is the judge -------------------------------------------------------------
--
-- The case the issue exists for. The names do not match at all (similarity 0), and it must
-- still succeed: the admin has spoken to this person, and the tool exists precisely because
-- the automatic rules could not answer.

select lives_ok(
  format($$select public.link_registration(%L, %L)$$, :'regMismatch', :'grace_ber'),
  'an admin may link a row whose name does not match the member: the admin is the judge');

select ok(
  exists (
    select 1 from public.privileged_actions
    where action = 'registration_linked'
      and (after ->> 'registration_id')::uuid = :'regMismatch'::uuid
      and target_id = :'grace_ber'
  ),
  'and the judgement is on the record, which is what makes it reviewable');

-- --- 7. undoing a link ----------------------------------------------------------------------

select lives_ok(
  format($$select public.unlink_registration(%L)$$, :'regMismatch'),
  'an admin returns a wrongly-linked row to the queue');

select ok(
  (select profile_id is null and linked_by is null
      and linked_at is null and link_method is null
     from public.course_registrations where id = :'regMismatch'),
  'the whole trio is cleared, not just the owner');

select ok(
  exists (
    select 1 from public.privileged_actions
    where action = 'registration_linked'
      and (before ->> 'registration_id')::uuid = :'regMismatch'::uuid
      and after ->> 'profile_id' is null
  ),
  'the reversal is audited by the same trigger, with a null owner after');

-- SPEC open risk 1, asserted so that changing it later has to be a decision: unlinking does
-- NOT un-prove the address, because it may have been proven by another route since.
select is(
  (select count(*)::int from public.profile_emails
    where profile_id = :'grace_ber' and email = 'grace-payer@test.local'),
  1,
  'unlinking leaves the proven address alone: un-proving a mailbox is a separate act');

-- --- 8. setting aside, and bringing back ---------------------------------------------------

select ok(
  (select set_aside_at is not null and set_aside_by = :'admin'::uuid
     from public.course_registrations where id = :'regAside'),
  'setting aside records both that it happened and who judged it');

-- This is the action that changes no owner, so the ownership trigger never fires for it and
-- it must write its own audit row.
select ok(
  exists (
    select 1 from public.privileged_actions
    where action = 'registration_set_aside'
      and actor_id = :'admin'
      and (after ->> 'registration_id')::uuid = :'regAside'::uuid
      and (after ->> 'set_aside')::boolean is true
  ),
  'an action that fires no trigger writes its own audit row');

select lives_ok(
  format($$select public.set_registration_aside(%L, false)$$, :'regAside'),
  'and an admin can bring a set-aside row back');

select ok(
  (select set_aside_at is null and set_aside_by is null
     from public.course_registrations where id = :'regAside'),
  'bringing it back clears both columns: the judgement is reversible');

-- --- 9. who might this be? ------------------------------------------------------------------
--
-- Both candidates carry the identical display name, so name similarity ties at 1.0 and the
-- BRANCH is the only thing that can separate them. That is the tiebreak under test.

select is(
  (select profile_id from public.registration_match_suggestions(:'regTaken') limit 1),
  :'grace_gla'::uuid,
  'on a tied name the member in the matching branch is offered first');

select is(
  (select reason from public.registration_match_suggestions(:'regTaken') limit 1),
  'similar name, same branch',
  'and the suggestion says WHY, so the admin can disagree with it');

select is(
  (select reason from public.registration_match_suggestions(:'regTaken')
    where profile_id = :'grace_ber'),
  'similar name',
  'the other branch''s member is still offered, but says less for itself');

select ok(
  not exists (
    select 1 from public.registration_match_suggestions(:'regTaken')
    where profile_id = :'other'
  ),
  'a member whose name shares nothing with the payer is not suggested at all');

select is(
  (select count(*)::int from public.registration_match_suggestions(:'regTaken', 1)),
  1,
  'the caller decides how many names to weigh at once');

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
