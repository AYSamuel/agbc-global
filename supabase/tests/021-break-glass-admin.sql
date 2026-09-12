-- The break-glass admin, and the audit attribution defect that adding it exposed
-- (ADR 0015, decided 2026-07-30).
--
-- The interesting test in this file is 3. `015` proves the bootstrap promotion WORKS; nothing
-- proved it was recorded HONESTLY, because `015` predates the audit table (PR #104 landed after
-- it) and `019` only ever asserted attribution for an ordinary role change, where auth.uid() is
-- genuinely the actor. Measured before the fix: the promotion wrote actor_id = target_id, so the
-- log described the most sensitive grant in the system as a self-promotion.
--
-- VERIFIED NON-VACUOUS, 2026-07-30: reverting profiles_audit to the PR #104 definition (actor
-- taken straight from auth.uid()) turns test 4 red and leaves every other test green. Run before
-- claiming the fix, because a null-versus-uuid assertion is exactly the kind that can pass for
-- the wrong reason.
--
-- That result is worth reading carefully, because it is the shape of the whole bug: test 3 stays
-- GREEN against the broken code. The promotion always worked. Only the record of who authorised
-- it was wrong, and a suite that checked behaviour without checking attribution had nothing to
-- say about it. Test 7 is the counterweight, and it also stays green either way, which is how it
-- proves the fix is narrow rather than a blanket "credit nobody".
--
-- THE IDENTITY CHANGED HANDS 2026-09-11 (`20260911120000`): out `oami.gospel@gmail.com`, in
-- `agbc.noreply@gmail.com`, on Ayo's decision. Tests 3 to 7 still run and still matter, because
-- what they prove is the MECHANISM: an allowlisted address is promoted on signup, and that
-- promotion is credited to the server rather than to the person receiving it. The incoming
-- admin depends on both. They now run against a fixture address of this file's own making,
-- because using the live one quietly coupled "does the mechanism work" to "who is an admin
-- today", and the swap is what exposed that coupling.
--
-- Tests 1 and 8 are the ones that had to change, and they are the reason this file had to be
-- opened at all: pinning the allowlist as an exact set is what makes changing who holds admin a
-- deliberate act that has to come past a review, rather than a quiet one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- --- the allowlist ---------------------------------------------------------------------

-- The urgent half of the swap. `bootstrap_admins` sits outside `profiles`' cascade, so erasing
-- that account on 2026-09-11 did NOT remove its licence: until the migration ran, anyone
-- signing up with the old address was promoted straight back to admin.
select is(
  (select count(*)::int from public.bootstrap_admins
    where email = 'oami.gospel@gmail.com'),
  0, 'the outgoing address is off the allowlist, so a re-signup cannot re-promote it');

-- The primary key check is `email = lower(email)`, so a mixed-case row cannot exist and the
-- allowlist cannot hold the same identity twice in different cases. Asserted because the
-- promotion matches case-insensitively and a capital letter here would be silent.
select is(
  (select count(*)::int from public.bootstrap_admins where email <> lower(email)),
  0, 'and every allowlisted address is stored lowercase, as the primary key check requires');

-- --- the grant is recorded as server-owned, not self-inflicted -------------------------
-- Created exactly the way AUTH-3 creates it: the member's own row, under their own uid, with
-- role pinned to member by the INSERT policy. The promotion then happens on top of that row.

-- A fixture address, allowlisted by this test rather than by production. Before the retirement
-- these tests used the live break-glass address, which quietly coupled "does the mechanism
-- work" to "who is an admin today"; the first thing the retirement broke was that coupling.
insert into public.bootstrap_admins (email, note)
values ('t021-bootstrap@test.local', 'Fixture for 021: exercises the bootstrap promotion.');

insert into auth.users (id, email) values
  ('b0000000-0000-4000-8000-0000000000a1', 't021-bootstrap@test.local');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "member"}';

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at)
values ('b0000000-0000-4000-8000-0000000000a1', 't021-bootstrap@test.local', 'Bootstrap Fixture',
        '00000000-0000-4000-8000-000000000001', 'member', now());

reset role;
reset request.jwt.claims;

select is(
  (select role::text from public.profiles
    where id = 'b0000000-0000-4000-8000-0000000000a1'),
  'admin', 'signing in with an allowlisted address promotes the account');

-- THE FIX. Null is the table's documented value for a server-owned action, and a migration
-- handing out a role is server-owned: the allowlist in git authorised this, not the person who
-- happened to sign in. is() rather than isnt(), so a future change that puts SOME other uuid
-- here fails too, not only one that puts the subject's back.
select is(
  (select actor_id from public.privileged_actions
    where target_id = 'b0000000-0000-4000-8000-0000000000a1'
      and action = 'role_changed'),
  null,
  'and the audit row credits the server, never the person being promoted');

select is(
  (select before || after from public.privileged_actions
    where target_id = 'b0000000-0000-4000-8000-0000000000a1'
      and action = 'role_changed'),
  jsonb_build_object('role', 'admin'),
  'with both sides of the change still recorded (member to admin, merged here)');

select is(
  (select count(*)::int from public.privileged_actions
    where target_id = 'b0000000-0000-4000-8000-0000000000a1'),
  1, 'exactly one row: onboarding a member writes no branch row, and the promotion writes one');

-- --- the fix is narrow ------------------------------------------------------------------
-- An ordinary role change must still name the human who made it. This is the assertion that
-- stops the fix above from being applied too widely, which would be a worse bug than the one
-- it repairs: an audit log that credits nobody for anything.

insert into auth.users (id, email) values
  ('b0000000-0000-4000-8000-0000000000a2', 't021-target@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at)
values ('b0000000-0000-4000-8000-0000000000a2', 't021-target@test.local', 'T021 Target',
        '00000000-0000-4000-8000-000000000002', 'member', now());

set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

update public.profiles set role = 'leader'
 where id = 'b0000000-0000-4000-8000-0000000000a2';

select is(
  (select actor_id from public.privileged_actions
    where target_id = 'b0000000-0000-4000-8000-0000000000a2'
      and action = 'role_changed'),
  'b0000000-0000-4000-8000-0000000000a1'::uuid,
  'an ordinary role change still names the admin who made it: the fix touched only bootstrap');

reset request.jwt.claims;

-- --- what this actually bought, and what it cannot assert --------------------------------
-- The first version of this test asserted "two live admins exist" and failed, correctly. That
-- is NOT a property of the schema: a profile exists only once its human signs in, and Ayo's own
-- account has no row in a freshly reset database. Asserting it would have been asserting ambient
-- data, and it would have started passing or failing based on who had last logged into the local
-- stack. The migration's own header states the operational precondition instead.
--
-- What the migration DOES guarantee is the allowlist, so that is what is pinned, as an exact set
-- rather than a count. Adding or removing an admin grant is then a deliberate change that has to
-- come past this assertion, which is the same reasoning as the grant-count tests in `019`.
-- The live set, minus this file's own fixture row, which is inserted above and is not a grant
-- anybody holds. Still exactly two identities after the swap, so the erasure lockout keeps a
-- second key and broadcasts keep a second approver (`17`); what changed is WHICH address holds
-- the second one. Asserted as an exact set rather than a count, so that both adding a grant and
-- swapping one have to come past this line.
select is(
  (select string_agg(email, ',' order by email) from public.bootstrap_admins
    where email <> 't021-bootstrap@test.local'),
  'agbc.noreply@gmail.com,aysamuel007@gmail.com',
  'the allowlist grants admin to exactly two identities, the second one now the new break-glass address');

select * from finish();
rollback;
