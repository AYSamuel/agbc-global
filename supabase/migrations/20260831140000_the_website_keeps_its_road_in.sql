-- The service key's road into the tables that were still inheriting it.
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
-- builds a database whose bootstrap does NOT leave `service_role` holding these tables, so
-- every service-key write there fails with `permission denied`, while the same suite passes
-- locally on a newer CLI that does. The dashboard's W4.0 tests were the first code to insert
-- a registration with the service key and so the first to notice. An ambient grant is not a
-- grant this repo owns: it varies by the version of a tool nobody pinned on purpose.
--
-- AND IT IS NINE TABLES, NOT ONE. Fixing `course_registrations` alone moved the error to
-- `courses`, because the insert trigger resolves `course_id` from the website's slug and
-- reads that table as the caller. Rather than discover the rest one CI run at a time, every
-- table still relying on the bootstrap is granted here. The list was derived by parsing
-- every grant and revoke in the migration history rather than by eye, and it excludes the
-- four tables deliberately DENIED to `service_role` (`bootstrap_admins`,
-- `privileged_actions`, `branch_change_requests`, `course_handoff_tokens`), which stay
-- denied: a leaked key must not be able to forge an audit row or a branch move.
--
-- Two of these matter well beyond the tests. `job_leases` and `job_alerts` are what EVERY
-- scheduled job writes with the service key (ADR 0016: take a lease, release it, ping), so
-- an environment built fresh from this history without them would have a cron fleet that
-- fails at 3am, which is exactly the failure `20260820200000` said it was leaving
-- `service_role` alone to avoid.
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

-- ONLY the service_role line, on each. Every one of these tables already has its
-- `anon` / `authenticated` boundary set correctly by the migration that created it, and
-- `032` and `048` assert those matrices; restating them here would put a second copy of a
-- list another migration owns, and a re-grant that silently dropped a column somebody added
-- in between is a real way to break the app while looking tidy.
--
-- The website's two, where `service_role` is the Stripe webhook's identity:
grant all on public.course_registrations to service_role;
grant all on public.courses, public.course_fees_regional to service_role;

-- The jobs' two, where it is every cron run's identity:
grant all on public.job_leases, public.job_alerts to service_role;

-- The rest, reached by edge functions and by the deletion and reconcile jobs:
grant all on public.attendance, public.course_interest, public.milestones,
  public.profile_emails, public.streaks
  to service_role;

commit;
