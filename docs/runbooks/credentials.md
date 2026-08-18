# Credentials & Account Inventory

The bus-factor register from `docs/spec/21-OPERATIONS.md` §7: every account the product depends on, who owns it, who the second owner is, and what pays for it. NO secret values ever live in this file; secret locations are mapped in `docs/spec/23-VERSION-CONTROL.md` §2 (password manager, EAS credentials, `supabase secrets set`, GitHub Actions secrets).

Status: skeleton seeded at W0.2 (2026-07-18). Rows marked TBC get filled as accounts are touched; second owners are the open bus-factor action.

| Account | Purpose | Owner | Sign-in method | Second owner | Billing | Notes |
|---|---|---|---|---|---|---|
| Apple Developer (church) | iOS distribution | Church Account Holder (name TBC) | Apple Account | n/a (Ayo joining as Admin, invite pending) | Fee waiver, re-confirmed annually by Account Holder | Last shipped iOS build: 1.0.0 (19) |
| Google Play Console | Android distribution | Ayo | Google account | TBC | $25 one-off, paid | Highest versionCode 19; App Signing SHA-256 recorded in `docs/spec/19` |
| GitHub `AYSamuel/agbc-global` | Repo, CI | Ayo | GitHub + MFA | TBC (ADR 0012: personal account, second owners via collaborators) | Free | Identity for the OAuth sign-ins below; recovery codes in password manager |
| Supabase org | Production (app + website) | Ayo | TBC | Church officer TBC | Free (Pro before public launch) | **Production is `agbc-production`, ref `mqvojrkotwwvwzsewybx`, eu-central-1, created 2026-08-17 (ADR 0023, Track P Phase 1).** The ref is a public identifier and lives here; **the database password, the service-role key and the personal access token are secrets and live in the password manager only, NEVER in git and never opened in an editor** (see the FCM leak below: the vector was the editor, not git, and the service-role key is full database access). The project was created through the management API, which sets a password nobody sees, so the database password is whatever the dashboard reset produced. **The OLD shared project `fotfplvqsnmbzjjhqlwp` is PAUSED as of 2026-08-17** (its slot was needed: the Free plan allows two ACTIVE projects and the other one belongs to a different company). Paused means data and configuration intact and restorable for up to a year, but unreachable meanwhile, so its final archive is `nightly/agbc-prod-2026-08-17.tar.zst.age` in B2, taken minutes before the pause. Restoring it would need a free active slot, so pause `agbc-production` first. It is deleted for good at Phase 5. No separate dev project was ever created and none is planned. Auth settings that live in `supabase/config.toml` locally must be mirrored per hosted project (Phase 1): the custom access token hook (**authorization is broken without it**), the four localized email templates, rate limits, and **MFA > App Authenticator (TOTP) enrolment + verification ON** (free on every plan; the dashboard refuses any session below `aal2`, so leaving it off locks every leader out of moderation) |
| Google Cloud / Firebase `agbc-app` | FCM push credentials + app YouTube key | Ayo | Google account | TBC | Free (Spark) | Old Grace Portal project; Android app `com.oami.agbcapp` registered; FCM V1 key + YouTube key in password manager (2026-07-18). `google-services.json` is untracked (gitignored) and supplied to EAS via the `GOOGLE_SERVICES_JSON` file secret; local dev keeps its own copy. Android API key regeneration + restriction tracked below (2026-07-25 public-leak alert) |
| Google Cloud `agbc-website` | Website's YouTube key ONLY | Ayo | Google account | TBC | Free | Never share key strings with the app (rotation + quota isolation) |
| Meta Business portfolio | WhatsApp broadcasts (Phase 3) | Ayo (portfolio TBC, month 1) | Facebook profile | TBC | Free; per-conversation broadcast costs | Verification needs incorporation cert + utility bill |
| Resend | Auth OTP email + transactional (via website account) | Ayo | TBC (website account) | TBC | Free tier (3k/month) | Becomes Supabase custom SMTP before first real sign-ins (dashboard SMTP config, per hosted env). The localized OTP template + subjects from `supabase/config.toml` are mirrored into each hosted project's Auth > Email Templates (Track P runbook step) |
| Store-review bypass (`review-signin`) | Fixed review credentials for app-store review (docs/spec/03) | Ayo | n/a (function secrets) | TBC | Free | `REVIEW_BYPASS_ENABLED` / `REVIEW_EMAIL` / `REVIEW_CODE` via `supabase secrets set` per env + local `supabase/functions/.env`. Code: a fixed 6-digit numeric code, ROTATED per window (docs/spec/03, decided 2026-07-26; compensated by the flag, per-IP rate limits, and alerts). Values in the password manager; surfaced in store review notes at W4.8. **ON in production from Track P Phase 2, bounded and dated: see the window below** |
| Payhip | Book sales, entitlement webhooks | Lead pastor | TBC | TBC | Payhip fees | API key handoff session planned (`24` row 13) |
| Vercel | Website + dashboard hosting | Ayo | TBC | TBC | Free | agbcglobal.com |
| Domain registrar / DNS | agbcglobal.com, SPF/DKIM/DMARC, AASA/assetlinks | Ayo | TBC | TBC | Domain renewal (date TBC) | Registrar lock + MFA per security standard |
| Expo / EAS | Builds, credentials store, push | Ayo (`aysamuel`) | Expo account | TBC | Free until Starter ($19/mo) at launch | Holds the Android upload keystore (`agbc-app-upload-keystore`, PKCS12, alias `agbc-key`) and, **since 2026-08-16 (W3.3), the FCM V1 Google Service Account Key** assigned to `com.oami.agbcapp` (Firebase project `agbc-app-5c07e`). Verified empty before that: `eas credentials -p android` read "Push Notifications (FCM V1): None assigned yet", so every push before this date would have gone nowhere. The key JSON is a LIVE SEND-AS-YOUR-APP CREDENTIAL: it lives in EAS + the password manager only, never in git (`.gitignore` carries both `google-service-account*.json` and `*firebase-adminsdk*.json`, the second added when Firebase turned out to name its download after itself). APNs key still outstanding, with the iPhone. **"Submissions: Google Service Account Key for Play Store Submissions" is still unassigned** and is W4.8's, not push's |
| PostHog (EU) | Analytics | Ayo | GitHub OAuth | TBC | Free (1M events/mo) | Region-locked eu.posthog.com (created 2026-07-18). Org `AGBC app`; **project `Default project`, id 227300**, ingest `https://eu.i.posthog.com` (verified in the console 2026-08-13, W2.10). The write-only project key is publishable by design (it ships in the app bundle) and lives in EAS env plus the untracked local `apps/mobile/.env`; it is not a secret and is not mapped in `23` §2. **Free plan = ONE project** and a second needs a card on file, so dev builds and members share this dataset: every event carries `environment` ('development'/'production') and insights filter on it (ADR 0020 amendment). Renaming the project to something meaningful is an open nicety |
| Sentry (EU) | Crash reporting | Ayo | GitHub OAuth | TBC | Free (5k errors/mo, per-key rate limits) | Data Storage Location = EU, unchangeable, and **verified 2026-08-13**: all DSNs ingest at `o4511757761380352.ingest.de.sentry.io`. Org slug `agbc-app`, team `#agbc-app`. **Three projects, one per runtime** (W2.10, ADR 0020): `agbc-mobile` (react-native), `agbc-dashboard` (nextjs), `agbc-edge` (deno), each created with error monitoring only, no tracing/replay/profiling/logging. DSNs are publishable identifiers and live in EAS env, Vercel env and the `SENTRY_DSN` function secret; the **`SENTRY_AUTH_TOKEN` for sourcemap upload IS a secret**: created 2026-08-13 as an ORGANIZATION token (`agbc-eas-sourcemaps`), stored in EAS env (`--visibility secret`, builder-only) and the password manager. NOT in GitHub secrets, deliberately: nothing in CI uploads sourcemaps, so a copy there would be unused surface (`21` §4 corrected in the same change). No repository integration connected |
| healthchecks.io | Dead-man pings for jobs | Ayo | Email magic link | TBC | Free (20 checks) | Created 2026-07-18. Checks are per job and per environment; each ping URL is a function secret (`HEALTHCHECK_URL_*`, `21` §6.2). Two jobs are scheduled as of W2.7 slice 5: `moderation-alerts` (hourly) and `verse-monitor` (daily) |
| UptimeRobot | Uptime monitors | Ayo | GitHub OAuth | TBC | Free (50 monitors) | Created 2026-07-18 |
| Backblaze B2 | Off-provider prod backups (Track P P1, ADR 0018) | Ayo | TBC | TBC | Free (first 10 GB; standing use < 0.1 GB) | EU Central (Amsterdam). Bucket `agbc-prod-backup` (private, lifecycle: hide 30d + delete 1d); application key `agbc-backup-ci` (read+write, scoped to this bucket only) in GitHub `production` env secrets + password manager. **The age decryption key for these backups lives in the password manager ONLY** (entry `AGBC prod backup age key`): accepted single point of failure, Ayo's explicit choice 2026-08-10 (offered a church-safe offline copy, declined). Losing vault access = every backup unreadable |
| Twilio | ~~OTP delivery~~ | n/a | n/a | n/a | n/a | DROPPED with email OTP (ADR 0011); no account created |

## The production review-bypass window (opened Track P Phase 2; ADR 0023 decision 6)

**Written down BEFORE the bypass is switched on, not after.** `review-signin` mints a real
session for one allowlisted address and a fixed 6-digit code. On production that is a
standing way into the app that does not depend on anyone's mailbox, so it gets an expiry and
an owner in writing, and both are part of the work rather than good intentions.

**Why it is on at all:** without it nobody can sign in to production until Resend custom SMTP
is wired, and that is a day of DNS work (SPF/DKIM/DMARC on the church domain, `24` row 12).
Phase 1's verification and W3.3's outstanding notification-tap test both need a real signed-in
account on production first.

**Why the risk is bounded by the mechanism, not by care:** one allowlisted email, a code
compared in constant time, 5 attempts per 10 minutes per IP, fails closed on weak config, and
the account it mints **can only ever be a `member`** (`review-signin/index.ts`: the profiles
insert guard pins the role). A fake member can submit content that publishes nothing without
moderation, and can read only their own rows.

| | |
|---|---|
| **Opened** | Track P Phase 2 (secrets set with the edge deploy) |
| **Code** | **Freshly rotated for this window.** Not the dev/preview code, and not any code used before. Generated in the password manager, entered from there, never typed into a shell that keeps history and never pasted into a chat or an editor |
| **Closes: trigger** | **The moment Resend custom SMTP is live on this project.** Email OTP then works and the bypass has no job. Turning it off is one `supabase secrets unset REVIEW_BYPASS_ENABLED` and a redeploy |
| **Closes: hard date** | **2026-09-17**, reviewed no later than this regardless of SMTP. If it is still on that day, either it is turned off or the reason is written here with a new date |
| **Alert** | An alert on **SUCCESSFUL** use, added in Phase 2. Today the function captures only on failure, so a successful bypass sign-in on production would tell nobody. `03` assumed this arrived with W2.10; it did not. It logs no address and no code (`20`) |
| **Store review** | A submission window reuses this mechanism and rotates the code again (`03`, W4.8). The two are not the same window |

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

1. [ ] **Onboard in the MOBILE app** with `oami.gospel@gmail.com` (email OTP, then AUTH-3: branch, name, age confirmation). This is what creates the `profiles` row, and the row is what the trigger promotes. The dashboard cannot do this step: it only ever READS `profiles` (`src/server/authorize.ts`), so signing in there first just yields `no_profile` and no promotion.
2. [ ] **Confirm the promotion landed**: the account's `profiles.role` reads `admin`, and `privileged_actions` has one `role_changed` row for it with a **null** `actor_id` (server-owned, per the migration above). If `actor_id` names the account itself, the `20260730140000` migration has not been applied to that environment.
3. [ ] **Enrol TOTP in the DASHBOARD** (`/mfa`). The mobile app deliberately never offers enrolment and stays at `aal1` (see the `[auth.mfa.totp]` comment in `supabase/config.toml`); the dashboard is the only surface that enrols, and it refuses every staff session below `aal2`, as does `set_member_role`. An admin with no second factor cannot assign roles at all.
4. [ ] **Store that seed and its recovery codes offline**: password-manager vault plus a printed copy with the keystore in the church safe. A break-glass account whose second factor lives on the same phone as the daily account's is not a break-glass account. **Only store the seed enrolled against PRODUCTION.** A local or dev seed is a different Supabase project and `pnpm db:reset` wipes it, so keeping one is a false sense of having done this step.
5. [ ] **Verify once, then leave it alone.** Sign in to the dashboard, confirm it admits the session, sign out. Its whole value is being unused and available. Do not use it for routine work.

Until steps 1 to 3 are done in production, production still has functionally one admin and none of the protection above exists.

**Custody caveat, accepted knowingly:** a personal-provider mailbox is controlled by whoever holds that Google account, not by the ministry, so it does not outlive its holder the way a church-domain mailbox would. Ayo's decision, 2026-07-30, having been offered the domain alternative. Moving it to a managed church domain later needs one more `bootstrap_admins` row plus a demotion of the old one.

## Arming the scheduled jobs in a hosted environment (W2.7 slice 5, ADR 0016)

The schedules ship in migrations and are the same everywhere. What is per-environment is two
vault secrets and the function secrets; without them the jobs are registered and do nothing,
which is deliberate (a fresh database and every CI run stay silent). Do this once per hosted
project, after the migrations are applied.

1. [ ] **Vault**, in that project's SQL editor. `project_url` has no trailing slash and no
       `/functions/v1`; `jobs.invoke_edge_function` appends it:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url', '<env>');
   select vault.create_secret('<that project''s service_role key>', 'service_role_key', '<env>');
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
| `NEXT_PUBLIC_SENTRY_DSN` (`agbc-dashboard`) + `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` | Vercel env, per environment | **OWED, blocked:** the dashboard is not linked to a Vercel project from this machine. Do it with the first dashboard deploy |
| `SENTRY_DSN` (`agbc-edge`) | `supabase secrets set`, per hosted project | **OWED, unblocked as of ADR 0023:** it was blocked because the only remote was the shared prod project. Set it at **Track P Phase 2**, on the new project, alongside the other function secrets and the first `supabase functions deploy` this repo has ever run |
| `SENTRY_ENVIRONMENT` (optional, edge) | `supabase secrets set` | Not set; the helper defaults to 'production' |

## Open actions

- [x] ~~Create `SENTRY_AUTH_TOKEN`~~ done 2026-08-13: organization token in EAS env (secret) + password manager. A second copy will be needed in **Vercel** for the dashboard's sourcemaps; if a GitHub Actions step ever uploads any, use `gh secret set --body` there and never a pipe, which appends a CRLF and corrupts the value silently
- [ ] **At the first dashboard deploy:** add the `agbc-dashboard` DSN and the three sourcemap vars to Vercel env
- [ ] **At Track P Phase 2 (first hosted edge deploy):** `supabase secrets set SENTRY_DSN=<agbc-edge DSN>` alongside the function secrets in the checklist above. Note that `supabase functions deploy` has never run from this repo at all: `supabase-deploy.yml` line 34 still says it "joins here when the first edge function lands", nine functions later. Phase 2 fixes the workflow rather than deploying by hand
- [ ] **At Track P Phase 2, before the bypass is enabled:** rotate `REVIEW_CODE` for the production window and record the window above. Generate it in the password manager, never in a shell
- [ ] **By 2026-09-17 at the latest:** close the production review-bypass window, or re-date it in writing
- [ ] **By 2026-09-17, the same date:** rotate the Supabase access token `agbc-ci-deploy`, created 2026-08-18 with a 30-day expiry and held as the `SUPABASE_ACCESS_TOKEN` production secret. **Its scope is the whole Supabase ACCOUNT, not this project**, which includes the unrelated `monietally` org, so it is the widest-blast-radius secret in the inventory. Supabase offers no non-expiring option, and the failure is silent and late: `supabase link` starts refusing weeks after anything changed, and the prod deploy is the only thing that would notice. **Worse, this token is used RARELY**, so an expiry is not discovered by routine activity; it is discovered the next time something genuinely needs shipping to production. **Decision (Ayo, 2026-08-18): keep the short expiry and put a calendar reminder on 2026-09-17**, having been offered a 90-day Custom token that would have cleared the launch run-up. The reminder is the control here; this line is only a record of it. A longer token was declined because the scope is account-wide
- [ ] Rename the PostHog project from `Default project` to something meaningful (cosmetic; the token does not change)
- [ ] Name and add second owners (church officer) on: Supabase org, password-manager vault, Apple (once Ayo's Admin invite lands)
- [ ] **Name a second HUMAN in-app admin** (a trustee or officer), which is the only thing that provides separation of duties over Art. 9 data. The break-glass account above covers availability, not oversight. Before Founding Members (ADR 0015)
- [ ] Complete the five break-glass activation steps above, **in production, at Track P** (mobile onboarding, confirm the promotion, dashboard TOTP, seed offline, verify and leave)
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
