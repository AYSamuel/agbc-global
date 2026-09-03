# Credentials & Account Inventory

The bus-factor register from `docs/spec/21-OPERATIONS.md` §7: every account the product depends on, who owns it, who the second owner is, and what pays for it. NO secret values ever live in this file; secret locations are mapped in `docs/spec/23-VERSION-CONTROL.md` §2 (password manager, EAS credentials, `supabase secrets set`, GitHub Actions secrets).

Status: skeleton seeded at W0.2 (2026-07-18). Rows marked TBC get filled as accounts are touched; second owners are the open bus-factor action.

| Account | Purpose | Owner | Sign-in method | Second owner | Billing | Notes |
|---|---|---|---|---|---|---|
| Apple Developer (church) | iOS distribution | Church Account Holder (name TBC) | Apple Account | n/a (Ayo joining as Admin, invite pending) | Fee waiver, re-confirmed annually by Account Holder | Last shipped iOS build: 1.0.0 (19) |
| Google Play Console | Android distribution | Ayo | Google account | TBC | $25 one-off, paid | Highest versionCode 19; App Signing SHA-256 recorded in `docs/spec/19` |
| GitHub `AYSamuel/agbc-global` | Repo, CI | Ayo | GitHub + MFA | TBC (ADR 0012: personal account, second owners via collaborators) | Free | Identity for the OAuth sign-ins below; recovery codes in password manager |
| Supabase org | Production (app + website) | Ayo | TBC | Church officer TBC | Free (Pro before public launch) | **Production is `agbc-production`, ref `mqvojrkotwwvwzsewybx`, eu-central-1, created 2026-08-17 (ADR 0023, Track P Phase 1).** The ref is a public identifier and lives here; **the database password, the service-role key and the personal access token are secrets and live in the password manager only, NEVER in git and never opened in an editor** (see the FCM leak below: the vector was the editor, not git, and the service-role key is full database access). The project was created through the management API, which sets a password nobody sees, so the database password is whatever the dashboard reset produced. **The OLD shared project `fotfplvqsnmbzjjhqlwp` is PAUSED as of 2026-08-17** (its slot was needed: the Free plan allows two ACTIVE projects and the other one belongs to a different company). Paused means data and configuration intact and restorable for up to a year, but unreachable meanwhile, so its final archive is `nightly/agbc-prod-2026-08-17.tar.zst.age` in B2, taken minutes before the pause. Restoring it would need a free active slot, so pause `agbc-production` first. It is deleted for good at Phase 5. No separate dev project was ever created and none is planned. Auth settings that live in `supabase/config.toml` locally are mirrored per hosted project BY HAND, **never with `supabase config push`**: that file's `site_url` and `additional_redirect_urls` are `127.0.0.1:3000`, and pushing them would point production's auth at localhost and break every redirect and email link (`23` §1's warning, which turns out to be load-bearing). State on `agbc-production`: **custom access token hook DONE 2026-08-18** (Postgres, `public.custom_access_token`; authorization is broken without it). **TOTP needed nothing**: new projects ship with App Authenticator already `Enabled` and max factors 10, matching `config.toml`, with SMS MFA disabled as we want (checked 2026-08-18, not assumed). **The templates, SMTP, OTP length and the hook are all done; see "Hosted auth settings that NOTHING in the repo carries" below, which is the checklist for the next project.** **API keys: the function/job path runs on the NEW keys since 2026-08-19** (ADR 0024 pulled forward at Phase 2: the vault holds the `sb_secret_` key as `secret_key`, sent as `apikey`; the platform's provisioning-time env copy of the legacy service_role key turned out to be a different, unrecoverable issuance, legacy keys can no longer be rotated, so the legacy job path was dead on arrival; evidence in the ADR's amendment). **Both swaps have landed (2026-08-19): the website sends `sb_secret_` (Phase 3) and the app's preview build sends `sb_publishable_` (Phase 4, verified on the device).** Never press **"Disable JWT-based API keys"** even so: every function's INTERNAL client still reads the platform-provisioned legacy env by design (ADR 0024), so disabling the legacy pair still breaks all nine functions until those clients are moved onto `sb_secret_` as their own deliberate change. **Named `sb_secret_` keys on the project (2026-08-19): `default`** (the vault's `secret_key`, drives the four cron jobs) **and `website`** (Vercel's `SUPABASE_SERVICE_ROLE_KEY` value since Phase 3; minted via the management API so the value never entered an assistant transcript; id `e5f063ba`). One key per consumer, so a leak rotates one surface, not both. Values in the password manager |
| Google Cloud / Firebase `agbc-app` | FCM push credentials + app YouTube key | Ayo | Google account | TBC | Free (Spark) | Old Grace Portal project; Android app `com.oami.agbcapp` registered; FCM V1 key + YouTube key in password manager (2026-07-18). `google-services.json` is untracked (gitignored) and supplied to EAS via the `GOOGLE_SERVICES_JSON` file secret; local dev keeps its own copy. Android API key regeneration + restriction tracked below (2026-07-25 public-leak alert) |
| Google Cloud `agbc-website` | Website's YouTube key ONLY | Ayo | Google account | TBC | Free | Never share key strings with the app (rotation + quota isolation) |
| Meta Business portfolio | WhatsApp broadcasts (Phase 3) | Ayo (portfolio TBC, month 1) | Facebook profile | TBC | Free; per-conversation broadcast costs | Verification needs incorporation cert + utility bill |
| Resend | Auth OTP email + transactional (via website account) | Ayo | TBC (website account) | TBC | Free tier (3k/month) | Custom SMTP live on `agbc-production` since 2026-08-18 (sender `auth@agbcglobal.com`); localized OTP templates mirrored per the checklist below. **Two API keys since 2026-08-19: the website's, and `agbc-app-edge`** (sending-only, domain-scoped, the `RESEND_API_KEY` function secret), so either surface rotates without the other. `alerts@agbcglobal.com` routes inbound via Cloudflare (added 2026-08-19) and is the functions' `ALERTS_FROM_EMAIL` |
| Store-review bypass (`review-signin`) | Fixed review credentials for app-store review (docs/spec/03) | Ayo | n/a (function secrets) | TBC | Free | `REVIEW_BYPASS_ENABLED` / `REVIEW_EMAIL` / `REVIEW_CODE` via `supabase secrets set` per env + local `supabase/functions/.env`. Code: a fixed 6-digit numeric code, ROTATED per window (docs/spec/03, decided 2026-07-26; compensated by the flag, per-IP rate limits, and alerts). Values in the password manager; surfaced in store review notes at W4.8. **NOT enabled on production** (ADR 0023 amendment: Phase 2 wires real SMTP instead, so there is no standing bypass). Next legitimate window is store review at W4.8; see the section below |
| Payhip | Book sales, entitlement webhooks | Lead pastor | TBC | TBC | Payhip fees | API key handoff session planned (`24` row 13) |
| Vercel | Website + dashboard hosting | Ayo | TBC | TBC | Free | **TWO projects since 2026-08-31.** **`agbc-dashboard`** is the leader dashboard, live at **`app-dashboard.agbcglobal.com`**: imported from `AYSamuel/agbc-global` with Root Directory `apps/dashboard` (Vercel detected the pnpm workspace and resolved `@agbc/shared` with no extra configuration), Git-connected so it redeploys on every push to `main`. Its env holds ONLY public values plus the Sentry token: the project URL and the `sb_publishable_` key. **`SUPABASE_SECRET_KEY` is deliberately NOT set**, and the dashboard runs correctly without it, because `secretSupabaseKey()` is lazy and its only caller `createAdminClient()` still has zero callers; the seam exists ahead of the first moderation route that needs it. **The moment a route calls it, that variable must be added, by Ayo, since it is full database access.** Verified live: HTTPS 200, signed-out `/moderation` turned away at `/sign-in`, and a real sign-in by Ayo. agbcglobal.com. Project `agbc-website` (repo `AYSamuel/agbc-website`, local `Desktop/agbc`). **Since 2026-08-19 (Track P Phase 3) its `PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` point at `agbc-production`** (the key VALUE is the `sb_secret_` key named `website`; the var name stays because the code reads it). Verified live same night: donation row, registration row, thank-you emails. The stale `agbc-web` project on Vercel is an old artifact, untouched |
| Domain registrar / DNS | agbcglobal.com, SPF/DKIM/DMARC, AASA/assetlinks | Ayo | TBC | TBC | Domain renewal (date TBC) | Registrar lock + MFA per security standard |
| Expo / EAS | Builds, credentials store, push | Ayo (`aysamuel`) | Expo account | TBC | Free until Starter ($19/mo) at launch | Holds the Android upload keystore (`agbc-app-upload-keystore`, PKCS12, alias `agbc-key`) and, **since 2026-08-16 (W3.3), the FCM V1 Google Service Account Key** assigned to `com.oami.agbcapp` (Firebase project `agbc-app-5c07e`). Verified empty before that: `eas credentials -p android` read "Push Notifications (FCM V1): None assigned yet", so every push before this date would have gone nowhere. The key JSON is a LIVE SEND-AS-YOUR-APP CREDENTIAL: it lives in EAS + the password manager only, never in git (`.gitignore` carries both `google-service-account*.json` and `*firebase-adminsdk*.json`, the second added when Firebase turned out to name its download after itself). APNs key still outstanding, with the iPhone. **"Submissions: Google Service Account Key for Play Store Submissions" is still unassigned** and is W4.8's, not push's. Since 2026-08-19 (Track P Phase 4) the **preview** EAS environment also carries `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_KEY` (production ref + `sb_publishable_` key, both public identifiers); the **production** EAS environment deliberately does not yet, that is W4.8's with the store build |
| PostHog (EU) | Analytics | Ayo | GitHub OAuth | TBC | Free (1M events/mo) | Region-locked eu.posthog.com (created 2026-07-18). Org `AGBC app`; **project `Default project`, id 227300**, ingest `https://eu.i.posthog.com` (verified in the console 2026-08-13, W2.10). The write-only project key is publishable by design (it ships in the app bundle) and lives in EAS env plus the untracked local `apps/mobile/.env`; it is not a secret and is not mapped in `23` §2. **Free plan = ONE project** and a second needs a card on file, so dev builds and members share this dataset: every event carries `environment` ('development'/'production') and insights filter on it (ADR 0020 amendment). Renaming the project to something meaningful is an open nicety |
| Sentry (EU) | Crash reporting | Ayo | GitHub OAuth | TBC | Free (5k errors/mo, per-key rate limits) | Data Storage Location = EU, unchangeable, and **verified 2026-08-13**: all DSNs ingest at `o4511757761380352.ingest.de.sentry.io`. Org slug `agbc-app`, team `#agbc-app`. **Three projects, one per runtime** (W2.10, ADR 0020): `agbc-mobile` (react-native), `agbc-dashboard` (nextjs), `agbc-edge` (deno), each created with error monitoring only, no tracing/replay/profiling/logging. DSNs are publishable identifiers and live in EAS env, Vercel env and the `SENTRY_DSN` function secret; the **`SENTRY_AUTH_TOKEN` for sourcemap upload IS a secret**: created 2026-08-13 as an ORGANIZATION token (`agbc-eas-sourcemaps`), stored in EAS env (`--visibility secret`, builder-only) and the password manager. NOT in GitHub secrets, deliberately: nothing in CI uploads sourcemaps, so a copy there would be unused surface (`21` §4 corrected in the same change). No repository integration connected |
| healthchecks.io | Dead-man pings for jobs | Ayo | Email magic link | TBC | Free (20 checks) | Created 2026-07-18. Checks are per job and per environment; each ping URL is a function secret (`HEALTHCHECK_URL_*`, `21` §6.2). Five checks exist as of 2026-08-19: `prod-backup` (daily) plus the four job checks `prod-moderation-alerts` (hourly), `prod-verse-monitor` (daily), `prod-streak-recompute` (weekly), `prod-push-receipts` (15 min), each with grace of one period. `prod-moderation-alerts` spent 2026-08-19 paused-by-intent (zero admins = failure pings by design) but **a ping to a paused check RESUMES it**, so the job's own failure pings had un-paused it before Phase 4 could; it went green on the first tick after the admins onboarded. Lesson: healthchecks.io pause does not survive a pinging job, so "pause until X" plans need the job stopped too, or an expectation of red. **Eleven checks as of 2026-08-19** (W3.4 added `prod-service-reminders` 15m, `prod-rsvp-reminders` 1h, `prod-prayer-reminders` 1h, `prod-counter-reconcile` 1d, `prod-retention-purge` monthly, `prod-resend-canary` weekly, all with cron schedules mirroring their migrations rather than plain periods; the default `My First Check` was deleted). **Every ping URL was exposed in a session transcript on 2026-08-19 and Ayo decided NOT to rotate**, deliberately: a ping URL grants no data access, only the ability to mark a check healthy or failed, and the transcript is not public. Recorded here so the next person finds a decision rather than an oversight. The checks LIST page renders a full Ping URL column, which is how it happened; do not screenshot it. **Thirteen checks as of 2026-08-20** (W3.5 added `prod-broadcast-fanout` and `prod-event-notices`, both cron `* * * * *` with a 5-minute grace: a one-minute grace on a one-minute job alerts on any ordinary hiccup). **The timezone on every check is UTC, and that is load-bearing**: the production database runs `UTC` and pg_cron's own `cron.timezone` is `GMT`, which in Postgres is a FIXED +00:00 zone rather than `Europe/London`, so no schedule in this project ever shifts with BST; a check set to a DST-observing zone would drift an hour for half the year and page for a job that ran exactly on time. **A weekly check reads GREY, not red, until its first firing day comes round**: `prod-streak-recompute` (Mondays 03:40) and `prod-resend-canary` (Mondays, on verse-monitor's pass) were created on a Wednesday and stayed grey through the whole week, which is "never pinged" rather than "late". Check the secret exists (`supabase secrets list`, which prints names and digests and never values) before believing anything is wrong |
| UptimeRobot | Uptime monitors | Ayo | GitHub OAuth | TBC | Free (50 monitors) | Created 2026-07-18 |
| Backblaze B2 | Off-provider prod backups (Track P P1, ADR 0018) | Ayo | TBC | TBC | Free (first 10 GB; standing use < 0.1 GB) | EU Central (Amsterdam). Bucket `agbc-prod-backup` (private, lifecycle: hide 30d + delete 1d); application key `agbc-backup-ci` (read+write, scoped to this bucket only) in GitHub `production` env secrets + password manager. **The age decryption key for these backups lives in the password manager ONLY** (entry `AGBC prod backup age key`): accepted single point of failure, Ayo's explicit choice 2026-08-10 (offered a church-safe offline copy, declined). Losing vault access = every backup unreadable |
| Twilio | ~~OTP delivery~~ | n/a | n/a | n/a | n/a | DROPPED with email OTP (ADR 0011); no account created |

## Hosted auth settings that NOTHING in the repo carries (per project, by hand)

These live only in a project's dashboard. No migration applies them, and
`supabase config push` must never be run (`config.toml`'s `site_url` is
`127.0.0.1:3000`), so every one of them is a manual step that a fresh project starts
without. All were set on `agbc-production` on 2026-08-18.

**Every entry below is here because it went wrong, not because it might.**

| Setting | Value | Why it is on this list |
|---|---|---|
| **Email OTP length** (Sign In / Providers → Email) | **6** | **Supabase's hosted default is 8.** `config.toml` says 6 and `CodeStep.tsx:118` auto-submits the moment six characters are entered, so an 8-digit code means every member types six digits, the app submits early, verification fails, and there is no way to enter the last two. **Sign-in is completely broken and nothing explains why.** It cannot reproduce locally, where the config sets 6 |
| **Confirm sign up** template | subject + body from `config.toml` / `templates/auth-otp.html` | New projects ship a magic-link email. `03` and ADR 0011 require a code |
| **Magic link or OTP** template | the same subject + body | Shipped as "Your sign-in link" over a magic-link body. This is the one RETURNING members receive, so it matters more than the first |
| **Custom SMTP** (Emails → SMTP Settings) | `smtp.resend.com`:465, user `resend`, sender `auth@agbcglobal.com` | Supabase's built-in sender is 2 emails/hour, dev-only |
| **Custom access token hook** | Postgres, `public.custom_access_token` | Authorization is broken without it |
| MFA / TOTP | already correct | New projects ship `Enabled` with 10 factors. Checked, not assumed |
| Rate limits + the 4 localized template subjects | carried with the templates above | Audited field-by-field via the management API on 2026-08-19: all seven rate limits already matched `config.toml`, including `email_sent = 30` |
| **Email OTP expiry** (`mailer_otp_exp`) | **600** (10 min) | **Hosted default is 3600.** `config.toml` says 600; an hour-long window for a 6-digit code is a wider brute-force and phishing window for no benefit. Found by the 2026-08-19 audit, invisible locally |
| **Min interval between emails** (`smtp_max_frequency`) | **30** (seconds) | **Hosted default is 60.** `CodeStep.tsx` counts down 30s and then offers Resend, so at 60 the first legitimate retap is refused, every time. Found by the audit |
| **Site URL** | `https://agbcglobal.com` | **Hosted default is `http://localhost:3000`.** Inert while every auth email carries a code rather than a link, and a booby trap the moment anything renders `{{ .SiteURL }}` or relies on default redirects. Found by the audit |

**The subject must stay under 255 characters** and nothing says so until a save fails
with `Failed to validate template: subject: Too big`. See the note in `config.toml`,
which also explains why the template is written the way it is.

**Two dashboard traps worth knowing before editing a template again.** Setting the
body with Monaco's `setValue` from the console looks right and is silently discarded
on save, because React treats it as a programmatic reset; `executeEdits` applies as a
user edit and persists. That is how production briefly ended up with a subject
promising a code over a body containing a link. And the only reliable "it saved"
signal is **Save changes going disabled with a "Reset template" button appearing**;
there is no success toast.

## The review bypass is NOT enabled on production (ADR 0023 amendment, 2026-08-18)

This section previously opened a dated production bypass window. **It was cancelled before it
was ever switched on**, and the reason is worth keeping.

The bypass existed to solve "nobody can sign in to production until Resend custom SMTP is
wired, and that is ~1 day of DNS work" (`24` row 12). That estimate predates the website
already sending production email from `agbcglobal.com` through Resend, which means SPF and
DKIM are in place for that sender. Supabase custom SMTP on top is host, port, user and the API
key as a password, entered once. So Phase 2 wires SMTP and production gets **real email OTP**:
no standing credentialed way in, no code to rotate, no dated window to remember, and Phase 1's
last check ("a sign-in reaches AUTH-3") closed by an actual sign-in.

**The fallback is intact and cheap.** If deliverability misbehaves on a domain that has never
carried auth email, enabling the bypass is `REVIEW_BYPASS_ENABLED` plus the pair beside it and
a redeploy. Everything that made its risk bounded still holds: one allowlisted email, a code
compared in constant time, 5 attempts per 10 minutes per IP, fails closed on weak config, and
the account it mints **can only ever be a `member`** (`review-signin/index.ts`: the profiles
insert guard pins the role).

**The alert on SUCCESSFUL use was built anyway**, in Phase 2: `captureEdgeMessage` plus
`REVIEW_BYPASS_ALERT`, carrying no address and no digits at all, asserted by test. `03` had
assumed since W2.10 that this existed, and it did not. Cheaper to build while in that code
than to rediscover it at W4.8.

**When it legitimately returns: app-store review (W4.8).** That window rotates the code
afresh and closes at approval + 7 days. Write it up here **before** switching it on, which is
what this section was for and remains for. The procedure that goes with it, including the
commands, the proof that the alert fires, and the off switch with its deadline, is
[`store-submission.md`](./store-submission.md) §1.

## In-app admin identities (ADR 0015, 2026-07-30)

Two admin grants exist, declared as data in `bootstrap_admins` and applied by trigger, so both are visible in git rather than hand-typed (migrations `20260729120000` and `20260730150000`). Nothing else in the schema can hand out `admin`: `set_member_role` refuses `target = auth.uid()`.

| Address | Role | Purpose |
|---|---|---|
| `aysamuel007@gmail.com` | Daily admin | Ayo's ordinary account, the same identity he uses in the mobile app |
| `oami.gospel@gmail.com` | **Break-glass admin** | Second identity so the erasure lockout and the 48-hour fallback approver are not one account |

**The break-glass account is availability and recovery, not oversight.** A second account held by the same person cannot review that person's actions. Separation of duties needs a second HUMAN admin, which is still open (see the open action below and ADR 0015).

### Activating the break-glass account

**These steps belong to PRODUCTION, at Track P** (`25` §Track P), not to the PR that adds the allowlist row. The migration only declares the grant; the grant becomes real in whichever database the migration has been applied to, and it only *protects* anything in the one that holds real accounts. Doing it against local or dev proves the path works and nothing more.

**The order is not optional, and it is not the obvious one:**

1. [x] **Onboard in the MOBILE app** with `oami.gospel@gmail.com` (email OTP, then AUTH-3: branch, name, age confirmation). This is what creates the `profiles` row, and the row is what the trigger promotes. The dashboard cannot do this step: it only ever READS `profiles` (`src/server/authorize.ts`), so signing in there first just yields `no_profile` and no promotion. **Done 2026-08-19** (Track P Phase 4, on the first production preview build; display name "Oami Gospel").
2. [x] **Confirm the promotion landed**: the account's `profiles.role` reads `admin`, and `privileged_actions` has one `role_changed` row for it with a **null** `actor_id` (server-owned, per the migration above). If `actor_id` names the account itself, the `20260730140000` migration has not been applied to that environment. **Confirmed 2026-08-19**, both accounts.
3. [x] **Enrol TOTP in the DASHBOARD** (`/mfa`). The mobile app deliberately never offers enrolment and stays at `aal1` (see the `[auth.mfa.totp]` comment in `supabase/config.toml`); the dashboard is the only surface that enrols, and it refuses every staff session below `aal2`, as does `set_member_role`. An admin with no second factor cannot assign roles at all. **Done 2026-08-19, and the decision Phase 4 asked for: enrolment ran on the dashboard LOCALLY against production** (`next build` + `next start` with only the public URL and `sb_publishable_` key; `createAdminClient` is never called, so no secret leaves the vault), rather than waiting for the first Vercel deploy. Both admins verified. Two lessons from the enrolment: a QR scanned with the phone's CAMERA app just opens the raw `otpauth://` text (the scan must happen INSIDE the authenticator; manual setup-key entry works), and **the /mfa QR did not scan even inside Google Authenticator** while the setup key worked; that scan failure is an open dashboard follow-up.
4. [x] **Store that seed offline** (Supabase TOTP issues no recovery codes; the setup key IS the recovery): password-manager vault plus a printed copy with the keystore in the church safe. A break-glass account whose second factor lives on the same phone as the daily account's is not a break-glass account. **Only store the seed enrolled against PRODUCTION.** A local or dev seed is a different Supabase project and `pnpm db:reset` wipes it, so keeping one is a false sense of having done this step. **Vault copy saved 2026-08-19; the PRINTED copy for the church safe is still owed** (see open actions).
5. [x] **Verify once, then leave it alone.** Sign in to the dashboard, confirm it admits the session, sign out. Its whole value is being unused and available. Do not use it for routine work. **Verified and signed out 2026-08-19.**

All five steps are done in production as of 2026-08-19; the daily admin (`aysamuel007@gmail.com`) enrolled TOTP the same night, so both admin identities are at `aal2` capability.

**Custody caveat, accepted knowingly:** a personal-provider mailbox is controlled by whoever holds that Google account, not by the ministry, so it does not outlive its holder the way a church-domain mailbox would. Ayo's decision, 2026-07-30, having been offered the domain alternative. Moving it to a managed church domain later needs one more `bootstrap_admins` row plus a demotion of the old one.

## Arming the scheduled jobs in a hosted environment (W2.7 slice 5, ADR 0016)

The schedules ship in migrations and are the same everywhere. What is per-environment is two
vault secrets and the function secrets; without them the jobs are registered and do nothing,
which is deliberate (a fresh database and every CI run stay silent). Do this once per hosted
project, after the migrations are applied.

1. [ ] **Vault**, in that project's SQL editor. `project_url` has no trailing slash and no
       `/functions/v1`; `jobs.invoke_edge_function` appends it. The key is the
       **`sb_secret_…` key** (dashboard → Settings → API Keys → Publishable and secret API
       keys), NOT the legacy service_role JWT: since ADR 0024 landed (2026-08-19, migration
       `20260819100000`) the invoker sends this value in the `apikey` header and the
       functions compare it against `SUPABASE_SECRET_KEYS`. A legacy JWT vaulted here rides
       the wrong header, matches nothing, and every job 401s while looking armed:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url', '<env>');
   select vault.create_secret('<that project''s sb_secret key>', 'secret_key', '<env>');
   -- if a pre-ADR-0024 'service_role_key' row exists, it is inert; delete it:
   delete from vault.secrets where name = 'service_role_key';
   ```

2. [ ] **Function secrets** (`supabase secrets set`, per env): `RESEND_API_KEY`,
       `ALERTS_FROM_EMAIL` (a verified sender on the domain), `DASHBOARD_URL`, and the two
       healthchecks ping URLs `HEALTHCHECK_URL_MODERATION_ALERTS` +
       `HEALTHCHECK_URL_VERSE_MONITOR`. Missing email config is not a silent no-op: the jobs
       log, ping FAILURE and answer 503.
3. [ ] **healthchecks.io checks**, one per job per environment, with periods matching the
       schedules (hourly / daily) and a grace of one period.
4. [ ] **Verify**: `select jobs.invoke_edge_function('verse-monitor');` then read
       `net._http_response` for a 200 and the check for a ping. Re-running sends nothing the
       second time; that is `job_alerts`, not a failure.
5. [ ] **Prod only, and only at Track P**: the six pre-existing cron jobs belong to the
       retired Grace Portal app (`prod-audit-2026-07-30.md`). They are dropped by that
       cleanup, not by this step, and none of them shares a name with ours.

## Keystore copies (from `21` §7)

The Android upload keystore exists in: EAS credentials (at W0.11) + encrypted vault entry + offline USB in the church safe. Play App Signing means a lost upload key is recoverable via Google support, not fatal.

## Observability values: what is set, and what is still owed (W2.10, 2026-08-13)

The keys were collected and the accounts verified on 2026-08-13. Recorded here rather than
left in a session, because three of the six placements are blocked on infrastructure that
does not exist yet, and every one of them fails SILENTLY when missing: no key means no
analytics, no DSN means no crash reporting, no auth token means readable-looking release
builds whose stack traces are minified for ever. Nothing warns you.

| Value | Where it belongs | State |
|---|---|---|
| `EXPO_PUBLIC_POSTHOG_KEY` | EAS env `preview` + `production` | **Set** 2026-08-13 |
| `EXPO_PUBLIC_POSTHOG_KEY` | local untracked `apps/mobile/.env` | **Set** (so a dev device can verify events; tagged `environment=development`) |
| `EXPO_PUBLIC_SENTRY_DSN` (`agbc-mobile`) | EAS env `preview` + `production` | **Set** 2026-08-13. Deliberately NOT local: the free tier is 5k errors/month |
| `SENTRY_ORG` + `SENTRY_PROJECT` | EAS env `preview` + `production` | **Set** 2026-08-13 (`agbc-app` / `agbc-mobile`) |
| `SENTRY_AUTH_TOKEN` | EAS env (`--visibility secret`) + password manager | **Set** 2026-08-13. Organization token `agbc-eas-sourcemaps`, entered at the CLI prompt so it never reached shell history; `env:list` shows it masked. With `SENTRY_ORG` + `SENTRY_PROJECT` also set, the Expo plugin now uploads sourcemaps on preview and production builds (development still skips) |
| `NEXT_PUBLIC_SENTRY_DSN` (`agbc-dashboard`) + `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` | Vercel env, Production | **DONE 2026-08-31**, with the first dashboard deploy that unblocked it. `NEXT_PUBLIC_SENTRY_DSN` is stored as Vercel type **Config** rather than Secret, deliberately: it is a publishable identifier AND must be inlined into the browser bundle, and the CLI refuses to guess for a `NEXT_PUBLIC_` name. `SENTRY_ORG=agbc-app`, `SENTRY_PROJECT=agbc-dashboard`. `SENTRY_AUTH_TOKEN` is the existing org token `agbc-eas-sourcemaps`, pasted by Ayo (never through the assistant) and annotated in Vercel with where to rotate it. **Verified, not assumed:** the DSN was found inlined in a client chunk on the live site, and the build log shows `Uploaded files to Sentry` with an artifact-bundle Source Map Upload Report |
| `SENTRY_DSN` (`agbc-edge`) | `supabase secrets set`, per hosted project | **Set** 2026-08-19 (Track P Phase 2), alongside the other eight function secrets |
| `SENTRY_ENVIRONMENT` (optional, edge) | `supabase secrets set` | Not set; the helper defaults to 'production' |

## Open actions

- [x] ~~Create `SENTRY_AUTH_TOKEN`~~ done 2026-08-13: organization token in EAS env (secret) + password manager. A second copy will be needed in **Vercel** for the dashboard's sourcemaps; if a GitHub Actions step ever uploads any, use `gh secret set --body` there and never a pipe, which appends a CRLF and corrupts the value silently
- [x] ~~**At the first dashboard deploy:** add the `agbc-dashboard` DSN and the three sourcemap vars to Vercel env~~ **Done 2026-08-31**, see the row above.
- [x] ~~**At Track P Phase 2 (first hosted edge deploy):** `supabase secrets set SENTRY_DSN=<agbc-edge DSN>` alongside the function secrets in the checklist above~~ **Done 2026-08-19:** all nine function secrets set on `agbc-production` in one `--env-file` push (YouTube, Resend, alerts sender, dashboard URL, four healthcheck URLs, the edge DSN); the workflow deploy step had already landed on 2026-08-18
- [ ] **Rotate `YOUTUBE_API_KEY` (GCP `agbc-app`) and the `agbc-app-edge` Resend key at the next convenient moment.** Both values reached the assistant transcript on 2026-08-19 (the harness's file tracker surfaced a secrets file the assistant had created for the `--env-file` flow; the lesson is in auto-memory, and the flow now requires user-created files at untouched paths). **Ayo declined immediate rotation, twice offered ("ignore for this moment"), so this is a recorded accepted risk, not an oversight.** Bounds: the Resend key is send-only and domain-scoped to agbcglobal.com; the YouTube key is quota-bearing only (server-side sync, not in any bundle). The four healthcheck ping URLs were exposed too and kept (worst case is forged uptime pings); the Sentry DSN is publishable by design
- [x] ~~At Track P Phase 2, before the bypass is enabled: rotate `REVIEW_CODE` for the production window~~ **Cancelled 2026-08-18 (ADR 0023 amendment): there is no production bypass window.** Phase 2 wires real SMTP instead. The rotation returns at W4.8 for store review
- [x] ~~**At Track P Phase 2:** wire Resend as Supabase custom SMTP on `agbc-production`, mirror the four localized OTP templates and the rate limits, then close Phase 1's last check with a real sign-in reaching AUTH-3~~ **Done**: SMTP + templates 2026-08-18, and Phase 4 (2026-08-19) closed the loop with real OTP sign-ins completing AUTH-3 for both admin accounts on the production preview build
- [ ] **Before launch, unchanged by the above:** DMARC at enforcement on `agbcglobal.com`. `03` makes domain email posture a launch item rather than polish, because auth now depends on deliverability. SPF and DKIM are already in place (the website sends through Resend today); enforcement is the remaining step
- [ ] **By 2026-09-17, the same date:** rotate the Supabase access token `agbc-ci-deploy`, created 2026-08-18 with a 30-day expiry and held as the `SUPABASE_ACCESS_TOKEN` production secret. **Its scope is the whole Supabase ACCOUNT, not this project**, which includes the unrelated `monietally` org, so it is the widest-blast-radius secret in the inventory. Supabase offers no non-expiring option, and the failure is silent and late: `supabase link` starts refusing weeks after anything changed, and the prod deploy is the only thing that would notice. **Worse, this token is used RARELY**, so an expiry is not discovered by routine activity; it is discovered the next time something genuinely needs shipping to production. **Decision (Ayo, 2026-08-18): keep the short expiry and put a calendar reminder on 2026-09-17**, having been offered a 90-day Custom token that would have cleared the launch run-up. The reminder is the control here; this line is only a record of it. A longer token was declined because the scope is account-wide
- [ ] Rename the PostHog project from `Default project` to something meaningful (cosmetic; the token does not change)
- [ ] Name and add second owners (church officer) on: Supabase org, password-manager vault, Apple (once Ayo's Admin invite lands)
- [ ] **Name a second HUMAN in-app admin** (a trustee or officer), which is the only thing that provides separation of duties over Art. 9 data. The break-glass account above covers availability, not oversight. Before Founding Members (ADR 0015)
- [x] ~~Complete the five break-glass activation steps above, **in production, at Track P** (mobile onboarding, confirm the promotion, dashboard TOTP, seed offline, verify and leave)~~ **Done 2026-08-19 (Track P Phase 4); see the checklist above for how**
- [ ] **Print the break-glass TOTP seed** and place it with the keystore in the church safe (the vault copy exists; the printed copy is the half that survives losing the vault)
- [ ] **Dashboard follow-up:** the `/mfa` enrolment QR would not scan inside Google Authenticator (manual setup-key entry worked, twice). Look at the QR's rendered size/contrast/format at the next dashboard session
- [ ] Fill TBC sign-in methods as each account is next touched
- [ ] Record domain renewal date from the registrar
- [ ] Revisit the age-key single-point-of-failure (ADR 0018) when a second owner joins the password-manager vault: an offline copy in the church safe would then have a second custodian and the objection falls away

## FCM V1 service account key: exposure + rotation (2026-08-16)

**Severity: high, and materially unlike the 2026-07-25 alert below.** That one was a client key that ships in every APK by design. This was a `firebase-adminsdk` **service account private key** for `agbc-app-5c07e`: a server credential that can send push as the app and, through the Admin SDK, mint custom auth tokens for that Firebase project.

What happened, in order:

1. The key was downloaded during W3.3 slice 3 prep and placed in `apps/mobile/`. `.gitignore` was extended first (`*firebase-adminsdk*.json`) and the ignore verified with `git check-ignore` before the file existed, so **it never reached git**.
2. The file was then **opened in the IDE**, which put its first 13 lines, including the entire `-----BEGIN PRIVATE KEY-----` block, into the assistant conversation transcript.
3. Rotation was treated as mandatory (project rule: an exposed secret is rotated, not un-pasted). Nothing depended on the key yet, so it was **revoked first** rather than overlapped: key id `02fd4c0badcd5852729da1e7048501567b7eebd7` deleted from the service account, then a replacement created and uploaded to EAS. FCM V1 is assigned to `com.oami.agbcapp` (project `agbc-app-5c07e`). Both local copies were deleted once EAS and the password manager held it.

**The key that should be assigned is `8f89d7b931c4c97ca4dc9d42a7d64c21fb165c6d`** (a private key id is an identifier, not secret material). Write it down because EAS's picker lists every key it has ever held, identical in every other field, so the revoked one sits one arrow-key from the live one. **If push ever fails with an authentication or sender error, check this first:** `eas credentials -p android` and confirm the assigned Private Key Id matches the value above. An assigned-but-revoked key fails at delivery, far from anything the app code is doing.

Two lessons, both cheap and both learned the hard way:

- **The leak vector was the editor, not git.** Every control in place was a git control, and none of them applied. Credential files are moved with the shell or the file manager and never opened; anything that needs checking inside one is read programmatically for its non-secret fields (`type`, `project_id`) and nothing else.
- **Filename-based ignores are a backstop, not a fence.** Google handed us two different shapes for the same kind of file in one afternoon: Firebase's console gives `<project>-firebase-adminsdk-<hash>-<hash>.json`, and the Cloud console's IAM page gives `<project>-<hash>.json`, which matches neither existing pattern. The replacement key was therefore **uploaded from `~/Downloads` by path and never placed in the repo at all**, which is the posture to keep: a server credential has no reason to sit in the working tree.

## Firebase `agbc-app` Android API key: leak remediation (2026-07-25)

GitHub flagged the Firebase Android API key committed in `apps/mobile/google-services.json` (secret-scanning alert #1). It is a client key (public by design: it ships in the APK), so severity is low. Chosen fix: **restrict, do not rotate**. Google advises against routinely rotating these keys, restriction fully neutralizes the risk, and this is the old Grace Portal project on a shared package/signing, so rotating could disrupt live Grace Portal installs.

Done (2026-07-25):

- [x] **Application restrictions** added on the key (Google Cloud Console -> APIs & Services -> Credentials -> "Android key (auto created by Firebase)"): Application restrictions -> Android apps -> package `com.oami.agbcapp` with the Play **app-signing** SHA-1 (`02:7C:1A:FA:36:7F:39:9A:07:64:AE:B7:5C:DD:67:3B:3C:FD:BF:72`) and **upload-key** SHA-1 (`64:AF:5B:46:1E:90:25:AD:68:FB:D5:D1:CB:22:18:EF:77:51:53:0D`). The leaked string is now non-abusable: Google only honors it from an app signed with those certs. API restrictions left as Firebase's default set.
- [x] `google-services.json` untracked + gitignored, supplied to EAS via the `GOOGLE_SERVICES_JSON` file secret (PR #68).
- [x] GitHub alert #1 closed as `wont_fix` (mitigated).

Open follow-ups:

- [ ] Before the next EAS build, set the file secret: `eas secret:create --scope project --type file --name GOOGLE_SERVICES_JSON --value ./google-services.json`.
- [x] ~~**When push is wired (W3.3):** add the EAS **dev/preview** keystore SHA-1(s) to the same Android-apps restriction (those builds use different keystores)~~ **Closed 2026-08-16 with nothing to do: the premise was wrong.** `eas credentials -p android` on the development profile signs with `agbc-app-upload-keystore`, whose SHA-1 is `64:AF:5B:46:1E:90:25:AD:68:FB:D5:D1:CB:22:18:EF:77:51:53:0D`, i.e. **the upload key already in the restriction**. EAS was never asked to generate a per-profile keystore (`19` forbids it), so dev builds are covered by the existing entry. If a preview or production profile is ever given its own keystore, this item returns; the failure signature below is how it would announce itself.

Notes:

- The old value stays in git history; that is acceptable for a restricted client key (it already ships in every binary). Restriction, not history rewriting, is the control.
- **Failure signature:** a future Firebase call failing with HTTP 403 / "Requests from this Android client application are blocked" means a signing SHA-1 is missing from this key's Android-apps restriction. Fix (30 seconds): add that build's SHA-1 (Console -> Credentials -> the key -> Application restrictions -> Android apps -> Add). Get a keystore's SHA-1 from `eas credentials` (Android) or Play Console -> App integrity -> App signing.
