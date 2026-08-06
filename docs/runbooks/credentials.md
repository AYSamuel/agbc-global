# Credentials & Account Inventory

The bus-factor register from `docs/spec/21-OPERATIONS.md` §7: every account the product depends on, who owns it, who the second owner is, and what pays for it. NO secret values ever live in this file; secret locations are mapped in `docs/spec/23-VERSION-CONTROL.md` §2 (password manager, EAS credentials, `supabase secrets set`, GitHub Actions secrets).

Status: skeleton seeded at W0.2 (2026-07-18). Rows marked TBC get filled as accounts are touched; second owners are the open bus-factor action.

| Account | Purpose | Owner | Sign-in method | Second owner | Billing | Notes |
|---|---|---|---|---|---|---|
| Apple Developer (church) | iOS distribution | Church Account Holder (name TBC) | Apple Account | n/a (Ayo joining as Admin, invite pending) | Fee waiver, re-confirmed annually by Account Holder | Last shipped iOS build: 1.0.0 (19) |
| Google Play Console | Android distribution | Ayo | Google account | TBC | $25 one-off, paid | Highest versionCode 19; App Signing SHA-256 recorded in `docs/spec/19` |
| GitHub `AYSamuel/agbc-global` | Repo, CI | Ayo | GitHub + MFA | TBC (ADR 0012: personal account, second owners via collaborators) | Free | Identity for the OAuth sign-ins below; recovery codes in password manager |
| Supabase org | Prod (shared with website) + dev | Ayo | TBC | Church officer TBC | Free (Pro is a pre-TestFlight gate) | Prod ref `fotfplvqsnmbzjjhqlwp`, eu-central-1. Auth settings that live in `supabase/config.toml` locally must be mirrored per hosted project (Track P runbook step): the custom access token hook, the email templates above, and **MFA > App Authenticator (TOTP) enrolment + verification ON** (free on every plan; the dashboard refuses any session below `aal2`, so leaving it off locks every leader out of moderation) |
| Google Cloud / Firebase `agbc-app` | FCM push credentials + app YouTube key | Ayo | Google account | TBC | Free (Spark) | Old Grace Portal project; Android app `com.oami.agbcapp` registered; FCM V1 key + YouTube key in password manager (2026-07-18). `google-services.json` is untracked (gitignored) and supplied to EAS via the `GOOGLE_SERVICES_JSON` file secret; local dev keeps its own copy. Android API key regeneration + restriction tracked below (2026-07-25 public-leak alert) |
| Google Cloud `agbc-website` | Website's YouTube key ONLY | Ayo | Google account | TBC | Free | Never share key strings with the app (rotation + quota isolation) |
| Meta Business portfolio | WhatsApp broadcasts (Phase 3) | Ayo (portfolio TBC, month 1) | Facebook profile | TBC | Free; per-conversation broadcast costs | Verification needs incorporation cert + utility bill |
| Resend | Auth OTP email + transactional (via website account) | Ayo | TBC (website account) | TBC | Free tier (3k/month) | Becomes Supabase custom SMTP before first real sign-ins (dashboard SMTP config, per hosted env). The localized OTP template + subjects from `supabase/config.toml` are mirrored into each hosted project's Auth > Email Templates (Track P runbook step) |
| Store-review bypass (`review-signin`) | Fixed review credentials for app-store review (docs/spec/03) | Ayo | n/a (function secrets) | TBC | Free | `REVIEW_BYPASS_ENABLED` / `REVIEW_EMAIL` / `REVIEW_CODE` via `supabase secrets set` per env (dev/preview on; prod off outside submission windows) + local `supabase/functions/.env`. Code: a fixed 6-digit numeric code, ROTATED per submission window (docs/spec/03, decided 2026-07-26; compensated by the flag, per-IP rate limits, and alerts). Values in the password manager; surfaced in store review notes at W4.8 |
| Payhip | Book sales, entitlement webhooks | Lead pastor | TBC | TBC | Payhip fees | API key handoff session planned (`24` row 13) |
| Vercel | Website + dashboard hosting | Ayo | TBC | TBC | Free | agbcglobal.com |
| Domain registrar / DNS | agbcglobal.com, SPF/DKIM/DMARC, AASA/assetlinks | Ayo | TBC | TBC | Domain renewal (date TBC) | Registrar lock + MFA per security standard |
| Expo / EAS | Builds, credentials store, push | TBC (created at W0.11) | TBC | TBC | Free until Starter ($19/mo) at launch | Will hold the Android keystore + FCM key + APNs key |
| PostHog (EU) | Analytics | Ayo | GitHub OAuth | TBC | Free (1M events/mo) | Region-locked eu.posthog.com (created 2026-07-18) |
| Sentry (EU) | Crash reporting | Ayo | GitHub OAuth | TBC | Free (5k errors/mo) | Data Storage Location = EU, unchangeable |
| healthchecks.io | Dead-man pings for jobs | Ayo | Email magic link | TBC | Free (20 checks) | Created 2026-07-18. Checks are per job and per environment; each ping URL is a function secret (`HEALTHCHECK_URL_*`, `21` §6.2). Two jobs are scheduled as of W2.7 slice 5: `moderation-alerts` (hourly) and `verse-monitor` (daily) |
| UptimeRobot | Uptime monitors | Ayo | GitHub OAuth | TBC | Free (50 monitors) | Created 2026-07-18 |
| Twilio | ~~OTP delivery~~ | n/a | n/a | n/a | n/a | DROPPED with email OTP (ADR 0011); no account created |

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

## Open actions

- [ ] Name and add second owners (church officer) on: Supabase org, password-manager vault, Apple (once Ayo's Admin invite lands)
- [ ] **Name a second HUMAN in-app admin** (a trustee or officer), which is the only thing that provides separation of duties over Art. 9 data. The break-glass account above covers availability, not oversight. Before Founding Members (ADR 0015)
- [ ] Complete the five break-glass activation steps above, **in production, at Track P** (mobile onboarding, confirm the promotion, dashboard TOTP, seed offline, verify and leave)
- [ ] Fill TBC sign-in methods as each account is next touched
- [ ] Record domain renewal date from the registrar

## Firebase `agbc-app` Android API key: leak remediation (2026-07-25)

GitHub flagged the Firebase Android API key committed in `apps/mobile/google-services.json` (secret-scanning alert #1). It is a client key (public by design: it ships in the APK), so severity is low. Chosen fix: **restrict, do not rotate**. Google advises against routinely rotating these keys, restriction fully neutralizes the risk, and this is the old Grace Portal project on a shared package/signing, so rotating could disrupt live Grace Portal installs.

Done (2026-07-25):

- [x] **Application restrictions** added on the key (Google Cloud Console -> APIs & Services -> Credentials -> "Android key (auto created by Firebase)"): Application restrictions -> Android apps -> package `com.oami.agbcapp` with the Play **app-signing** SHA-1 (`02:7C:1A:FA:36:7F:39:9A:07:64:AE:B7:5C:DD:67:3B:3C:FD:BF:72`) and **upload-key** SHA-1 (`64:AF:5B:46:1E:90:25:AD:68:FB:D5:D1:CB:22:18:EF:77:51:53:0D`). The leaked string is now non-abusable: Google only honors it from an app signed with those certs. API restrictions left as Firebase's default set.
- [x] `google-services.json` untracked + gitignored, supplied to EAS via the `GOOGLE_SERVICES_JSON` file secret (PR #68).
- [x] GitHub alert #1 closed as `wont_fix` (mitigated).

Open follow-ups:

- [ ] Before the next EAS build, set the file secret: `eas secret:create --scope project --type file --name GOOGLE_SERVICES_JSON --value ./google-services.json`.
- [ ] **When push is wired (W3.3):** add the EAS **dev/preview** keystore SHA-1(s) to the same Android-apps restriction (those builds use different keystores), getting each from `eas credentials` (Android). The restriction has no runtime effect before then: nothing calls Firebase until Phase 3.

Notes:

- The old value stays in git history; that is acceptable for a restricted client key (it already ships in every binary). Restriction, not history rewriting, is the control.
- **Failure signature:** a future Firebase call failing with HTTP 403 / "Requests from this Android client application are blocked" means a signing SHA-1 is missing from this key's Android-apps restriction. Fix (30 seconds): add that build's SHA-1 (Console -> Credentials -> the key -> Application restrictions -> Android apps -> Add). Get a keystore's SHA-1 from `eas credentials` (Android) or Play Console -> App integrity -> App signing.
