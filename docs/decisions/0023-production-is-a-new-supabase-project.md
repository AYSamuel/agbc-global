# 0023 · Production is a new Supabase project

Date: 2026-08-17 · Status: accepted (supersedes [0001](0001-reuse-shared-supabase-as-prod.md)) · Decider: Ayo

## Context

[ADR 0001](0001-reuse-shared-supabase-as-prod.md) chose the existing shared project
(`fotfplvqsnmbzjjhqlwp`, eu-central-1) as the app's production backend. It already served
the live church website and the retired Grace Portal app, and the argument was one project,
one bill, one backup pipeline covering the website's data too.

That decision was taken on 2026-07-13, before anyone had looked inside the project. Two
things have happened since, and between them they invert the arithmetic.

**The audit made the cost concrete** (`docs/runbooks/prod-audit-2026-07-30.md`). Reuse means
dropping, on a live project, 13 tables, 48 functions, 21 triggers, 42 policies, a view, 6
active cron jobs and a storage bucket, then reconciling our 55-migration history with the 35
migrations already recorded there. The audit also found four ordering hazards that `19` had
not anticipated, each of which fails differently and one of which (`donations`' admin policy
referencing `public.users`) fails SILENTLY under CASCADE. `19` step 3 asks for the whole
cleanup to be rehearsed on a scratch project first, which is correct and is a second full
execution of the same dangerous work.

**ADR 0017 changed the shape of the question.** `course_registrations` became ONE table
shared by the app and the website, because a guest paying on the website and a member
registering in the app are the same entity. The website is therefore no longer a neighbour
we tiptoe around in a shared project; it is a participant in our schema. Wherever that table
lives, both live, which means "move the app" and "move the website" stopped being separable
questions.

## Decision

**Production is a NEW Supabase project**, EU (`eu-central-1`), Free to begin with, and the
church website moves onto it.

1. Our 55 migrations plus one new one (`donations`) apply to it from empty.
2. The old project is **kept running and untouched** until the website is verified on the
   new one, then archived and deleted.
3. **Nothing is copied.** All existing data is test data (Ayo, 2026-08-17: the 8 auth users
   are dummy accounts, the 12 donations and 4 registrations are test records), subject to a
   check before anything is discarded, that every `stripe_session_id` in both tables is a
   test-mode id. Any row that looks real stops the phase and is copied deliberately.

Execution is `docs/spec/plans/track-p-fresh-prod-project.md`, phase by phase.

## Why

**The half of the work that disappears is the dangerous half.** Our migrations applying from
empty is not a hope: CI does exactly that on every PR that touches `supabase/`, so the
riskiest-sounding step of the new plan is the one with the most evidence behind it. What
disappears is destructive DDL against a live database, a two-history reconciliation, and a
rehearsal that exists only because nobody could afford to discover a collision live.

**The website's footprint turned out to be small, and it was measured rather than assumed.**
Two env vars, two tables, sixteen rows of test data, and no storage at all. Its client lives
in `src/lib/server/`, connects with the service-role key, and only ever INSERTs; nothing in
the repo reads a donation row. So the cost we take on in exchange for deleting the cleanup is
a `PUBLIC_SUPABASE_URL`, a `SUPABASE_SERVICE_ROLE_KEY`, and a redeploy.

**It is reversible, and the cleanup never could be.** A dropped table is gone; a redeploy is
a redeploy. Through the whole move the old project keeps running with its data intact, and
reversal is putting two env vars back.

**Issue #96 dies by construction instead of being remediated.** On the old project `anon` and
`authenticated` hold SELECT/INSERT/UPDATE/DELETE/TRUNCATE over donor names, addresses and
email, with only the absence of a policy in the way. Fixing that in place is a careful
REVOKE against a live table. On a project we build, the grant is simply never made
(`20260817120000`, asserted in `supabase/tests/039`).

**One bill became two, and that was the only real argument against.** Both projects are Free,
the overlap lasts days, and the old one is deleted at the end.

## Consequences

- **`donations` becomes ours.** It is the one table the website has that our history never
  created, so it arrives as migration `20260817120000` with a cross-repo contract test.
  Its shape comes from the website's own generated types, because those are what its code
  expects.
- **The fence dissolves.** `CLAUDE.md`'s FENCED SUPABASE OBJECTS section and the CI
  fence-guard grep both existed because those objects lived in a project we shared and could
  only damage. Both tables are now ours to create and extend. What survives the fence is a
  narrower and more useful rule: the columns the WEBSITE writes are a contract with
  `Desktop/agbc`, and that contract is now asserted in pgTAP rather than greped, which for
  the first time also covers retypes and nullability changes. `course_registrations` gains
  the same assertions, having never been fenced at all.
- **`19`'s Supabase reuse plan and the ordered cleanup in the audit runbook become
  historical.** The audit's value does not: it is why we know what the old project holds, it
  is the archive-worthy record of what is being deleted, and it is what made the cost of
  reuse concrete enough to reverse a decision. `19`'s store-identity half is untouched and
  still binding.
- **Track P's P2 to P6 are replaced** by the phases in the plan. P1 (the off-provider backup
  pipeline) stands and is unaffected.
- **The destructive-work gate loses most of its subject** and keeps the rest. There is no
  cleanup to gate; what remains destructive is deleting the OLD project, which happens only
  after the website has run on the new one for a few days and after a final dump is
  archived.
- **The traffic fence is deliberately not reinstated.** App builds will point at production
  on the Free plan (unchanged decision), because the egress risk is sermon audio and that is
  entirely within our control: no audio is uploaded to production storage, usage alerts sit
  at 80%, and past 50% egress in any month we stop and upgrade to Pro.
- **The backup pipeline has to follow the website, and it needs two changes when it does.**
  `backup.yml` hardcodes the old ref in `SUPABASE_S3_ENDPOINT`, and its
  `SUPABASE_PROD_DB_URL` / S3 key secrets point at the old project; both move at Phase 3,
  when live giving starts landing in the new project rather than before. Its storage step
  also asserts `test -n "$(find storage -type f -print -quit)"`, which was right when prod
  had the `avatars` bucket and 7 objects, and which **will fail against the new project**,
  whose buckets are empty on purpose. That assert has to become bucket-aware or be dropped
  in the same change, or the first night after the move reports a broken pipeline.
- **Two projects exist for a few days.** Nothing in the app or the website may still
  reference the old ref when it is deleted.
- **Region: `eu-central-1`, EU**, as `19` §7 and `20` require. Confirmed for the new project
  rather than inherited.
- **Review-bypass is enabled on the new project**, bounded and dated: a freshly rotated
  `REVIEW_CODE`, an expiry of 2026-09-17 or sooner (whenever Resend SMTP lands), and a new
  alert on SUCCESSFUL use, which does not exist today. Without it nobody can sign in to
  production until custom SMTP is wired, which would block verification behind a day of DNS
  work. The risk is bounded by the mechanism rather than by good intentions: one allowlisted
  address, 5 attempts per 10 minutes, fails closed on weak config, and the account it mints
  can only ever be a `member` (`review-signin/index.ts` pins the role at the profiles insert
  guard), so it can submit content that publishes nothing without moderation and read only
  its own rows.

## Alternatives considered

| Option | Verdict |
|---|---|
| Reuse the shared project (ADR 0001 as written) | Rejected: destructive DDL on a live project with four measured hazards, a two-history reconciliation, and a full rehearsal, bought in exchange for avoiding two env vars |
| New project for the app, website stays on the old one | **Rejected on ADR 0017.** `course_registrations` is one table shared by both. Splitting them means either two copies of a table whose whole point is that there is one, or the app reaching into a second project. Not viable |
| New project, and copy the old data across | Rejected: it is all test data (Ayo). The old project remains the archive regardless, and Phase 1 checks the claim against Stripe test-mode ids before anything is discarded |
| New project, delete the old one immediately | Rejected: keeping it running is what makes the move reversible, and it costs nothing on Free |
| New project (chosen) | **Chosen** |
