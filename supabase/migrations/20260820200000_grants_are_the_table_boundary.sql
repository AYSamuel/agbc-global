-- Take back the ambient grants nobody asked for (found in W3.5 slice 5a, 2026-08-20).
--
-- Supabase's project bootstrap carries `alter default privileges in schema public grant all
-- on tables to anon, authenticated, service_role`. Every table created before this repo
-- started writing its grants out therefore holds, for BOTH API roles:
--
--   relacl -> anon=arwdDxtm/postgres  authenticated=arwdDxtm/postgres
--
-- which is INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN.
-- `20260719200021` said "never rely on ambient default-privilege bootstrap" and then granted
-- SELECT on top of it, which is the half of that sentence that was missing: AN EXPLICIT
-- GRANT DOES NOT DISPLACE AN AMBIENT ONE. It was found the hard way, when slice 5a's new
-- column grants on `branches` changed nothing at all and the pgTAP file that should have
-- caught a direct write to `status` caught nothing.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS AND WAS NOT AT RISK, because the honest version matters here
-- ---------------------------------------------------------------------------
-- NOTHING WAS OPEN. Every one of these tables has FORCE RLS and a policy set that is
-- correct, so a write with no matching policy was refused however wide the grant. And the
-- one privilege RLS genuinely cannot filter, TRUNCATE, is not reachable through PostgREST:
-- it issues SELECT, INSERT, UPDATE, DELETE and function calls, and nothing else. A client
-- holding the publishable key authenticates to PostgREST, never to Postgres.
--
-- What WAS wrong is that RLS was the only boundary on tables this repo's own convention says
-- should have two ("RLS is the row boundary; GRANTs are the table boundary",
-- 20260719200021), and ~/.claude/standards/security.md's least privilege and defense in
-- depth both name that as the thing to avoid: every control assumes another has already
-- failed. A permissive policy written in the future widens exactly as far as the grant
-- allows, and here that was everything.
--
-- ---------------------------------------------------------------------------
-- HOW THE TARGET STATE WAS DERIVED
-- ---------------------------------------------------------------------------
-- Not from taste: from each table's OWN POLICY SET, read out of `pg_policies`. A grant is
-- what makes a policy reachable, so the rule is "grant exactly the commands this table has
-- policies for, to exactly the roles those policies serve". Nothing designed is lost, and
-- the two lists cannot drift, because a future capability arrives as a policy and the policy
-- is visibly unreachable without its grant.
--
--   app_config    · SELECT to both; a/r/w/d to authenticated  ("admins manage app config")
--   daily_verses  · SELECT to both; a/r/w/d to authenticated  ("admins manage daily verses")
--   giving_config · SELECT to both; a/r/w/d to authenticated  ("admins manage giving config")
--   sermons       · SELECT to both; a/r/w/d to authenticated  ("admins manage sermons")
--   devices       · authenticated only, a/r/w/d               (four own-row policies)
--   playback_positions · authenticated only, a/r/w/d          ("members own their ...", ALL)
--   notification_prefs · authenticated only, r/w              (SELECT and UPDATE, and no
--                        more: the row is created by `create_notification_prefs`, which is
--                        SECURITY DEFINER, so the member never needs INSERT. Verified in the
--                        catalogue rather than assumed, because a trigger that ran as the
--                        INVOKING role WOULD need it and would fail 42501 at sign-up.)
--   profiles      · authenticated only, a/r/w                 (INSERT, SELECT, UPDATE
--                        policies; deliberately NO DELETE, because `16` deletes an account
--                        by soft-deleting through the deletion job and nulling the email)
--
-- `anon` keeps SELECT on the four public-content tables and loses everything else: it has no
-- policy on `devices`, `notification_prefs`, `playback_positions` or `profiles`, so it held
-- eight privileges on four tables it can reach no row of.
--
-- `service_role` keeps `all`, granted EXPLICITLY here so it stops being ambient too. It is
-- the trusted key, it bypasses RLS by design, and every correctly-granted table in this
-- schema already says `grant all ... to service_role` in its own migration.
--
-- `supabase_auth_admin`'s SELECT on `profiles` is untouched: it is the custom access token
-- hook's read, granted deliberately in 20260719200022, and revoking it would break sign-in.
--
-- THE THREE VIEWS carry the same ambient grants and get the same treatment. One of them
-- matters more than the other two: `moderation_queue` is `security_invoker = true`, so
-- `anon` holding SELECT on it was only ever held back by `testimonies` granting `anon`
-- nothing. That is one accident away from being pending Art. 9 disclosures (docs/spec/20),
-- and it is exactly the "another control has already failed" case.
--
-- Rollback (roll forward): a compensating migration re-grants `all` to `anon` and
-- `authenticated` on these eleven objects. Nothing legitimate needs it, and `048` would go
-- red the moment it happened, which is the point.

begin;

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Public content: everyone reads, admins keep
-- ---------------------------------------------------------------------------

revoke all on public.app_config, public.daily_verses, public.giving_config, public.sermons
  from anon, authenticated;

grant select on public.app_config, public.daily_verses, public.giving_config, public.sermons
  to anon, authenticated;

-- Reachable only through the "admins manage ..." policies, which read authority from the
-- live table. A member holds the privilege and matches no policy, which is the ordinary
-- shape of every table here.
grant insert, update, delete
  on public.app_config, public.daily_verses, public.giving_config, public.sermons
  to authenticated;

grant all on public.app_config, public.daily_verses, public.giving_config, public.sermons
  to service_role;

-- ---------------------------------------------------------------------------
-- Member-owned rows: no guest has any business here
-- ---------------------------------------------------------------------------

revoke all on public.devices, public.playback_positions from anon, authenticated;
grant select, insert, update, delete on public.devices, public.playback_positions
  to authenticated;
grant all on public.devices, public.playback_positions to service_role;

-- Read and change your own preferences. INSERT is deliberately absent: the row arrives with
-- the profile, from a SECURITY DEFINER trigger.
revoke all on public.notification_prefs from anon, authenticated;
grant select, update on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;

-- Create your profile at AUTH-3, read it, change the parts `profiles_guard` allows. No
-- DELETE for anybody but the service role: an account is closed by the deletion job (`16`),
-- and a member who could DELETE their own row would take their content's author with it.
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- The views
-- ---------------------------------------------------------------------------
-- SELECT only, for the readers each one is for. `moderation_queue` runs as its INVOKER, so
-- this is a real boundary rather than tidying: the queue holds unreviewed disclosures.

revoke all on public.moderation_queue, public.prayer_feed, public.testimony_feed
  from anon, authenticated;

grant select on public.moderation_queue to authenticated;
grant select on public.prayer_feed, public.testimony_feed to anon, authenticated;
grant all on public.moderation_queue, public.prayer_feed, public.testimony_feed
  to service_role;

-- ---------------------------------------------------------------------------
-- And stop the bootstrap handing the next table the same thing
-- ---------------------------------------------------------------------------
-- The default privileges themselves, not just their output. Without this, every table a
-- future migration creates starts life with `arwdDxtm` for both API roles again, and this
-- file becomes something somebody has to remember to repeat.
--
-- Scoped to the grantor the bootstrap used, and only to the one we own. `pg_default_acl`
-- holds TWO entries for public tables, one for role `postgres` and one for role
-- `supabase_admin`, and which applies depends on who runs the CREATE TABLE. Migrations run
-- as `postgres`, so that is the one that has ever mattered here. `supabase_admin`'s is
-- platform-owned and deliberately untouched: altering another role's default privileges
-- needs rights over that role, and a hosted deploy would be refused mid-migration.
--
-- Roles keep the grants they were given above; this only changes what the NEXT `create
-- table` hands out. Every migration since W1 already writes its grants explicitly, so
-- nothing in the repo depends on the bootstrap; a future one that forgets now fails loudly
-- at its first query rather than quietly over-granting.
--
-- Deliberately left alone for `service_role`: it is meant to reach every table, and a new
-- table that silently excluded the jobs would fail at 3am rather than in review.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

commit;
