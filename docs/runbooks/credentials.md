# Credentials & Account Inventory

The bus-factor register from `docs/spec/21-OPERATIONS.md` §7: every account the product depends on, who owns it, who the second owner is, and what pays for it. NO secret values ever live in this file; secret locations are mapped in `docs/spec/23-VERSION-CONTROL.md` §2 (password manager, EAS credentials, `supabase secrets set`, GitHub Actions secrets).

Status: skeleton seeded at W0.2 (2026-07-18). Rows marked TBC get filled as accounts are touched; second owners are the open bus-factor action.

| Account | Purpose | Owner | Sign-in method | Second owner | Billing | Notes |
|---|---|---|---|---|---|---|
| Apple Developer (church) | iOS distribution | Church Account Holder (name TBC) | Apple Account | n/a (Ayo joining as Admin, invite pending) | Fee waiver, re-confirmed annually by Account Holder | Last shipped iOS build: 1.0.0 (19) |
| Google Play Console | Android distribution | Ayo | Google account | TBC | $25 one-off, paid | Highest versionCode 19; App Signing SHA-256 recorded in `docs/spec/19` |
| GitHub `AYSamuel/agbc-global` | Repo, CI | Ayo | GitHub + MFA | TBC (ADR 0012: personal account, second owners via collaborators) | Free | Identity for the OAuth sign-ins below; recovery codes in password manager |
| Supabase org | Prod (shared with website) + dev | Ayo | TBC | Church officer TBC | Free (Pro is a pre-TestFlight gate) | Prod ref `fotfplvqsnmbzjjhqlwp`, eu-central-1 |
| Google Cloud / Firebase `agbc-app` | FCM push credentials + app YouTube key | Ayo | Google account | TBC | Free (Spark) | Old Grace Portal project; Android app `com.oami.agbcapp` registered; FCM V1 key + YouTube key in password manager (2026-07-18) |
| Google Cloud `agbc-website` | Website's YouTube key ONLY | Ayo | Google account | TBC | Free | Never share key strings with the app (rotation + quota isolation) |
| Meta Business portfolio | WhatsApp broadcasts (Phase 3) | Ayo (portfolio TBC, month 1) | Facebook profile | TBC | Free; per-conversation broadcast costs | Verification needs incorporation cert + utility bill |
| Resend | Auth OTP email + transactional (via website account) | Ayo | TBC (website account) | TBC | Free tier (3k/month) | Becomes Supabase custom SMTP before first real sign-ins |
| Payhip | Book sales, entitlement webhooks | Lead pastor | TBC | TBC | Payhip fees | API key handoff session planned (`24` row 13) |
| Vercel | Website + dashboard hosting | Ayo | TBC | TBC | Free | agbcglobal.com |
| Domain registrar / DNS | agbcglobal.com, SPF/DKIM/DMARC, AASA/assetlinks | Ayo | TBC | TBC | Domain renewal (date TBC) | Registrar lock + MFA per security standard |
| Expo / EAS | Builds, credentials store, push | TBC (created at W0.11) | TBC | TBC | Free until Starter ($19/mo) at launch | Will hold the Android keystore + FCM key + APNs key |
| PostHog (EU) | Analytics | Ayo | GitHub OAuth | TBC | Free (1M events/mo) | Region-locked eu.posthog.com (created 2026-07-18) |
| Sentry (EU) | Crash reporting | Ayo | GitHub OAuth | TBC | Free (5k errors/mo) | Data Storage Location = EU, unchangeable |
| healthchecks.io | Dead-man pings for jobs | Ayo | Email magic link | TBC | Free (20 checks) | Created 2026-07-18 |
| UptimeRobot | Uptime monitors | Ayo | GitHub OAuth | TBC | Free (50 monitors) | Created 2026-07-18 |
| Twilio | ~~OTP delivery~~ | n/a | n/a | n/a | n/a | DROPPED with email OTP (ADR 0011); no account created |

## Keystore copies (from `21` §7)

The Android upload keystore exists in: EAS credentials (at W0.11) + encrypted vault entry + offline USB in the church safe. Play App Signing means a lost upload key is recoverable via Google support, not fatal.

## Open actions

- [ ] Name and add second owners (church officer) on: Supabase org, password-manager vault, Apple (once Ayo's Admin invite lands)
- [ ] Fill TBC sign-in methods as each account is next touched
- [ ] Record domain renewal date from the registrar
