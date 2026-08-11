# AGBC Global · Project Instructions

Mobile app (iOS + Android) + leader web dashboard for Amazing Grace Bible Church: a multi-branch, diaspora-shaped ministry (Glasgow HQ, Berlin, Emmen, Ogbomosho). The wedge is "belonging made visible": testimonies, the prayer loop, and the global family map.

## Current state

**Derive the real position from git history + the board every session (`25` §1). This section
is an orientation, not a source of truth, and it goes stale between work items: it sat on
"no app code yet" until 2026-08-11, well after the whole of Phase 1 and most of Phase 2 had
shipped. If you find it wrong, correct it in the same change.**

- The complete spec lives in `docs/spec/` (docs 00-25; the old `.dc.html` prototypes in `docs/spec/prototypes/`, ADRs in `docs/decisions/`, runbooks in `docs/runbooks/`).
- **The code exists and is substantial.** `apps/mobile` (Expo Router: every Phase 1-2 screen), `apps/dashboard` (Next: moderation, people, reports, verses), `packages/shared`, `packages/config`, and `supabase/` (48 migrations, 33 pgTAP files, 10 edge functions, seeds, snippets). `pnpm test` runs 670 mobile + 178 dashboard tests. Assume a surface is already built and go read it before planning to build it.
- **In flight:** W2.9 (#135). Slices 1-3 have merged (RSVP, the Academy pathway, and the shared `course_registrations` handoff per ADR 0017). What remains is the "add another email" claim surface, whose backend (`email-claim`, `profile_emails`) is deployed but which has no app screen and no mockup frame yet, so the frame comes first.
- **Next:** W2.10 (#136), analytics + crash reporting + the Phase 2 exit audit.
- **Track P:** P1 (the off-provider backup pipeline) has landed; P2-P6 remain (#17). The destructive-work gate below is therefore partly satisfied, not lifted.

## How to work in this repo

1. **`docs/spec/25-BUILD-PROCESS.md` is the execution playbook.** Every build session follows its session protocol (§1): derive position from git history + the board, pick the next work item, read its Refs, build the slice BE-first, verify, propose the commit. Do not build outside the work-item flow.
2. **The numbered specs win every conflict** about behavior, data, or scope. Prototypes and mockups win on look and feel only.
3. **Design source of truth:** `docs/spec/design/mockups/entry-flow.html` (all screens, light + dark, tablet, edge states). Figma is parked. `design/SCREENS-CHECKLIST.md` is stale; trust `05` + the HTML.
4. Read the matching `~/.claude/standards/` file(s) before the first session in a domain (backend, database, security, frontend, mobile, qa-testing, devops).

## Stack (decided; see `01`)

- **Mobile:** React Native + Expo (SDK 56+, managed, EAS Build), TypeScript strict, **Expo Router only** (never import `@react-navigation/*`), TanStack Query, Zustand, `expo-audio` (never `expo-av`), `react-native-svg` map, i18next (EN/DE/NL/FR), react-hook-form + zod.
- **Backend:** Supabase (Postgres + Auth email-OTP via Resend custom SMTP, typed code, never magic link + Storage + Realtime Broadcast + Edge Functions). RLS everywhere, `FORCE ROW LEVEL SECURITY`, write-path invariants per `02`.
- **Dashboard:** Next.js on Vercel, same Supabase; centralized authz middleware on every server route. Next 16 ships its own current docs at `node_modules/next/dist/docs/`; consult them before dashboard work (its APIs move faster than training data).
- **Tooling:** pnpm workspaces, ESLint flat + Prettier, Jest/jest-expo + RNTL, Vitest, pgTAP, deno test, Maestro E2E.

## App identity (NEVER change or regenerate; see `19`)

- Android: `applicationId = com.oami.agbcapp`, `versionCode` >= 20, signed with the EXISTING upload keystore (in EAS credentials; never in the repo, never let EAS generate a new one).
- iOS: `bundleIdentifier = com.olayinkaademiluka.grace-portal`, existing App Store Connect record, existing Apple team.
- This app replaces Grace Portal on the existing store listings. Do not create new app records.

## Commands (from repo root)

- `pnpm typecheck` · tsc --noEmit across mobile, dashboard, shared
- `pnpm lint` · ESLint (flat, typescript-eslint strict) across mobile, dashboard, shared
- `pnpm test` · Jest (mobile) + Vitest (dashboard)
- `pnpm test:db` · pgTAP via `supabase test db` (local stack must be running)
- `pnpm format` / `pnpm format:check` · Prettier (singleQuote); docs/, supabase/, *.md, and assets are excluded
- `supabase start` / `supabase stop` · local stack (ports remapped to 553xx, see supabase/config.toml)
- `pnpm db:reset` · ALWAYS use this instead of bare `supabase db reset`: it resets local AND re-runs the YouTube sync (sermons are synced, never seeded; a bare reset leaves Watch empty and the app half-featured on device). `pnpm db:sync-sermons` runs just the sync.

## Supabase environments (see `19`, `24` §1)

- **Production = the existing SHARED project** (ref `fotfplvqsnmbzjjhqlwp`, eu-central-1). It also serves the LIVE church website. Currently on the Free plan.
- **Traffic fence (hard rule):** no app build may point at prod while it is on Free; Pro upgrade precedes the first prod-pointed TestFlight build.
- **Destructive-work gate (hard rule):** no destructive step on prod before the nightly off-provider dump pipeline + one verified restore exist (Track P in `25`).
- Daily loop is LOCAL (`supabase start`); a fresh free-tier project is dev. The migrations folder IS the schema; never change dev/prod directly.

## FENCED SUPABASE OBJECTS (audited 2026-07-30, `19` step 1-2 complete)

No migration, policy, or GRANT may reference or modify anything below. CI fence-guard enforces. Full inventory and the ordered cleanup plan: `docs/runbooks/prod-audit-2026-07-30.md`.

**Fenced: one table** (`donations`). Both were fenced on 2026-07-30 as belonging to the LIVE agbc website (verified by grepping `Desktop/agbc`, not from memory: 6 files touch Supabase and reference only these two; no storage, no RPC). `course_registrations` was deliberately unfenced on 2026-08-09; see the row below and ADR 0017.

| Object | Rows | Why fenced |
|---|---|---|
| `public.donations` | 12 | Live website giving. Holds donor PII: `donor_name`, `donor_address`, `email`, `gift_aid_eligible`, Stripe ids |
| ~~`public.course_registrations`~~ | 4 | **UNFENCED 2026-08-09 by ADR 0017.** The app and the website now SHARE this table (guest checkout and member registration are one entity), so the app may add to it. Additive only: none of `course`, `format`, `full_name`, `email`, `city`, `country`, `branch`, `amount`, `currency`, `payment_status`, `stripe_session_id` may be dropped, renamed or retyped without a coordinated change in `Desktop/agbc`. **Prod's ALTER ran 2026-08-10** (reviewed step, behind P1; `docs/runbooks/prod-alter-2026-08-10.md`): prod carries the additive columns, no FKs/triggers/policies until the `19` cutover |

`donations`' dependent objects are fenced too: its indexes (`donations_pkey`, `donations_pi_uniq`, `donations_session_uniq`, `donations_stripe_invoice_id_key`, `donations_user_id_idx`), the FK `donations_user_id_fkey` -> `auth.users(id)`, and its two SELECT policies. `course_registrations`' own indexes (`course_registrations_pkey`, `course_registrations_stripe_session_id_key`) are unfenced with it, and must be preserved rather than replaced.

**Three traps on these fenced tables, all measured. Read before touching the cleanup:**

1. **`donations`' policy `admins read all donations` references `public.users` and the `user_role` enum**, which are on the DROP list. Dropping `public.users` either refuses (dependency) or, with CASCADE, silently deletes that policy, and admin reads of donor records stop working with no error anywhere. Rewrite the policy against `public.profiles` BEFORE dropping anything.
2. **`donations.user_id` FKs to `auth.users` with no ON DELETE, and 4 of the 12 rows point at existing auth users.** `19` step 5 ("remove stale Grace Portal auth users") is therefore refused by the database for those 4. Resolve the FK first; never force it with CASCADE, which would destroy giving records.
3. **`anon` and `authenticated` currently hold SELECT/INSERT/UPDATE/DELETE/TRUNCATE on both tables** (issue #96's default privileges). What actually protects the rows today is RLS: `donations` has only SELECT policies and `course_registrations` has none, so writes are denied. Not reachable through PostgREST, which has no TRUNCATE verb, and the `anon` role has no published direct-connection credentials. The point is fragility, not a live breach: one careless permissive policy and the grants are already in place over donor PII. Fix with #96, and do not widen these grants meanwhile. **ADR 0017 makes this live rather than hypothetical**: the Academy slice is the first thing to put policies on `course_registrations`, and those rows carry a stranger's `full_name`, `email`, `city` and `country`. Scope every one of them to the caller's own registration, revoke the blanket grants and re-grant per column while you are in there (#96), and assert the whole matrix in pgTAP. RLS chooses rows, never columns. An UNLINKED website registration is visible to **admins only**, never to branch leaders (ADR 0017 decision 4), and `profile_id` plus the link trio are server-written only, because a policy that reads a column makes its subject unable to write it (ADR 0015).

**Everything else pre-existing in prod belongs to the retired app and is a drop candidate**, staged behind Track P's backup gate: 13 tables, 48 functions, 21 triggers, 42 policies, 1 view, 6 active cron jobs, the `avatars` bucket, 8 auth users, and the 35-migration history from Jan-Feb 2026.

## Conventions (enforced in review)

- i18n keys only; no literal UI strings in components (EN/DE/NL/FR namespaces; FR is net-new, the website has no French strings).
- Every data surface implements all four states: loading, empty, error, offline. While loading, primary actions that operate on the loading data are hidden, not disabled (no dead buttons under skeletons; decided 2026-07-20).
- Guest-first: browsing never requires auth; contribution gates via GateSheet + gate-return.
- Server-trusted: RLS + triggers are the mechanism, never the client or the UI.
- Authority-bearing columns are part of the security boundary (ADR 0015, W2.7): if an authorization check READS a column, the subject of that check must not be able to write it. `can_moderate_branch()` reads `profiles.branch_id`, so a leader who could edit their own branch could moderate any branch, and every scoping test still passed because each held the leader still. When authority derives from a column, the test matrix must include CHANGING that column, not just acting from each side of it. Related: read authority from the live table, never a JWT claim (`caller_is_admin_live()`, never `is_admin()`), and remember RLS is row-level, so a private column on a row someone else may read needs a different home, not a cleverer policy.
- A private column on a row its subject may read is a GRANT problem, not a policy problem (2026-08-03). RLS decides WHICH ROWS come back and never which columns, so "the author reads their own post" hands over every column on it: `moderation_note`, the safeguarding reason a removal must not disclose, was readable by the author it was written about from W2.7 slice 3 until `20260803140000`. Column privileges are the mechanism (`revoke select on <table>`, then `grant select (col, col, …)`, since a table-level grant cannot be partially revoked), and the whole inventory is asserted in pgTAP so the next column added is a decision rather than an oversight. Two limits worth knowing before reaching for it: every human here is the same `authenticated` role, so a column revoked from members is revoked from leaders too (that is why `moderated_by` stayed and needs a definer read path instead), and a privilege proven in pgTAP still has to be proven through PostgREST, which is a different road (see the safeupdate note in `20260803120000`).
- Privileged actions are audit-logged by a trigger at the data layer, not by each caller (`privileged_actions`, ADR 0015). A caller that has to remember to write the audit row is a caller that will forget. Watch for the actions that change no row and so fire no trigger: those write their own.
- Scheduled work is one pattern (ADR 0016, W2.7 slice 5): `cron.schedule` in the job's own migration calls `jobs.invoke_edge_function('<slug>')`, which reads `project_url` + `service_role_key` from the vault at call time, so the migration is identical in every environment and an unarmed database no-ops. Every job takes a lease and RELEASES it when it finishes (the expiry is only the net under a run that died), derives its work from live state rather than an outbox, records what it sent only AFTER sending, and ends with its healthchecks ping, pinging FAILURE when it could not deliver. Never a GitHub Actions cron (CI budget), never a schedule that lives outside the repo. Local: `pnpm db:reset` arms it; `pnpm jobs:arm-local` re-arms.
- Design tokens only (from `packages/shared` tokens); no hard-coded hex; both themes always. Token values come from the mockup's CSS variables verbatim (never from 05's prose tables; if they disagree, the mockup wins and 05 gets synced in the same change).
- Mockup-first, first-hand: before writing any screen's code, read that screen's frame (HTML + CSS) directly from `docs/spec/design/mockups/entry-flow.html` in the build session. Summaries of the mockup, in ANY form (a subagent's report, 05's prose, memory of the frame), are research input, never the build reference; W1.1, W1.5, and W1.6 all drifted exactly this way. Every screen is then diffed element-by-element against the frame's actual CSS (colors, type sizes, gradients, static vs data-driven regions, selected/edge states) before it counts as done; a behavioral walkthrough is not visual verification. If a surface has no mockup frame (Figma is parked), the mockup comes FIRST: compose the missing frame in `entry-flow.html` from the mockup's existing classes/patterns, get Ayo's approval of the frame, and only then build the screen from it (rule added 2026-07-26; never build a screen straight from imagination or spec prose). **A SURFACE IS A STATE, not a screen** (added 2026-08-08): a guest, empty, or edge variant needs its own frame just as much, and three of them reached the app without one (MY-POSTS guest at W2.6, RHYTHM guest and its none-with-a-milestone variant at W2.8) precisely because a variant does not feel like a new screen while you are building it. Loading, error and offline are the exception: `STATE · loading (skeleton)`, `STATE · error / retry` and `STATE · offline` frame those once for the whole app.
- One visible fact, one owner: any value on screen has exactly one source. Deriving a displayed value from two stores that update independently is the bug, not an implementation detail (W2.4 cost four device-only bugs to this, all invisible to green unit tests). A tap writes to that one source; delivery, retries and offline replay are a separate concern that never becomes a second source of truth.
- Dashboard (from W2.7 slice 1): every server route awaits `authorize()` in `apps/dashboard/src/server/authorize.ts`; `proxy.ts` only redirects signed-out visitors and is never the check. State-changing route handlers call `isSameOrigin()` first (cookies authenticate, so CSRF needs an explicit defense). Copy lives in `src/copy/en.ts`, not i18next: the dashboard is a staff tool and no spec asks for it to be translated, but no component holds a literal string either. Type sizes are rem, derived from the shared token scale, so a reader's own font setting still works; colours and radii come from `src/theme/cssVariables.ts` (generated from `packages/shared`, no hex anywhere). Tests: two Vitest projects, `server` (Node, real tokens from the local stack) and `ui` (jsdom + RTL + axe), split by `.test.ts` vs `.test.tsx`.
- Never assert focus that a FRAMEWORK placed (React `autoFocus`, a router restoring position): it can land and then be dropped again before the next line, which passes locally and fails on a loaded CI runner. Cost two red builds on W2.7 slice 1. Put focus where the test needs it (`await user.click(el)`), assert that precondition, then test the thing you actually mean, usually tab order. Focus that OUR code sets (an error handler moving focus to the field) is fair game, because we control when it happens.
- Grace-framed copy: encourage, never shame (especially streaks).
- Text-scale verification is data-dependent (lesson from #76, 2026-07-26): always test at the DEVICE'S MAXIMUM font setting (not a nominal 200%) with the LONGEST seeded branch name selected (AGBC Lighthouse Berlin), because overflow only appears when long data meets large scale. Control labels (tab bar, segmented controls, pills) cap at ~1.3x and stay single-line per the 05 rule; body text scales fully.
- Multi-branch: nothing assumes a single branch or hard-codes Glasgow.
- Dev-client native fence: the dev builds on the physical devices contain only the native modules linked at their last EAS build (W0.11 as of W1.6). Importing a newly added native module (e.g. expo-clipboard) crashes the route on those clients. When adding one: guard the import so screens degrade until a rebuild (Gradient.tsx and CopyRow.tsx are the patterns), state in the PR that new dev builds are needed, and get Ayo's go-ahead for the EAS builds.
- No em-dashes in any output, file, or message.

## Git

- Never commit or push to `main`; branch per work item (`feat/w<item>-<slug>`), PR into `main`.
- Every commit AND push needs Ayo's explicit approval first (message proposed, approval never carries over).
- PRs: Claude opens them directly with `gh pr create` after the approved push (title, full body, `Closes #N`), overriding the global prefilled-link rule (decided 2026-07-19 after three PRs lost their bodies to the compare-banner path). Ayo reviews and merges ONLY after the checks are green; Claude watches the run and gives the explicit merge signal.
- No AI attribution anywhere: no Co-Authored-By, no "Generated with" lines, in commits, PRs, or branches.
- Secrets: see the map in `21` §3 / `23` §2. Never in git; the keystore, FCM key, and APNs key live in EAS credentials only. If a secret ever lands in code or git history, stop and rotate it.
- CI budget (hard rule): GitHub Actions minutes are a shared pool across ALL of Ayo's private repos. Workflows must be path-filtered, cancel superseded runs, and cost ZERO when idle: no scheduled runs without a real paying job, prefer platform schedulers (pg_cron, Supabase cron) over Actions crons, and docs-only PRs must trigger no jobs.

## Key references

- Build flow + gates: `docs/spec/25-BUILD-PROCESS.md`
- Phases + cut lines: `18` · Pre-build accounts/lead times: `24` · Prod migration: `19`
- Schema + invariants: `02` · Ops/CI/testing/jobs: `21` · Git manifest: `23`
- Privacy (GDPR Art. 9, this app is higher-stakes than normal): `20`
