# AGBC Global · Project Instructions

Mobile app (iOS + Android) + leader web dashboard for Amazing Grace Bible Church: a multi-branch, diaspora-shaped ministry (Glasgow HQ, Berlin, Emmen, Ogbomosho). The wedge is "belonging made visible": testimonies, the prayer loop, and the global family map.

## Current state (update as it changes)

- **Docs-only repo.** The complete spec lives in `mobile app docs/` (docs 00-25). No code yet.
- The monorepo scaffold (apps/mobile, apps/dashboard, packages/shared, supabase/) lands at work item W0.2-W0.4; when the docs move to `docs/spec/`, update the paths in this file.

## How to work in this repo

1. **`mobile app docs/25-BUILD-PROCESS.md` is the execution playbook.** Every build session follows its session protocol (§1): derive position from git history + the board, pick the next work item, read its Refs, build the slice BE-first, verify, propose the commit. Do not build outside the work-item flow.
2. **The numbered specs win every conflict** about behavior, data, or scope. Prototypes and mockups win on look and feel only.
3. **Design source of truth:** `mobile app docs/design/mockups/entry-flow.html` (all screens, light + dark, tablet, edge states). Figma is parked. `design/SCREENS-CHECKLIST.md` is stale; trust `05` + the HTML.
4. Read the matching `~/.claude/standards/` file(s) before the first session in a domain (backend, database, security, frontend, mobile, qa-testing, devops).

## Stack (decided; see `01`)

- **Mobile:** React Native + Expo (SDK 56+, managed, EAS Build), TypeScript strict, **Expo Router only** (never import `@react-navigation/*`), TanStack Query, Zustand, `expo-audio` (never `expo-av`), `react-native-svg` map, i18next (EN/DE/NL/FR), react-hook-form + zod.
- **Backend:** Supabase (Postgres + Auth email-OTP via Resend custom SMTP, typed code, never magic link + Storage + Realtime Broadcast + Edge Functions). RLS everywhere, `FORCE ROW LEVEL SECURITY`, write-path invariants per `02`.
- **Dashboard:** Next.js on Vercel, same Supabase; centralized authz middleware on every server route.
- **Tooling:** pnpm workspaces, ESLint flat + Prettier, Jest/jest-expo + RNTL, Vitest, pgTAP, deno test, Maestro E2E.

## App identity (NEVER change or regenerate; see `19`)

- Android: `applicationId = com.oami.agbcapp`, `versionCode` >= 20, signed with the EXISTING upload keystore (in EAS credentials; never in the repo, never let EAS generate a new one).
- iOS: `bundleIdentifier = com.olayinkaademiluka.grace-portal`, existing App Store Connect record, existing Apple team.
- This app replaces Grace Portal on the existing store listings. Do not create new app records.

## Supabase environments (see `19`, `24` §1)

- **Production = the existing SHARED project** (ref `fotfplvqsnmbzjjhqlwp`, eu-central-1). It also serves the LIVE church website. Currently on the Free plan.
- **Traffic fence (hard rule):** no app build may point at prod while it is on Free; Pro upgrade precedes the first prod-pointed TestFlight build.
- **Destructive-work gate (hard rule):** no destructive step on prod before the nightly off-provider dump pipeline + one verified restore exist (Track P in `25`).
- Daily loop is LOCAL (`supabase start`); a fresh free-tier project is dev. The migrations folder IS the schema; never change dev/prod directly.

## FENCED SUPABASE OBJECTS (placeholder until the `19` audit fills it)

The shared prod project contains ~3 tables belonging to the agbc website. Once the audit lists them, no migration, policy, or GRANT may reference or modify them; CI fence-guard enforces. Until the list exists, treat every pre-existing object in prod as fenced.

## Conventions (enforced in review)

- i18n keys only; no literal UI strings in components (EN/DE/NL/FR namespaces; FR is net-new, the website has no French strings).
- Every data surface implements all four states: loading, empty, error, offline.
- Guest-first: browsing never requires auth; contribution gates via GateSheet + gate-return.
- Server-trusted: RLS + triggers are the mechanism, never the client or the UI.
- Design tokens only (from `packages/shared` tokens); no hard-coded hex; both themes always.
- Grace-framed copy: encourage, never shame (especially streaks).
- Multi-branch: nothing assumes a single branch or hard-codes Glasgow.
- No em-dashes in any output, file, or message.

## Git

- Never commit or push to `main`; branch per work item (`feat/w<item>-<slug>`), PR into `main`.
- Every commit AND push needs Ayo's explicit approval first (message proposed, approval never carries over). After each push, output the pre-filled PR link.
- No AI attribution anywhere: no Co-Authored-By, no "Generated with" lines, in commits, PRs, or branches.
- Secrets: see the map in `21` §3 / `23` §2. Never in git; the keystore, FCM key, and APNs key live in EAS credentials only. If a secret ever lands in code or git history, stop and rotate it.

## Key references

- Build flow + gates: `mobile app docs/25-BUILD-PROCESS.md`
- Phases + cut lines: `18` · Pre-build accounts/lead times: `24` · Prod migration: `19`
- Schema + invariants: `02` · Ops/CI/testing/jobs: `21` · Git manifest: `23`
- Privacy (GDPR Art. 9, this app is higher-stakes than normal): `20`
