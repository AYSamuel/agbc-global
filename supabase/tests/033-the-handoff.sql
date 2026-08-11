-- The handoff (W2.9 slice 2; migration 20260809204000, ADR 0017 decision 7): the RPC
-- surface the course-handoff edge function calls.
--
-- Everything a hostile caller would try is tried here: a token replayed, pointed at the
-- wrong course, or resurrected after a re-mint superseded it. And the refusal that keeps
-- a member from paying twice, in all four shapes it arrives in: a linked row, an
-- unlinked row carrying their sign-in address, an unlinked row carrying an address they
-- proved, and either with course_id null the way prod rows arrive after `19`'s ALTER.
--
-- This file also covered the self-service claim flow until 2026-08-11, when it was cut
-- (ADR 0017 amendment) and its RPCs and ledger were dropped. What that flow used to set
-- up for the mint is now seeded directly, which is why m1 arrives already registered and
-- m4 arrives with a proven address in profile_emails: that table survives the cut and a
-- leader-linking tool will write it.
--
-- Called as postgres (the RPC is a service-role door; EXECUTE is asserted in 032).

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

-- m1 already holds a live registration for grace-reset. The claim flow used to put
-- it there by linking a website row; seeded directly now that it is gone, through the
-- path that still exists (a handoff redeemed at checkout).
insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency,
   payment_status, profile_id, source, linked_at, link_method)
values
  ('c0330000-0000-4000-8000-000000000001', 'grace-reset', 'Intensive (2 weeks)',
   'T033 One', 't033-m1@test.local', 'Glasgow', 'Scotland, UK', 2500, 'gbp', 'paid',
   'a0000000-0000-4000-8000-0000000033a1', 'app', now(), 'handoff');

-- --- the handoff: minted bound, redeemed once --------------------------------------------------

select is(
  (select outcome from public.mint_course_handoff(:'m1', 'grace-reset')),
  'already_registered',
  'a member already holding a live registration is told so instead of walked into paying twice');

-- The mint's refusal covers everything the member can SEE, not only linked rows
-- (20260810150000; the gap was walked on device: an email-matched row minted a
-- checkout for a place already held). m2's SIGN-IN address on an unlinked guest
-- row, typed with a stray capital and stray spaces, still refuses.
insert into public.course_registrations
  (course, format, full_name, email, city, country, amount, currency, payment_status)
values
  ('grace-masterclass', 'Intensive (3 weeks)', 'M Two Guest',
   '  T033-M2@test.local ', 'Glasgow', 'Scotland, UK', 4000, 'gbp', 'paid');

select is(
  (select outcome from public.mint_course_handoff(:'m2', 'grace-masterclass')),
  'already_registered',
  'an UNLINKED row carrying the caller''s sign-in address refuses the mint, however it is capitalized');

-- A PROVEN address (profile_emails) refuses the same way. m4 proved a second
-- mailbox; a guest row by that mailbox is a place m4 already holds.
\set m4 'a0000000-0000-4000-8000-0000000033a4'
insert into auth.users (id, email) values (:'m4', 't033-m4@test.local');
insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  (:'m4', 't033-m4@test.local', 'T033 Four', :'glasgow', 'member', now());
insert into public.profile_emails (profile_id, email) values
  (:'m4', 't033-m4-other@test.local');
insert into public.course_registrations
  (id, course, format, full_name, email, city, country, amount, currency, payment_status)
values
  ('c0330000-0000-4000-8000-000000000004', 'grace-reset', 'Part-time (4 weeks)',
   'M Four Guest', 'T033-M4-Other@test.local', 'Glasgow', 'Scotland, UK', 2500, 'gbp', 'paid');

select is(
  (select outcome from public.mint_course_handoff(:'m4', 'grace-reset')),
  'already_registered',
  'an unlinked row carrying an address the caller PROVED refuses the mint');

-- Prod rows that predate the catalog may carry course_id null after `19`'s
-- ALTER; the refusal matches the website slug too, like the app's own matcher.
update public.course_registrations
  set course_id = null
  where id = 'c0330000-0000-4000-8000-000000000004';

select is(
  (select outcome from public.mint_course_handoff(:'m4', 'grace-reset')),
  'already_registered',
  'a row with course_id null still refuses by its website slug');

-- Cancelled frees the slot for the mint exactly as it does for the unique.
update public.course_registrations
  set status = 'cancelled'
  where id = 'c0330000-0000-4000-8000-000000000004';

select is(
  (select outcome from public.mint_course_handoff(:'m4', 'grace-reset')),
  'minted',
  'a cancelled email-matched row leaves nothing behind: the member may register again');

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
