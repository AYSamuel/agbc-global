-- The custom access token hook injects server-set role/branch claims (docs/spec/02):
-- client role claims stay untrusted because ONLY this hook writes them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email)
values ('20000000-0000-4000-8000-00000000cccc', 'hooked@test.local');

insert into public.profiles (id, email, display_name, branch_id, role)
values ('20000000-0000-4000-8000-00000000cccc', 'hooked@test.local', 'Hooked',
        '00000000-0000-4000-8000-000000000003', 'leader');

select is(
  (public.custom_access_token(
     '{"user_id": "20000000-0000-4000-8000-00000000cccc", "claims": {}}'::jsonb
   ) -> 'claims' ->> 'user_role'),
  'leader', 'hook injects the profile role');

select is(
  (public.custom_access_token(
     '{"user_id": "20000000-0000-4000-8000-00000000cccc", "claims": {}}'::jsonb
   ) -> 'claims' ->> 'branch_id'),
  '00000000-0000-4000-8000-000000000003', 'hook injects the home branch');

select is(
  (public.custom_access_token(
     '{"user_id": "99999999-0000-4000-8000-000000000000", "claims": {}}'::jsonb
   ) -> 'claims' ->> 'user_role'),
  'member', 'sessions without a profile yet (pre-AUTH-3) default to member');

-- A client-supplied user_role is OVERWRITTEN, never trusted.
select is(
  (public.custom_access_token(
     '{"user_id": "20000000-0000-4000-8000-00000000cccc", "claims": {"user_role": "admin"}}'::jsonb
   ) -> 'claims' ->> 'user_role'),
  'leader', 'client-supplied role claims are overwritten by the profile truth');

select * from finish();
rollback;
