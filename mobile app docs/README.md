# AGBC Global: Mobile App Build Documentation

This folder is the complete specification for the **Amazing Grace Bible Church (AGBC) Global** mobile app. It is written for an AI or engineering team to build the app end-to-end without needing to reverse-engineer decisions. Every screen, action, data object, and edge case is accounted for.

> **One sentence:** A multi-branch church app whose signature is **belonging made visible**: testimonies, a global "family map," prayer, and cross-branch life that make a scattered, diaspora-shaped ministry feel like one family.

---

## How to read these docs

Read them in order. The numbered files build on each other.

| # | File | What it covers |
|---|------|----------------|
| 00 | `00-OVERVIEW.md` | Vision, the wedge, audience, branches, scope, tech stack at a glance |
| 01 | `01-ARCHITECTURE.md` | System architecture, backend, hosting, cost, dev environment (Windows + iOS) |
| 02 | `02-DATA-MODEL.md` | Database schema: every table, field, relationship |
| 03 | `03-AUTHENTICATION.md` | Phone-OTP auth (WhatsApp-first delivery, SMS fallback), guest vs member, account gates, sessions, roles |
| 04 | `04-NAVIGATION-MAP.md` | Full screen graph: every screen, every action's destination, zero dead ends |
| 05 | `05-DESIGN-SYSTEM.md` | Colors, type, tokens, components, light/dark theming |
| 06 | `06-FEATURE-Onboarding.md` | Splash → branch → language → enter (notification permission is asked in context later, never here) |
| 07 | `07-FEATURE-Home-DailyVerse.md` | Home feed, daily verse, next service, quick actions |
| 08 | `08-FEATURE-Watch-SermonPlayer.md` | Sermon library, live, audio-only, background playback, resume |
| 09 | `09-FEATURE-Family.md` | Testimonies, Glory reactions, prayer→answered→testimony loop, global map |
| 10 | `10-FEATURE-Rhythm.md` | Attendance ("I'm here"), streaks, milestones, devotional plan |
| 11 | `11-FEATURE-Events.md` | Events list, detail, RSVP, branch + global scope |
| 12 | `12-FEATURE-Giving.md` | Link-out giving (v1), currencies, accounts, recurring |
| 13 | `13-FEATURE-Academy.md` | Grace Academy pathway, courses, registration |
| 14 | `14-FEATURE-Store-Library.md` | Bookstore (buy on web), My Library reader |
| 15 | `15-FEATURE-Notifications.md` | Push + WhatsApp, tiers, notification center, deep links |
| 16 | `16-FEATURE-Settings.md` | Settings, theme toggle, language, profile, privacy, account deletion |
| 17 | `17-ADMIN-DASHBOARD.md` | Separate web dashboard for leaders: moderation, broadcast, content |
| 18 | `18-BUILD-PLAN.md` | Phasing, MVP cut lines, milestones, launch checklist |
| 19 | `19-MIGRATION-GRACE-PORTAL.md` | Replacing the existing Grace Portal app: store identity, keystore, Supabase cleanup, OneSignal retirement |
| 20 | `20-PRIVACY-COMPLIANCE.md` | GDPR/UK GDPR: special-category data, consent, retention, DPAs, deletion, age policy, safeguarding |
| 21 | `21-OPERATIONS.md` | Repo/monorepo, CI/CD, testing pyramid, background-job operations, observability, backups, releases, cost meters |
| 22 | `22-CONTENT-OPERATIONS.md` | Content pipelines + owners, launch-content checklist, Family cold-start seeding, localization workflow, analytics plan |
| 23 | `23-VERSION-CONTROL.md` | What lives in git (Supabase config/migrations/functions/seeds, Expo/EAS, docs, ADRs), the never-in-git list, state visibility, repo bootstrap runbook |
| 24 | `24-PHASE-MINUS-1.md` | Pre-build readiness: accounts, access, verified third-party lead times, blocking decisions, Windows setup, first-week plan |
| - | `AUDIT-2026-07-12.md` | The production-readiness audit behind docs 21/22 and the 2026 corrections; Part D lists the prototype deltas |

---

## Source of truth for content

The church's real data lives in the existing Astro website codebase (`agbc/`). The app reuses it:

- **Branches**: `agbc/src/content/branches/*.json` (4 branches: Glasgow HQ, Berlin, Emmen, Ogbomosho)
- **Giving accounts & currencies**: `agbc/src/lib/site.ts`
- **Sermons**: YouTube channel `@Pastorolayinkaademiluka`
- **Courses / Academy**: `agbc/src/content/courses/*.json`, `agbc/src/content/academy/*.json`
- **Copy & i18n**: `agbc/src/i18n/ui.ts` (EN / DE / NL)

Wherever this spec needs a real value (a service time, an account number, a pastor's name), it is taken from those files and cited.

## Working design references (in this project)

These interactive prototypes demonstrate the intended **look and feel**. On behavior, **the docs win every conflict**. The contradiction-level deltas were patched on 2026-07-13 (onboarding, consent + moderation copy, phone-OTP-only auth, map retagged v1, GIVE-BANK added; both wrappers now embed AppFull; AppPrototype is deprecated). What remains are absences: screens the docs spec that the prototypes don't demonstrate, listed in `AUDIT-2026-07-12.md` Part D and in `18`'s prototype note; build those from the docs.

- `App iOS + Android.dc.html`: the full app in both device frames (primary reference)
- `AppFull.dc.html`: the app component (all screens, theming)
- `App Guest vs Member.dc.html`: guest vs signed-in comparison
- `App Screen Map.dc.html`: visual screen graph (~57 screens/states)
- `App Blueprint.dc.html`: system blueprint (journey, auth, data)

---

## Non-negotiables (the spirit of the product)

1. **No dead ends.** Every button, row, and tap has a defined destination and a defined empty/error/loading state.
2. **Guest-first.** The app is fully browsable without an account. Accounts are only required to *contribute* (post, react, RSVP, register, track rhythm).
3. **Belonging is the wedge.** Testimonies + prayer + the global map are first-class, not buried utilities.
4. **Grace-framed, never guilt-framed.** Streaks and milestones encourage; they never shame a broken streak.
5. **Three languages.** UI in English, German, Dutch. Content (devotional/plan) English in v1.
6. **Multi-branch by design.** Nothing assumes a single location. Branch context shapes times, events, and feeds.
