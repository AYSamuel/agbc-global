-- Retiring the self-service claim flow (Ayo, 2026-08-11; ADR 0017 amendment).
--
-- ADR 0017 decision 3 named three answers for the member who paid on the website under
-- one address and signed into the app under another: the automatic email match, a
-- self-service claim, and a leader linking the row by hand. The self-service claim is
-- cut. It was the only one built, and it was built backend-first: the RPCs and the
-- email-claim edge function shipped in W2.9 slice 2, the app screen never did.
--
-- This is the compensating migration the claim flow's own header described: it drops the
-- two RPCs and their ledger. profile_emails and everything that reads it SURVIVE, on
-- purpose:
--
--   * three course_registrations policies and mint_course_handoff read the proven-address
--     set through email_belongs_to_caller(), and rewriting RLS on a table holding
--     strangers' names and emails to save one empty table is a bad trade;
--   * the leader-linking tool (the third answer, still unbuilt) is the natural writer of
--     profile_emails, so the table is where a hand-linked address will land.
--
-- Until that tool exists there is NO path for the different-address member: the app shows
-- them as unregistered and they can pay twice for one course. That is understood and
-- accepted, with "email us and someone fixes the row" as the interim (docs/spec/13).
--
-- The course_registration_link_method enum keeps its 'self' value. Removing an enum value
-- in Postgres is a table rewrite, no row can carry it (nothing ever ran in any
-- environment beyond local), and the type is on a table SHARED with the live website.
--
-- DESTRUCTIVE, and deliberately unstaged. The drop is safe without a backup gate because
-- these objects have never existed outside a local stack: verified 2026-08-11 against the
-- shared project, which carries neither email_claims nor profile_emails (it still holds
-- only the retired app's schema and the website's own tables; the `19` cutover has not
-- run), and email-claim was never deployed as a function. Track P's gate is about prod,
-- and prod has nothing here to lose.
--
-- (Naming the website's tables here would trip the fence guard, which word-matches
-- supabase/fenced-objects.txt across every migration, comments included. It is right to
-- be blunt about that: the fence exists over donor PII. See the runbook for the list.)
--
-- Rollback (roll forward): re-apply 20260809203000_the_claim_flow.sql as a new migration.
-- It is self-contained, creates nothing this one keeps, and the only state lost is
-- pending claim codes, which expire in fifteen minutes anyway.

drop function if exists public.verify_email_claim(uuid, text, text);
drop function if exists public.request_email_claim(uuid, text);

-- Indexes go with the table. No policies or grants to clean up: the table was created
-- with zero of both for every API role, service_role included.
drop table if exists public.email_claims;

comment on table public.profile_emails is
  'Addresses a member has proven (ADR 0017), read by the email match on course_registrations alongside auth.users. The self-service claim that used to write it was retired 2026-08-11; the table stays for the leader-linking tool and because the registration policies read it. Empty until that tool ships. Cascades with account deletion (docs/spec/16).';
