-- The website's road into `course_registrations`, written down instead of inherited.
--
-- WHAT WAS WRONG. `20260809202000` revoked everything from `anon` and `authenticated` and
-- granted back the per-column SELECT and the one UPDATE the app needs. It never granted
-- anything to `service_role`, because it did not have to: Supabase's bootstrap
-- (`alter default privileges ... grant all on tables to ... service_role`) had already
-- handed the new table `arwdDxtm`, so the website's Stripe webhook could INSERT and nobody
-- noticed the grant was ambient rather than ours.
--
-- `20260817120000` did it properly eight days later, for the other table the same webhook
-- writes: `grant all on public.donations to service_role`, by name. And `20260820200000`
-- wrote the rule down ("Every migration since W1 already writes its grants explicitly, so
-- nothing in the repo depends on the bootstrap") while this one table went on depending on
-- it. This migration makes that sentence true.
--
-- HOW IT SURFACED, which is the part worth keeping. CI's pinned Supabase CLI (2.110.0)
-- builds a database whose bootstrap does NOT leave `service_role` holding this table, so
-- every service-key INSERT there fails with `permission denied for table
-- course_registrations`, while the same suite passes locally on a newer CLI that does. The
-- dashboard's W4.0 tests were the first code to insert a registration with the service key
-- and so the first to notice. An ambient grant is not a grant this repo owns: it varies by
-- the version of a tool nobody pinned on purpose.
--
-- WHY IT MATTERS BEYOND THE TESTS. This is one of THE TWO SHARED TABLES (`02`, ADR 0017).
-- `Desktop/agbc`'s Stripe webhook INSERTs here with the service key, on its own release
-- schedule, with no compile step between the two repos, and the failure is one-sided in the
-- way `20260817120000`'s header spells out: a refused INSERT is not a validation message
-- anybody sees, it is somebody who has been charged with no record of it and no
-- confirmation. Production works today, so this is a latent inconsistency rather than an
-- outage; what it removes is the chance that a project built fresh from this history comes
-- up without the road in.
--
-- Idempotent by nature: granting a privilege that is already held changes nothing, so this
-- is a no-op wherever the bootstrap already did the right thing.
--
-- Rollback (roll forward, per the database standard): a compensating migration revokes it,
-- which would stop the website writing and is therefore never the right answer on its own.

begin;

set local lock_timeout = '3s';

-- ONLY the missing line. The `anon` / `authenticated` boundary on this table is already
-- exactly right (revoked wholesale in `20260809202000`, then per-column SELECT and
-- UPDATE(status) granted back, plus `set_aside_at` in `20260831120000`), and `032` asserts
-- that grant matrix column by column. Restating it here would put a second copy of a list
-- one migration already owns, and a re-grant that silently dropped a column somebody added
-- in between is a real way to break the app while looking tidy.
--
-- `service_role` is the website's identity here exactly as it is on `donations`, and it is
-- the only role with a road in: no client role holds INSERT, and nothing deletes a payment
-- record.
grant all on public.course_registrations to service_role;

commit;
