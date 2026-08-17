# Track P · A fresh production project

Plan for standing up the app's production backend on a **new Supabase project**, moving the
church website onto it, and pointing the app at it. Written 2026-08-17 to be executed in a
**fresh session**, one phase at a time.

**This supersedes the reuse plan.** ADR 0001 chose the existing shared project as production;
that is reversed here (new ADR in Phase 0). Most of `19` §Supabase reuse plan and the whole
ordered cleanup in `docs/runbooks/prod-audit-2026-07-30.md` become historical rather than
instructions. The audit itself stays valuable: it is why we know what the old project holds.

---

## Why a new project, in one paragraph

The reuse plan required dropping 13 tables, 48 functions, 21 triggers, 42 policies, a view,
6 cron jobs and a bucket on a live project, then reconciling two migration histories, with the
rehearsal waived. A fresh project deletes that entire half of the work: our 55 migrations
apply from empty, which CI already proves on every PR touching `supabase/`. What it costs
instead is moving the website, and the website's total Supabase footprint turns out to be
**two env vars, two tables, sixteen rows of test data, and no storage at all**. That trade is
strongly in our favour, and unlike the cleanup it is reversible: the old project stays alive
until the website is verified on the new one.

---

## Decisions taken with Ayo (2026-08-17)

1. **A new project, not the shared one.** Supersedes ADR 0001.
2. **The website moves too.** Not optional: ADR 0017 made `course_registrations` a single
   table shared between the app and the website, because a guest paying on the website and a
   member registering in the app are one entity. Wherever that table lives, both live.
3. **The old project is kept until the website is verified**, then deleted. Reversal is two
   env vars.
4. **All existing data is test data** (Ayo, confirmed): the 8 auth users are dummy accounts
   and the donation and registration rows are test records. So **nothing needs copying**,
   subject to the Phase 1 check below. The old project remains the archive regardless.
5. **App builds will point at production on the Free plan.** Unchanged from the earlier
   decision, and the mitigation below is unchanged and still not optional.
6. **Review-bypass IS enabled on the new project, bounded and dated.** Without it nobody can
   sign in there until Resend SMTP is wired, which blocks Phase 1's verification and the
   notification-tap test behind a day of DNS work. The risk is bounded by the mechanism: one
   allowlisted email, a 6-digit code compared in constant time, 5 attempts per 10 minutes,
   fails closed on weak config, and the account it mints **can only ever be a `member`**
   (`review-signin/index.ts` line 7: the profiles insert guard pins the role). A fake member
   can submit content that publishes nothing without moderation, and can read only their own
   rows. Three conditions, all of which are part of the work rather than good intentions:

   - **A freshly rotated `REVIEW_CODE`** for this window (`03` already requires rotation per
     submission window).
   - **An expiry**: off as soon as Resend SMTP is live, and reviewed no later than
     **2026-09-17** regardless. Both the trigger and the date go in `credentials.md`.
   - **An alert on SUCCESSFUL use** (Phase 2). Today the function only captures on failure, so
     a successful bypass sign-in on production tells nobody. `03` assumed this landed with
     W2.10 and it did not.

---

## Keeping the website up (and inside Free's limits)

A new project is also on Free, so nothing here improves by moving. The fence exists because
of **sermon audio**, and that is entirely within our control:

| What the app pulls from Supabase | Egress reality |
|---|---|
| Sermon **video** | **Zero.** It streams from YouTube, not Supabase (`08`) |
| Sermon **audio** (~5.6 MB per file) | The whole risk. `sermon-audio` is PRIVATE and `audio_path` is dashboard-written; the sync never writes it (`20260814120000`) |
| Artwork, testimony photos | Kilobytes (dev artwork is 27 KiB) |
| API reads | JSON, negligible for a handful of testers |

**Rule for this phase: no sermon audio is uploaded to production storage.** Audio-only
playback then does not exist there, which is a state `08` already handles (the toggle is
absent with a tooltip, not broken). Plus: **usage alerts at 80%** on egress, database size and
storage (`21` §6.6 asks for this and it has never been set); a ceiling on testers, since
Founding Members runs on Pro or not at all (`24`); and a written trigger, **past 50% egress in
any month, stop and upgrade to Pro.**

---

## What already exists, and what has to be written

Checked while planning, not assumed:

- **Our 55 migrations apply from empty.** CI does exactly this on every PR.
- **`course_registrations` is created by our own history** (`20260809202000` line 36),
  including the app's additive columns and the three enums. Nothing to import.
- **`donations` is not in our schema at all** (`grep` over `supabase/migrations` finds
  nothing). **This is the one new migration this plan requires.**
- **The website needs no storage**, and connects only with the service-role key, so RLS is
  never in its path.

### The `donations` migration

Source of truth for its shape is the website's own generated types
(`Desktop/agbc/src/lib/server/database.types.ts`), because those are what its code expects.
Nineteen columns: `id`, `created_at`, `donor_name`, `email`, `amount`, `currency`,
`frequency`, `branch`, `stripe_session_id`, `stripe_subscription_id`, `stripe_invoice_id`,
`payment_status`, `gift_aid_eligible`, `donor_address`, `user_id`, `giving_type`,
`reference`, `stripe_payment_intent_id`, `source`.

Write it **better than the original**, since we own it now:

- Keep the unique constraints the website's idempotency depends on (`stripe_session_id`,
  `stripe_payment_intent_id`, `stripe_invoice_id`; the old project had `donations_pi_uniq`,
  `donations_session_uniq`, `donations_stripe_invoice_id_key`).
- `FORCE ROW LEVEL SECURITY` with **zero client policies**. The website uses service-role and
  bypasses RLS, so it needs none, and this is where issue #96's fragility dies by
  construction: on the old project `anon` held INSERT/UPDATE/DELETE/TRUNCATE over donor PII
  with only the absence of a policy protecting it. Here `anon` and `authenticated` are
  granted nothing at all.
- `user_id` references `auth.users` **`on delete set null`**, the fix for the trap that made
  the old project's user deletion impossible.
- Any admin read path comes later, against `public.profiles` and never `public.users`.
- pgTAP asserting the grants and that no client role can read a donor row.
- `CLAUDE.md`'s FENCED SUPABASE OBJECTS section and the fence-guard CI check need
  **rewriting rather than re-pointing**: the fence dissolves, because both tables become ours.

---

## Phase 0 · Decide and prepare (nothing created yet)

1. **ADR superseding 0001**, recording the reversal and why.
2. **Confirm the region:** `eu-central-1`, EU, as `19` §7 requires.
3. **Take a final verified dump of the old project** per `restore-from-backup.md`. It becomes
   the archive of the test data and the fallback if the website move surprises us.
4. **Write the `donations` migration** and its pgTAP, reviewed before anything is created.
5. **Rotate `REVIEW_CODE`** for this window, and put the bypass's trigger and expiry
   (2026-09-17) into `credentials.md` before it is switched on, not after.

---

## Phase 1 · Create the project and apply

1. Create the project (EU, Free). Record ref, URL, anon key and service-role key in the
   password manager and `credentials.md`. **Never in git**, and never opened in an editor
   (see the `never-open-credential-files` lesson: the FCM key leaked exactly that way).
2. Apply the 55 migrations plus the new `donations` one via the **manual prod deploy
   workflow**, never from a laptop (`21` §3).
3. **Verify the test-data claim before discarding anything:** in the old project, check that
   every `donations.stripe_session_id` and `course_registrations.stripe_session_id` is a
   test-mode id (`cs_test_…`). If all are, create the new tables empty and copy nothing. **If
   any row looks real, stop and copy it deliberately with Ayo's confirmation.**
4. Seed **`00-common.sql` only**; `10-dev-only.sql` never runs on production. Without
   `branches`, nobody can finish sign-up: the picker is empty and onboarding cannot complete.
   This is the step most easily forgotten, because the migrations succeed without it.
5. Mirror the auth config (`supabase config push`, reviewing which keys are
   per-environment): the custom access-token hook (**authorization is broken without it**),
   the four localized OTP templates, rate limits, TOTP for the dashboard.

**Verify:** apply green from empty; `branches` present; a sign-in reaches AUTH-3.

---

## Phase 2 · Edge functions, secrets, vault

`supabase-deploy.yml` line 34 still reads *"`supabase functions deploy` joins here when the
first edge function lands (W1.3)"*. Eleven functions later it never did, so **nothing deploys
functions anywhere**. Fixed here, not worked around.

1. Add the deploy step to the workflow (prod job, manual dispatch).
2. Set the secrets this phase needs: `YOUTUBE_API_KEY` (Watch is empty without a sync), the
   review-bypass trio **with a freshly rotated code**, `SENTRY_DSN` (the edge DSN
   `credentials.md` has been holding for this cutover), and the alert/contact addresses.
3. **Add the missing alert on successful review-bypass use.** `review-signin` currently
   captures only on failure, so a successful bypass sign-in on production is invisible. One
   `captureEdgeMessage`-style call plus a deno test asserting it fires, and asserting it still
   logs no address and no code (docs/spec/20).
4. **Arm the vault** (`project_url`, `service_role_key`) so the cron schedules that arrive
   with our migrations stop no-opping (ADR 0016).
5. Run the YouTube sync once so Watch is populated.

---

## Phase 3 · Move the website

The whole move: **two env vars, two tables, no storage.**

1. In `Desktop/agbc`: regenerate `src/lib/server/database.types.ts` against the new project.
2. Update Vercel: `PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy and **verify against the live site**: the giving page loads, a test donation writes
   a row, the registration path writes a row. Twelve donations across the old project's entire
   lifetime says traffic is low enough that the switchover window is a non-issue.
4. Leave the old project running and untouched.

**Reversal:** put the two old env vars back and redeploy.

---

## Phase 4 · Point the app at production, and close W3.3

1. `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` into **EAS preview env** and the
   local `.env`.
2. `eas build --platform android --profile preview`.
3. Install and **test the notification tap**, the one W3.3 Done criterion still open. If it
   works, the gap was a dev-client artefact and slice 4's caveat lifts. If it does not, there
   is a real bug and this is finally an environment where it can be found.

---

## Phase 5 · Retire the old project

Only after the website has run on the new project for a few days with no surprises. Final dump
archived first, then delete. Nothing in the app or the website may still reference the old ref.

---

## Who does what

**Ayo:** creating the project; Vercel env vars; the Supabase dashboard work (usage alerts,
auth config review); the review-bypass call; confirming before any row is discarded; deleting
the old project when the time comes.

**Claude:** the `donations` migration and its tests; the workflow fix; the deploy runs; the
verification after each phase; the doc corrections; and stopping when a check fails.

---

## Open decisions

**None blocking.** Review-bypass was settled on 2026-08-17 (decision 6). Resend SMTP remains
owed before real sign-ins either way (`24` row 12), and wiring it is what ends the bypass
window.

## Docs this rewrites

ADR 0001 (superseded), `19` (most of the reuse plan becomes historical), `21` §2 (there is no
separate dev project, and production is a project we own outright), `24`'s traffic-fence line
(annotated with the decision, not deleted), `25`'s Track P wording, `CLAUDE.md`'s FENCED
SUPABASE OBJECTS section (the fence dissolves), the fence-guard CI check,
`supabase-deploy.yml`, and `credentials.md` (the new project's keys, secrets, alerts, and the
review-bypass window).
