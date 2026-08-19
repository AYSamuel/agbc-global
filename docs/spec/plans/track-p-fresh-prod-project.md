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

## Phase 0 · Decide and prepare (nothing created yet) · DONE 2026-08-17

1. ~~**ADR superseding 0001**, recording the reversal and why.~~ **ADR 0023**; 0001 marked
   superseded with a note on what the audit and ADR 0017 changed.
2. ~~**Confirm the region:** `eu-central-1`, EU, as `19` §7 requires.~~ Confirmed and recorded
   in ADR 0023 for the NEW project rather than inherited from the old one.
3. **Take a final verified dump of the old project** per `restore-from-backup.md`. It becomes
   the archive of the test data and the fallback if the website move surprises us.
4. ~~**Write the `donations` migration** and its pgTAP, reviewed before anything is created.~~
   `20260817120000_the_giving_ledger_moves_house.sql` + `supabase/tests/039`, which also picks
   up the shape contract for `course_registrations`. The website's exact write path was driven
   through PostgREST against the local stack, not only through pgTAP: 201 on insert, 409 with
   `23505` on replay (the code `insertDonation` reads as "already recorded"), `42501` for
   `anon` on both read and write.
5. **Rotate `REVIEW_CODE`** for this window. The window itself, its trigger and its hard date
   (2026-09-17) are now written into `credentials.md`, before it is switched on rather than
   after; the rotation happens at Phase 2 when the secret is set.

**Also landed here, because leaving them stale is how a superseded plan gets followed:** the
fence dissolved (CI's grep guard and `supabase/fenced-objects.txt` deleted, `CLAUDE.md`'s
section rewritten as the two-shared-tables contract), and `19` §Supabase, the audit runbook's
ordered cleanup, `21` §2, `24` §1's traffic fence and `25`'s Track P section were all
annotated as historical or corrected. `02` gained the `donations` entry and `20` gained the
payment-records retention row it never had.

---

## Phase 1 · Create the project and apply · DONE 2026-08-18

**`agbc-production`, ref `mqvojrkotwwvwzsewybx`, eu-central-1, Free, Postgres 17.6.1.155.**

One thing did not go to plan and changed the order. The Free tier allows **two ACTIVE
projects per organization and the allowance spans every org where you are Owner or Admin**,
and Ayo's second slot is `monietally`, a different company's project that cannot be touched.
So a slot had to come from `agbc-app` itself. It was **PAUSED rather than deleted** (Ayo's
first instinct was to delete it): paused frees the slot identically, keeps data and
configuration restorable for a year, and costs nothing. Deletion still happens, at Phase 5,
where this plan always had it.

Two things were done first, because a paused project is exactly as unreadable as a deleted
one: the **final dump** (`nightly/agbc-prod-2026-08-17.tar.zst.age`, 542,814 bytes) and the
**test-data check**, which came back conclusive. All 16 rows are test-mode: 12 `cs_test_`
session ids across both tables, zero `cs_live_`, and the 4 donations with no session id are
not recurring gifts at all but one-per-category fixtures written on a single day
(2026-06-17) with `source = 'app'`, i.e. the retired Grace Portal app rather than the
website. So nothing was copied, and the "stop if any row looks real" branch never triggered.

**Restoring `agbc-app` needs a free active slot**, so pause `agbc-production` first. That is
the reversal path now, and it is worth knowing before you need it.

1. ~~Create the project (EU, Free).~~ Done via the management API, which sets a database
   password nobody ever sees; Ayo then set a known one through **Reset database password**.
   The ref is public and lives in `credentials.md`; the password, service-role key and
   access token are in the password manager only.
2. ~~Apply the 55 migrations plus the new `donations` one via the **manual prod deploy
   workflow**, never from a laptop (`21` §3).~~ **56 applied green** in 2m37s, after setting
   the `production` environment secrets and flipping `PROD_DEPLOYS_ENABLED`, which had
   blocked prod deploys since W0.6. Result: 40 tables, 93 functions, 90 policies, 4 cron
   jobs, 3 buckets (`sermon-audio`, `sermon-artwork`, `testimony-photos`, all empty).
3. ~~**Verify the test-data claim before discarding anything.**~~ Done before the pause; see
   above. Conclusive, and it is why nothing was copied.
4. ~~Seed **`00-common.sql` only**~~ **Done, and the trap was real**: immediately after the
   migrations, `select count(*) from public.branches` returned **0**. Every migration had
   succeeded and nobody could have finished sign-up, because the branch picker would have
   been empty. Applied as data-only DML from the versioned file (it is idempotent, upserts on
   stable ids); `10-dev-only.sql` never runs here. Verified: 4 branches (glasgow, berlin,
   emmen, ogbomosho), 8 `branch_services`, `giving_config`, `app_config`, 8
   `testimony_categories`.
5. Mirror the auth config: the custom access-token hook (**authorization is broken without
   it**), the four localized OTP templates, rate limits, TOTP for the dashboard.
   - **The hook is DONE and enabled** (Postgres, schema `public`, function
     `custom_access_token`). The migration's half was already in place:
     `supabase_auth_admin` held EXECUTE before the hook was wired.
   - **DO NOT run `supabase config push`, which this plan originally suggested.**
     `supabase/config.toml` carries `site_url = "http://127.0.0.1:3000"` and
     `additional_redirect_urls = ["https://127.0.0.1:3000"]`. Pushing them would point
     production's auth at localhost and break every redirect and email link. `23` §1 already
     warned that config push needs a reviewed diff; that warning is load-bearing rather than
     cautionary. Either do the remaining keys in the dashboard, or give `config.toml`
     per-environment handling first, deliberately.
   - **TOTP needed nothing.** New projects ship with App Authenticator already `Enabled` and
     max factors 10, matching `config.toml`, with SMS MFA disabled as we want. Checked on
     2026-08-18 rather than assumed, which is the only reason this is not still an open item.
   - **Still owed: the four localized OTP templates and the rate limits**, both of which move
     into Phase 2 because they belong with the SMTP wiring rather than beside it.

**Verify:** ~~apply green from empty~~ (56, green); ~~`branches` present~~ (4); a sign-in
reaches AUTH-3, **which Phase 2 now closes with a REAL sign-in** rather than a bypass (ADR
0023 amendment).

---

## Phase 2 · Edge functions, secrets, vault · DONE 2026-08-19

**Everything below is done.** The record of HOW, including the discovery that pulled ADR
0024's migration into this phase (the platform's stale, unrecoverable, unrotatable env copy
of the legacy service-role key), lives in that ADR's amendment and migration
`20260819100000`. Execution notes beyond the ADR:

- All nine function secrets set in one `--env-file` push (digest-verified); four
  healthchecks.io checks created (`prod-moderation-alerts` 1h, `prod-verse-monitor` 1d,
  `prod-streak-recompute` 1w, `prod-push-receipts` 15m). The brief's "two checks" dated from
  W2.7; four jobs are scheduled now and each pings on every run, no-ops included.
- Vault armed with `project_url` + `secret_key` (the `sb_secret_` default key). Verified
  live: manual `verse-monitor` invoke returned 200, then three UNPROMPTED cron ticks
  (00:07 moderation-alerts, 00:18 and 00:33 push-receipts) all 200.
- The hosted-auth audit (management API, field by field against `config.toml`) found and
  fixed three drifts: `mailer_otp_exp` 3600→600, `smtp_max_frequency` 60→30 (the app's
  resend button counts down 30s), `site_url` localhost→`https://agbcglobal.com`. All
  recorded in `credentials.md`'s hosted-settings table.
- YouTube sync ran once through the job path: 100 sermons upserted, `audio_path` null on
  all (the no-sermon-audio rule holding).
- `prod-moderation-alerts` is PAUSED in healthchecks.io: with zero admin profiles the job
  pings failure by design ("nothing can escalate"). Un-pausing is a Phase 4 item, after
  the first production admin onboards.

`supabase-deploy.yml` line 34 still reads *"`supabase functions deploy` joins here when the
first edge function lands (W1.3)"*. Nine functions later it never did, so **nothing deploys
functions anywhere**. Fixed here, not worked around.

**Reordered 2026-08-18 (ADR 0023 amendment): SMTP comes FIRST**, because whether it works
decides whether the review bypass is needed at all, and because four of the nine functions
send email and cannot be verified without it.

1. **Wire Resend as Supabase custom SMTP** on `agbc-production`, plus the four localized OTP
   templates and the rate limits carried over from Phase 1. The domain already sends
   production email for the website, so SPF and DKIM are in place: this is credentials in the
   dashboard, not DNS work.
2. **Verify with a REAL sign-in reaching AUTH-3.** This closes Phase 1's last open check.
   **The review bypass is NOT enabled on production** (ADR 0023 amendment); it stays available
   as a one-secret fallback if deliverability misbehaves, and returns for store review at W4.8.
3. ~~Add the deploy step to the workflow (prod job, manual dispatch).~~ Done, on **both** jobs,
   with no slug arguments so adding a function never becomes a third place to remember. While
   diffing the config blocks against the directories, `push-receipts` turned out to have **no
   `[functions.push-receipts]` block at all**: it shipped with W3.3 slice 4 and was the one
   function whose configuration was implicit. Added in the same change, because a default that
   happens to match is not a decision.
4. Set the secrets this phase needs: `YOUTUBE_API_KEY` (Watch is empty without a sync),
   `RESEND_API_KEY` + `ALERTS_FROM_EMAIL` (four functions send email and go silent without
   them), `DASHBOARD_URL`, the two healthchecks ping URLs, and `SENTRY_DSN` (the edge DSN
   `credentials.md` has been holding for exactly this moment). **The review-bypass trio is no
   longer on this list.**
5. ~~**Add the missing alert on successful review-bypass use.**~~ Done, and kept despite the
   bypass staying off, because it returns at W4.8 and `03` had assumed since W2.10 that this
   existed. `captureEdgeMessage` in `_shared/sentry.ts`, `REVIEW_BYPASS_ALERT` in
   `review-signin/core.ts`, and a test asserting the message names the event and nobody in it:
   no `@`, no digits at all (a rotated code is just different digits, so a substring check
   would pass while leaking the live one), and still findable by function.
6. **Arm the vault** (`project_url`, `secret_key`) so the cron schedules that arrive
   with our migrations stop no-opping (ADR 0016). Ayo pastes the key into the SQL
   editor; it does not pass through the assistant. **Amended 2026-08-19:** as written
   (with `service_role_key`) this step could never verify, and the failure pulled ADR
   0024's migration forward into this phase; the whole story is in that ADR's amendment
   and migration `20260819100000`. The vault now holds the `sb_secret_` key under
   `secret_key`, and the invoker sends it as `apikey`.
7. Run the YouTube sync once so Watch is populated.

---

## Phase 3 · Move the website · DONE 2026-08-19

The whole move: **two env vars, two tables, no storage.** It executed even smaller than
written:

1. ~~Regenerate `database.types.ts`~~ **Nothing to regenerate**: generated types from the
   new project and field-set-diffed them against the website's hand-authored file. Both
   tables (Row/Insert/Update), all three enums and `redeem_course_handoff` are IDENTICAL,
   so the website needed zero code change. The contract test (`039`) earning its keep.
2. Vercel updated: `PUBLIC_SUPABASE_URL` → the new ref; `SUPABASE_SERVICE_ROLE_KEY` →
   **a dedicated `sb_secret_` key named `website`** (per this plan's amended Phase 4.5 step
   1; minted via the management API so the value stayed out of the assistant transcript;
   supabase-js 2.108 takes it natively). The env var NAME stays: it is what the code reads.
3. Redeployed and verified against the live site: giving page renders; a test donation
   wrote a `paid` row (`cs_test_`, `source='web'`); a test registration wrote a `paid` +
   `pending` UNLINKED row (`source='website'`, `profile_id` null, exactly ADR 0017's
   admin-only state); both thank-you emails arrived.
4. The old project stays paused and untouched (Phase 5's).
5. The backup pipeline had already moved (2026-08-18: `backup.yml`'s ref-derived endpoint
   + bucket-aware assert were in place, all four secrets re-pointed, manual run green).
   The plan's warning stands recorded; nothing was left pointing at the old project.

1. In `Desktop/agbc`: regenerate `src/lib/server/database.types.ts` against the new project.
2. Update Vercel: `PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy and **verify against the live site**: the giving page loads, a test donation writes
   a row, the registration path writes a row. Twelve donations across the old project's entire
   lifetime says traffic is low enough that the switchover window is a non-issue.
4. Leave the old project running and untouched.
5. **Move the backup pipeline with the website**, in the same change, because from this moment
   the live giving data is in the new project and the nightly dump is still pointed at the old
   one. Found while executing Phase 0 (2026-08-17), not anticipated when this plan was
   written, and it is two edits plus a trap:
   - `backup.yml` **hardcodes the old ref** in `SUPABASE_S3_ENDPOINT` (line 43), and its
     `SUPABASE_PROD_DB_URL` / `SUPABASE_PROD_S3_ACCESS_KEY` / `SUPABASE_PROD_S3_SECRET_KEY`
     secrets all point at the old project. All four move together.
   - **Its storage step will FAIL against the new project**, and loudly, for the wrong
     reason: `test -n "$(find storage -type f -print -quit)"` asserts prod has at least one
     storage object, which was true when it had `avatars` and 7 objects and is false for a
     fresh project whose buckets are empty on purpose (no sermon audio, no uploads yet).
     Left alone, the first night after the move reports a broken pipeline and pings
     healthchecks FAILURE. Make the assert bucket-aware (buckets enumerated, zero objects
     allowed) rather than deleting it: its job is catching a broken enumeration, and that job
     still needs doing.
   - **Its two TABLE greps are fine, and this was measured rather than assumed** (2026-08-17,
     against the local stack): `supabase db dump --data-only --use-copy` emits
     `COPY "public"."donations"` and `COPY "public"."course_registrations"` even when both
     tables are EMPTY, so the guard that exists to catch a dump which silently lost the
     website's tables keeps working from the new project's first night. Only the storage
     assert above needs changing.
   - The last dump taken from the OLD project is the archive, so take it before repointing.

**Reversal:** put the two old env vars back and redeploy (and the backup secrets with them).

---

## Phase 4 · Point the app at production, and close W3.3

1. `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` into **EAS preview env** and the
   local `.env`. **The key is the `sb_publishable_` key, not the legacy anon** (ADR 0024,
   landed early; this step is what retires the app's last legacy-key dependency besides the
   functions' internal clients).
2. `eas build --platform android --profile preview`.
3. Install and **test the notification tap**, the one W3.3 Done criterion still open. If it
   works, the gap was a dev-client artefact and slice 4's caveat lifts. If it does not, there
   is a real bug and this is finally an environment where it can be found.
4. **Onboard the first production admin** (the break-glass checklist in `credentials.md`
   starts with mobile onboarding), then **un-pause `prod-moderation-alerts`** on
   healthchecks.io: it is paused because with zero admins the job pings failure by design.
5. **Flip `COURSE_HANDOFF_ENABLED`** on the website (Vercel env + redeploy): the flag from
   agbc-website #42, parked since 2026-08-10, waiting for an app that can mint tokens
   against production. Decided 2026-08-19 to flip here rather than at Phase 3.

---

## Phase 4.5 · Migrate to the new API keys (ADR 0024) · LANDED EARLY, 2026-08-19

**The function/job half of this phase landed during Phase 2**, because the legacy path it
was scheduled to replace turned out to be unverifiable on the new project: the platform's
provisioning-time copy of `SUPABASE_SERVICE_ROLE_KEY` in the functions' env is a different
issuance than every other surface shows, it never refreshes, and legacy keys can no longer
be rotated to reconverge them, so every cron invocation 401'd before its job code ran. The
"one variable at a time" sequencing rationale inverted with that discovery; ADR 0024's
amendment carries the evidence and the decision.

What landed: migration `20260819100000` (vault key `secret_key`, sent as `apikey`),
`verify_jwt = false` on the nine functions, `_shared/auth.ts` comparing against every key in
the `SUPABASE_SECRET_KEYS` dictionary (overlapping rotation), and an explicit apikey gate on
the two anon-callable functions.

What remains of this phase, on its original schedule:

1. Phase 3 hands the website the `sb_secret_` key (not the legacy service_role).
2. Phase 4 hands EAS the `sb_publishable_` key (not the legacy anon).
3. Only after both, and after confirming nothing else sends legacy keys, deactivate the
   legacy pair in the dashboard.

**Until step 3, do not press "Disable JWT-based API keys".** The app and the website (and
any function's INTERNAL client, which still reads the legacy env by design) authenticate
with legacy keys until their phases swap them.

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
