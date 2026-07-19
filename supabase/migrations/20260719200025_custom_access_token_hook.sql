-- Custom Access Token hook (docs/spec/02): injects user_role + branch_id claims
-- server-side so RLS policies never trust client-supplied role claims. Enabled in
-- supabase/config.toml locally; the hosted dashboard config mirrors it at Track P
-- (runbook note in docs/runbooks/credentials.md).
--
-- Caveat (docs/spec/02): a demoted leader keeps stale claims until token refresh, so
-- moderation-plane actions must re-check profiles.role from the table.

create function public.custom_access_token(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  profile record;
begin
  select p.role, p.branch_id
    into profile
    from public.profiles p
    where p.id = (event ->> 'user_id')::uuid;

  if found then
    claims := jsonb_set(claims, '{user_role}', to_jsonb(profile.role::text));
    claims := jsonb_set(claims, '{branch_id}', to_jsonb(profile.branch_id::text));
  else
    -- Session exists but AUTH-3 has not created the profile yet (docs/spec/03).
    claims := jsonb_set(claims, '{user_role}', to_jsonb('member'::text));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only the auth service may call the hook; it also needs to read profiles past RLS.
grant execute on function public.custom_access_token(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token(jsonb) from authenticated, anon, public;
grant select on public.profiles to supabase_auth_admin;

create policy "auth admin reads profiles for the token hook"
  on public.profiles for select
  to supabase_auth_admin
  using (true);
