-- The claim flow and the handoff (W2.9 slice 2; migrations 20260809203000/204000,
-- ADR 0017 decisions 3 and 7): the two RPC surfaces the edge functions call.
--
-- Everything a hostile caller would try is tried here: a code guessed wrong, guessed
-- five times, entered after its quarter hour, spent twice; an address that is another
-- account's sign-in or another member's proof; a token replayed, pointed at the wrong
-- course, or resurrected after a re-mint superseded it. And the one uniformity rule no
-- single response can show: requesting a claim answers IDENTICALLY whether or not the
-- address has registrations, because the request path never reads them.
--
-- Where a test needs the raw code, it recovers it by brute force over the six-digit
-- space WITH the stored salt: exactly the attack the attempt cap makes impossible
-- through the API, used here so the ledger never has to export a secret for testing.
--
-- Called as postgres (the RPCs are service-role doors; EXECUTE is asserted in 032).

begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

\set glasgow '00000000-0000-4000-8000-000000000001'

\set m1 'a0000000-0000-4000-8000-0000000033a1'
\set m2 'a0000000-0000-4000-8000-0000000033a2'
\set m3 'a0000000-0000-4000-8000-0000000033a3'
\set ghost 'a0000000-0000-4000-8000-0000000033a9'

insert into auth.users (id, email) values
  (:'m1', 't033-m1@test.local'),
  (:'m2', 't033-m2@test.local'),
  (:'m3', 't033-m3@test.local'),
  (:'ghost', 't033-ghost@test.local');

-- ghost never onboards: the refusal for half-created accounts.
insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  (:'m1', 't033-m1@test.local', 'T033 One', :'glasgow', 'member', now()),
  (:'m2', 't033-m2@test.local', 'T033 Two', :'glasgow', 'member', now()),
  (:'m3', 't033-m3@test.local', 'T033 Three', :'glasgow', 'member', now());
insert into public.profiles (id, email, display_name, branch_id, role) values
  (:'ghost', 't033-ghost@test.local', 'T033 Ghost', :'glasgow', 'member');

-- Three website rows by the address m1 will prove: two for the SAME course, so the
-- linking pass meets the double-booking unique and must skip one rather than abort.
insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency, payment_status)
values
  ('c0330000-0000-4000-8000-000000000001', 'grace-reset', 'Intensive (2 weeks)',
   'M One Guest', 'T033-Second@test.local', 'Glasgow', 'Scotland, UK', 2500, 'gbp', 'paid'),
  ('c0330000-0000-4000-8000-000000000002', 'grace-masterclass', 'Part-time (6 weeks)',
   'M One Guest', 't033-second@test.local', 'Glasgow', 'Scotland, UK', 4000, 'gbp', 'paid'),
  ('c0330000-0000-4000-8000-000000000003', 'grace-reset', 'Part-time (4 weeks)',
   'M One Guest Again', 't033-second@test.local ', 'Glasgow', 'Scotland, UK', 2500, 'gbp', 'paid');

-- --- 1. requesting a code ---------------------------------------------------------------------

create temporary table t033_req1 on commit drop as
  select * from public.request_email_claim(
    'a0000000-0000-4000-8000-0000000033a1', '  T033-Second@test.local  ');

select is(
  (select outcome from t033_req1),
  'created',
  'a claim for a fresh address mints a code, however the address is typed');

select ok(
  (select code ~ '^\d{6}$' from t033_req1),
  'codes are six digits');

-- The uniformity rule, asserted where it can be seen: t033-second has THREE
-- registrations, this address has none, and the answers are identical.
select is(
  (select outcome from public.request_email_claim(
     :'m3', 't033-none@test.local')),
  'created',
  'an address with no registrations answers exactly like one with three: the request never looks');

select is(
  (select email from public.email_claims
    where profile_id = :'m1' order by created_at desc limit 1),
  't033-second@test.local',
  'the claim stores the normalized address');

select ok(
  exists (
    select 1
    from public.email_claims ec
    join t033_req1 r on true
    where ec.profile_id = :'m1'
      and ec.email = 't033-second@test.local'
      and ec.consumed_at is null
      and ec.code_hash
          = encode(extensions.digest(ec.code_salt || ':' || r.code, 'sha256'), 'hex')
      and ec.code_hash <> r.code
  ),
  'and at rest only the salted hash of the code, never the code');

select ok(
  (select expires_at between now() + interval '14 minutes' and now() + interval '16 minutes'
     from public.email_claims
    where profile_id = :'m1' and email = 't033-second@test.local' and consumed_at is null),
  'a code lives for fifteen minutes');

-- --- 2. the refusals that matter more than the happy path --------------------------------------

select is(
  (select outcome from public.request_email_claim(:'m1', 't033-m2@test.local')),
  'address_in_use',
  'another account''s sign-in address is refused: "sign in with that address instead"');

select is(
  (select outcome from public.request_email_claim(:'m1', 't033-m1@test.local')),
  'already_verified',
  'your own sign-in address needs no claim');

select is(
  (select outcome from public.request_email_claim(:'ghost', 't033-x@test.local')),
  'refused',
  'a half-created account cannot claim anything');

-- --- 3. verifying, and what a proof does -------------------------------------------------------

-- A guaranteed-wrong guess: the real code plus one, so this test can never flake into
-- the lucky-guess branch.
select is(
  (select outcome from public.verify_email_claim(
     :'m1', 't033-second@test.local',
     (select lpad(((code::int + 1) % 1000000)::text, 6, '0') from t033_req1))),
  'invalid_code',
  'a wrong code is refused');

select is(
  (select attempts from public.email_claims
    where profile_id = :'m1' and email = 't033-second@test.local' and consumed_at is null),
  1,
  'and it cost an attempt');

select is(
  (select count(*)::int from public.course_registrations
    where lower(trim(email)) = 't033-second@test.local' and profile_id is not null),
  0,
  'nothing links on a wrong code');

create temporary table t033_verify on commit drop as
  select * from public.verify_email_claim(
    'a0000000-0000-4000-8000-0000000033a1', 'T033-Second@test.local',
    (select code from t033_req1));

select is(
  (select outcome from t033_verify),
  'verified',
  'the right code, however the address is typed, proves the mailbox');

select is(
  (select linked_count from t033_verify),
  2,
  'and reports what it linked');

select is(
  (select count(*)::int from public.profile_emails
    where profile_id = :'m1' and lower(trim(email)) = 't033-second@test.local'),
  1,
  'the proven address is STORED, not spent (ADR 0017): the next registration matches too');

select is(
  (select count(*)::int from public.course_registrations
    where lower(trim(email)) = 't033-second@test.local'
      and profile_id = :'m1' and link_method = 'self' and linked_by = :'m1'
      and linked_at is not null),
  2,
  'the linking pass linked one Reset row and the Masterclass row, method self');

select is(
  (select count(*)::int from public.course_registrations
    where lower(trim(email)) = 't033-second@test.local' and profile_id is null),
  1,
  'and SKIPPED the second live Reset row rather than aborting: an admin untangles that one');

select is(
  (select count(*)::int from public.privileged_actions
    where action = 'registration_linked' and target_id = :'m1'),
  2,
  'every link the claim made is in the audit log, written by trigger');

select is(
  (select outcome from public.request_email_claim(:'m2', 't033-second@test.local')),
  'address_in_use',
  'an address already PROVEN by another member is refused the same way as a sign-in address');

-- --- 4. a code is single use, expiring, and guess-bounded --------------------------------------

select is(
  (select outcome from public.verify_email_claim(
     :'m1', 't033-second@test.local', (select code from t033_req1))),
  'no_claim',
  'a spent code answers no_claim: single use means single use');

select is(
  (select outcome from public.request_email_claim(:'m1', 't033-late@test.local')),
  'created',
  'a second address can be claimed while the first stays proven');

update public.email_claims
  set expires_at = now() - interval '1 minute'
  where profile_id = :'m1' and email = 't033-late@test.local' and consumed_at is null;

select is(
  (select outcome from public.verify_email_claim(:'m1', 't033-late@test.local', '123456')),
  'expired',
  'a code after its quarter hour is dead before it is even compared');

create temporary table t033_brute on commit drop as
  select * from public.request_email_claim(
    'a0000000-0000-4000-8000-0000000033a1', 't033-brute@test.local');

select is(
  (select outcome from t033_brute),
  'created',
  'a fresh claim for the brute-force story');

select is(
  (select count(*)::int
     from generate_series(1, 5) g
     cross join lateral public.verify_email_claim(
       'a0000000-0000-4000-8000-0000000033a1', 't033-brute@test.local',
       (select lpad(((code::int + g) % 1000000)::text, 6, '0') from t033_brute)) v
    where v.outcome = 'invalid_code'),
  5,
  'five wrong guesses are five refusals');

select is(
  (select outcome from public.verify_email_claim(
     :'m1', 't033-brute@test.local', (select code from t033_brute))),
  'too_many_attempts',
  'and after the cap even the RIGHT code is dead: brute force buys nothing');

-- --- 5. the database bounds requests even when the edge function forgets ------------------------

-- m2 hammers ONE address. Superseded claims are consumed, not deleted, so every
-- request stays countable: the fix this test exists to hold, because a delete here
-- reset the count for exactly the pair a mail-bomber hammers. Five literal calls, not
-- a lateral over generate_series: a volatile lateral with constant arguments gets
-- evaluated ONCE by the planner, and this test then bombs nobody (found 2026-08-09).
create temporary table t033_bombing on commit drop as
  select outcome from public.request_email_claim(
    'a0000000-0000-4000-8000-0000000033a2', 't033-bombed@test.local')
  union all select outcome from public.request_email_claim(
    'a0000000-0000-4000-8000-0000000033a2', 't033-bombed@test.local')
  union all select outcome from public.request_email_claim(
    'a0000000-0000-4000-8000-0000000033a2', 't033-bombed@test.local')
  union all select outcome from public.request_email_claim(
    'a0000000-0000-4000-8000-0000000033a2', 't033-bombed@test.local')
  union all select outcome from public.request_email_claim(
    'a0000000-0000-4000-8000-0000000033a2', 't033-bombed@test.local');

select is(
  (select count(*)::int from t033_bombing where outcome = 'created'),
  5,
  'requests up to the bound mint codes, re-requests for the same address included');

select is(
  (select outcome from public.request_email_claim(:'m2', 't033-else@test.local')),
  'rate_limited',
  'the caller''s sixth request in the hour is refused in the DATABASE, not just a warm instance');

select is(
  (select outcome from public.request_email_claim(:'m1', 't033-bombed@test.local')),
  'rate_limited',
  'and the TARGET is bounded too: a fresh caller cannot keep the mail flowing to one mailbox');

-- --- 6. the handoff: minted bound, redeemed once -----------------------------------------------

select is(
  (select outcome from public.mint_course_handoff(:'m1', 'grace-reset')),
  'already_registered',
  'a member already holding a live registration is told so instead of walked into paying twice');

select is(
  (select outcome from public.mint_course_handoff(:'m2', 'further')),
  'not_open',
  'an upcoming level mints nothing: the app should be offering Notify me');

select is(
  (select outcome from public.mint_course_handoff(:'m2', 'no-such-course')),
  'unknown_course',
  'an unknown slug mints nothing');

select is(
  (select outcome from public.mint_course_handoff(:'ghost', 'grace-reset')),
  'refused',
  'a half-created account mints nothing');

create temporary table t033_mint on commit drop as
  select * from public.mint_course_handoff(
    'a0000000-0000-4000-8000-0000000033a2', 'grace-reset');

select is((select outcome from t033_mint), 'minted', 'an eligible member mints');

select ok(
  (select token ~ '^[0-9a-f]{64}$' from t033_mint),
  'the token is 32 opaque random bytes as hex: nothing personal rides in the URL');

select ok(
  (select expires_at between now() + interval '29 minutes' and now() + interval '31 minutes'
     from t033_mint),
  'and it lives half an hour');

select is(
  (select count(*)::int from public.course_handoff_tokens t
     join t033_mint m
       on t.token_hash = encode(extensions.digest(m.token, 'sha256'), 'hex')),
  1,
  'the table holds only the hash of it');

select is(
  (select outcome from public.redeem_course_handoff(
     (select token from t033_mint), 'grace-masterclass', true)),
  'wrong_course',
  'a token is bound to ONE course: it says nothing on any other page');

select is(
  (select p.outcome || ' ' || coalesce(p.profile_id::text, '-') || ' ' ||
          coalesce(p.full_name, '-') || ' ' || coalesce(p.email, '-')
     from public.redeem_course_handoff((select token from t033_mint), 'grace-reset', false) p),
  'ok a0000000-0000-4000-8000-0000000033a2 T033 Two t033-m2@test.local',
  'a PEEK resolves identity for the prefill without spending the token');

select is(
  (select outcome from public.redeem_course_handoff(
     (select token from t033_mint), 'grace-reset', true)),
  'ok',
  'the CONSUME at checkout creation still finds it: peeking, and the wrong-course probe, spent nothing');

select is(
  (select outcome from public.redeem_course_handoff(
     (select token from t033_mint), 'grace-reset', true)),
  'used',
  'a replay after the consume is refused: one token, one linked checkout');

select is(
  (select outcome from public.redeem_course_handoff(repeat('ab', 32), 'grace-reset', true)),
  'invalid',
  'a token nobody minted resolves to nothing');

-- A re-tap supersedes: the old token dies the moment a new one is minted.
create temporary table t033_mint2 on commit drop as
  select * from public.mint_course_handoff(
    'a0000000-0000-4000-8000-0000000033a3', 'grace-reset');
create temporary table t033_mint3 on commit drop as
  select * from public.mint_course_handoff(
    'a0000000-0000-4000-8000-0000000033a3', 'grace-reset');

select is(
  (select outcome from public.redeem_course_handoff(
     (select token from t033_mint2), 'grace-reset', true)),
  'invalid',
  'a superseded token is gone: one live token per member per course');

select is(
  (select outcome from public.redeem_course_handoff(
     (select token from t033_mint3), 'grace-reset', true)),
  'ok',
  'and the newest one is the one that works');

select * from finish();
rollback;
