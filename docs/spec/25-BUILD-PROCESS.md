# 25 · Build Process: The Execution Playbook

`18-BUILD-PLAN.md` defines WHAT ships in each phase and where the cut lines are. This doc defines HOW the build actually runs: an ordered flow of work items that Claude builds through, session by session, with Ayo approving commits and decisions. It never redefines scope; on any conflict about behavior or scope, the numbered specs win.

The flow is **vertical slices, not a strict backend-then-frontend wall**: each work item carries its own backend piece (migrations, RLS, tests, seeds, functions) and lands it before the screens that consume it. The schema from `02` accumulates domain by domain as the flow reaches each feature; by Phase 4 the migrations folder holds all of it.

Written 2026-07-18, at the moment the repo is docs-only and no code exists. Work items below are numbered `W<phase>.<n>` and are intentionally sized to roughly one session each (the marked ones are multi-session).

---

## 0. Where we stand today

| Area | State |
|------|-------|
| Product spec | Complete: docs 00-24, audited (`AUDIT-2026-07-12.md`) and remediated; decisions log current in `BUILD-READINESS-TRACKER.md` |
| Design | Complete as an HTML prototype: `design/mockups/entry-flow.html` is the canonical visual/interaction reference (every screen, light AND dark, tablet landscape + portrait, edge/in-screen states; see `05`). Figma is parked. `design/SCREENS-CHECKLIST.md` predates the final design sessions and is stale; trust `05` + the HTML file |
| Repo | `agbc-global` on GitHub, `main` PR-protected, docs committed. Monorepo scaffold NOT yet created (steps 5-11 of the `23` §4 runbook remain) |
| Code | None. Phase -1 accounts (Meta for broadcasts, Apple invite, FCM, observability, etc.) not started. The Twilio + NG sender-ID rows were dropped with the email-OTP decision (2026-07-18, `03`): Phase -1 now contains no paid item and no auth-blocking fuse |
| Readiness gates | See `BUILD-READINESS-TRACKER.md`: Gate 1 (wedge interviews) runs in parallel and does not block Phases 0-1; Gate 2 owners must be named before Phase 2; Gate 4 (backup pipeline, NDPA) gates prod work only |

**Conclusion: the build can start now.** Nothing gates Phase 0 or Phase 1 except the scaffold itself and the Phase -1 fuses that must be lit on day 1 (they run in the background for weeks; see `24`).

---

## 1. Session protocol (how every build session runs)

**Start of session:**
1. Locate position: `git log --oneline -15`, open PRs, and the GitHub Project board / current milestone (once W0.2 creates them; until then, this doc's work-item order + git history is the position). Never work from memory of a previous session.
2. Pick the next work item whose dependencies are merged. Do not start an item mid-way through another; if an item is half-done, finish or explicitly park it with a note in its issue.
3. Read that item's **Refs** (the numbered docs listed) and open the matching frames in `design/mockups/entry-flow.html` for any UI work. Read the matching `~/.claude/standards/` file(s) if this is the first session in that domain.
4. Confirm the item's backend contract state: if the item consumes tables/functions from an earlier item, verify those migrations and tests are merged and CI is green.

**During:**
- One work item = one branch = one PR. Branch names: `feat/w1-3-watch`, `fix/…`, `chore/…`, `docs/…`.
- Follow the track process (§4 backend, §5 mobile, §6 dashboard) and the PR rules (§7).
- If the spec turns out wrong or ambiguous while building: stop, flag it, propose the doc fix, and land the doc fix in the same PR once agreed. Never silently diverge.

**End of session:**
- Run the item's **Done** checks and capture evidence (test output, screenshots).
- Propose the commit message and push; wait for Ayo's approval (every commit and push, per his git rules; no AI attribution anywhere). Provide the pre-filled PR link after push.
- Update the item's checklist issue / board card. State the resume point in one sentence if the item continues next session.

---

## 2. The build flow

### Phase 0 · Foundations

**W0.1 · Phase -1 day-1 sweep** (with Ayo; runs in background for weeks)
- Refs: `24` §1 + §4.
- Build: request Apple Admin invite; look up highest Play versionCode + App Signing SHA-256; Firebase project + FCM V1 key; YouTube Data API key; create PostHog EU (EU region), Sentry (EU region at org creation), healthchecks.io, UptimeRobot accounts; Everything here is free and same-day: the Twilio cluster and NG registration went with email OTP (2026-07-18), and Meta business verification, the sender number and the tier ramp went with ADR [0014](../decisions/0014-push-only-broadcasts.md) (2026-07-29). No external fuse remains.
- Done: every `24` §1 row has an owner and a status; long fuses submitted; tracked as a checklist issue.

**W0.2 · Repo restructure + workspace bootstrap**
- Refs: `23` §4 steps 5-6 + 9-11, `21` §1, `24` §2.
- Build: `git mv "mobile app docs" docs/spec` (prototypes to `docs/spec/prototypes/`); root `package.json` (`private`, `packageManager` pnpm pinned), `pnpm-workspace.yaml`, `.nvmrc`, `.editorconfig`; `docs/decisions/` with the ten backfilled ADRs (`21` §1); `docs/runbooks/credentials.md` skeleton; project `CLAUDE.md` per `24` §2.7 (identity block, fenced-objects placeholder, conventions, secrets-map pointer); GitHub Milestones (Phase -1..4), Project board, checklist issues from docs 18/19/22/24.
- Done: workspace installs with pnpm; board exists; CLAUDE.md merged.

**W0.3 · Local Supabase + supabase init**
- Refs: `23` §1, `24` §3.
- Build: Docker Desktop + WSL2 checked (port-collision check from `24` §3); `supabase init` at root; commit the clean scaffold before any migration; `supabase start` runs; seeds folder structure (`00-common.sql`, `10-dev-only.sql` globbed via `[db.seed]`).
- Done: local stack up; scaffold committed clean.

**W0.4 · App + dashboard + shared scaffolds**
- Refs: `19` (identity values), `24` §2.4, `21` §1.
- Build: `create-expo-app` in `apps/mobile` (TS strict, Expo Router, SDK 56+); `app.config.ts` with `com.oami.agbcapp` / `com.olayinkaademiluka.grace-portal`, versionCode base 20, `runtimeVersion: fingerprint`; internal structure per `24` §2.4 (`app/` thin routes, `src/features/`, `src/components/ui/`, `src/lib/`, `src/theme/`, `src/i18n/`, `src/state/`); Next.js scaffold in `apps/dashboard`; `packages/shared` (contracts + types + tokens placeholder); `.env.example` per app.
- Done: both apps boot locally (blank); workspace graph resolves.

**W0.5 · Lint, format, test harnesses**
- Refs: `24` §2.2-2.3, `21` §4.
- Build: ESLint flat config (expo + next + typescript-eslint strict) as a shared config package; Prettier (`singleQuote`); Jest + `jest-expo` in mobile, Vitest in dashboard, empty first test in each; pgTAP harness (`supabase test db` runs green on zero tests).
- Done: `pnpm lint`, `pnpm test`, `supabase test db` all green from root.

**W0.6 · CI/CD skeleton**
- Refs: `21` §3, `23` §2.
- Build: `pr.yml` path-filtered jobs (mobile: typecheck/lint/jest/expo-doctor; dashboard: typecheck/lint/vitest/build; supabase: start + full-history apply + pgTAP + types-drift; the fence-guard grep was removed with its subject on 2026-08-17, ADR 0023); `supabase-deploy.yml` (merge to main → dev; prod = manual `workflow_dispatch` using `production` environment secrets); `nightly.yml` stub; Renovate config; secrets placed per the `21` §3 map (nothing secret in the repo).
- Done: CI green on the empty workspace; a deliberately failing pgTAP file fails CI, then is removed.

**W0.7 · Design tokens, fonts, theming**
- Refs: `05` (tokens + theming + status bar), `24` §2.6.
- Build: `packages/shared/src/theme/tokens.ts` with the exact `05` light/dark values (consumed later by dashboard Tailwind too); Bricolage + Hanken via `@expo-google-fonts` + expo-font config plugin (static weights); ThemeProvider (`system|light|dark`, AsyncStorage persistence); status bar re-themes with the theme.
- Done: demo screen shows both themes with correct tokens/fonts on device; toggling theme re-themes status bar.

**W0.8 · UI primitives with the accessibility contract** (multi-session)
- Refs: `05` components table + accessibility contract + tablet rules; `frontend-bootstrap` skill stages.
- Build: `Screen` (safe area, scroll, refresh, width classes), `AppHeader`, `TabBar`, `Button` (4 variants, ≥44px), `Card`, `Eyebrow`, `Chip`, `SegmentedControl`, `EmptyState`, `Skeleton` (hidden from assistive tech), `Toast` (live region), `GateSheet` (focus trap) plus a dev-only gallery route rendering all primitives in both themes for screenshot checks. Roles/labels/reduced-motion per the `05` contract from the first version.
- Done: gallery verified at small phone / large phone / tablet width / 200% text scale, both themes; RNTL smoke tests per primitive.

**W0.9 · i18n wiring**
- Refs: `16` Localization, `24` §2.5, `22` §4.
- Build: i18next + expo-localization + `@formatjs` Intl polyfills (Hermes); locale files `{en,de,nl,fr}/{common,home,watch,family,give,events,auth,settings,errors}.json`; keys-only rule wired into lint if practical; port existing strings from the website's `ui.ts` where they map (FR is net-new: the website has no French).
- Done: demo screen switches EN/DE/NL/FR live; DE and FR plurals render correctly.

**W0.10 · Core schema: identity + config domains**
- Refs: `02` (branches, branch_services, profiles, devices, notification_prefs, app_config, giving_config; conventions + policy matrix + invariants that touch profiles), `21` §4.
- Build: migrations for those tables with FK indexes, `FORCE RLS`, policies per the matrix; custom access token hook (role/branch claims); profiles triggers (role immutability, notification_prefs auto-create); versioned seed for branches WITH the augmentation map (lat/lng, timezone, slug: the JSON lacks them, `02`) + `branch_services` rows + giving config from `site.ts`; pgTAP: policy rows + role self-promotion fails + anon reads only what the matrix allows; regenerate `database.types.ts`.
- Done: fresh-DB apply + pgTAP green in CI; seeded branches queryable locally with correct coordinates and timezones.

**W0.11 · EAS + devices**
- Refs: `01` §2, `19`, `24` §4 day 3.
- Build: EAS project + `eas.json` profiles (development/preview/production, channels, remote versions, autoIncrement); upload the existing Android keystore to EAS credentials (verify it is NOT in the repo first); Apple signing via EAS; `eas device:create` for the iPhone (+ Developer Mode on); kick off both development builds; install on both phones.
- Done: `18` Phase 0 exit: themed blank app with working hot reload on the physical Android AND iPhone via EAS dev builds; CI green.

### Phase 1 · Guest shell (no auth)

**W1.1 · Onboarding slice**
- Refs: `06`, `04` entry graph, mockup frames SPLASH/ONB-1/2/3.
- Build: bundled read-only branch snapshot (same seed data) as offline fallback; SPLASH (1.2s, first-launch routing), ONB-1 (incl. "I'm just looking"), ONB-2 (language, immediate relocalization), ONB-3 (branches from backend, fallback to bundle); local persistence (branch/language/theme); no notification prompt anywhere here. (Language-before-branch order decided 2026-07-20, landed with W1.2.)
- Done: `06` acceptance criteria; guest reaches Home in ≤3 taps; first-launch-offline path works (airplane-mode test).

**W1.2 · App shell + guest settings**
- Refs: `04` global rules + MORE, `16` (theme/language rows), `21` §8 (forced update).
- Build: 5-tab bar; MORE hub with all rows (auth-needing rows open GateSheet later; route stubs must still be real screens, never dead ends); SETTINGS with theme + language + about/legal links (guest-level); forced-update gate reading `app_config.minimum_supported_version` on launch (cached; fake the minimum to test).
- Done: every MORE row navigates; forced-update blocking screen verified by faking the minimum.

**W1.3 · Watch slice: sermons domain + video** (multi-session)
- Refs: `08`, `02` (sermons, playback_positions, sermon_notes, saved_items), `21` §5 (sync job).
- Build BE: sermons domain migrations (partial unique `youtube_id`, `status`) + RLS + pgTAP; YouTube sync edge function (playlistItems.list, upsert on conflict, unavailable/restore logic, dead-man ping) + `deno test`; dev seed of a few sermon rows.
- Build FE: WATCH tab (hero, rails, search entry), WATCH-SEARCH, SERMON player (YouTube via `react-native-youtube-iframe`, "Open on YouTube" fallback, ToS box rules from `08`); guest playback only (resume/save/notes gate in Phase 2).
- Done: `08` guest criteria; sync run against the real channel on dev; four states on WATCH; sermon rot state renders.

**W1.4 · Home slice (guest) + daily verse**
- Refs: `07`, `02` (daily_verses), mockup HOME frames.
- Build BE: daily_verses migration + RLS + 90-day dev seed (WEB translation).
- Build FE: HOME composition per `07`, in its stated order and with no quick-actions row (verse card WITHOUT devotional CTA until Phase 4; next service computed from `branch_services` incl. the zero-rows fallback; testimony highlight placeholder until W1.5 then wired; latest message; guest Join card); midnight rollover invalidation; BRANCH-SWITCH sheet (browse-context only at this stage); verse share (branded image/text).
- Done: `07` guest-relevant criteria; offline renders cached verse + service card.

**W1.5 · Family read-only slice: the wedge domain lands** (multi-session, the heaviest migration set)
- Refs: `09`, `02` (testimony_categories, testimonies, prayers, glory_reactions, prayer_intercessions, reports, blocked_users; ALL write-path invariants; realtime broadcast rules), `21` §4.
- Build BE: the full Family domain migrations: content tables + lookup + reaction/intercession tables + reports + blocked_users; every invariant trigger (born-pending, authorship forcing, re-pend on edit, counter triggers, intercession state machine, from_prayer_id guard, mark-answered preconditions, removed-terminal, is_anonymous rules, compare-and-set moderation); RLS incl. block filtering both ways and anonymous author stripping; realtime broadcast triggers on private channels + removal signal (a custom sanitizing `realtime.send()`, NOT `broadcast_changes()` which streams the raw record and cannot strip an anonymous `author_id`; matches `02` §Realtime, synced W1.5); pgTAP for EVERY invariant bypass attempt (`21` §4 list) and anonymity leak checks; seed pre-approved dev testimonies/prayers.
- Build FE: FAMILY tab read-only: Testimonies feed, Prayer feed (praying/prayed counts visible), scope toggle (default Everywhere), TESTIMONY-DETAIL / PRAYER-DETAIL read views, language tags, realtime subscription on focus + 60s polling fallback; the SVG world map (bundled topojson, branch pins + testimony pins, both themes) per `09`/`01`.
- Done: pgTAP suite green (this is the trust anchor for the whole app); feeds + map render seeded data live-updating on dev; anonymous prayer shows "A member" with no author_id anywhere in the payload (verify against the network trace, not the UI).

**W1.6 · Give slice**
- Refs: `12`, mockup GIVE/GIVE-BANK frames.
- Build: GIVE tab (card → web via `expo-web-browser`, PayPal, reassurance copy); GIVE-BANK from `giving_config` with per-field copy + toast, fully offline-capable (cached config); currency selector.
- Done: `12` acceptance criteria incl. offline bank details and correct `site.ts` values.

**W1.7 · Church + events (read) slice**
- Refs: `04` church screens, `11`, `02` (events, rsvps).
- Build BE: events + rsvps migrations + RLS + pgTAP (incl. cancelled/started RSVP refusal trigger, ready for Phase 2) + dev seed events; contact-form edge function (to church inbox) + contract + test.
- Build FE: BRANCHES, BRANCH-INFO (services from branch_services, directions, "Watch this branch" chip action, no-coordinates edge case), ABOUT, CONTACT (draft preserved on failure); EVENTS list + EVENT-DETAIL read-only (branch vs ministry-wide scoping, cancelled treatment, timezone display).
- Done: `11` read criteria + `04` church-screen specs; every screen four-states verified.

**W1.8 · Phase 1 exit audit**
- Refs: `18` Phase 1 exit, `04` dead-end checklist.
- Build: sweep every screen against `04` (each action has a destination; empty/loading/error/offline verified); Maestro smoke journey (guest browse Home > Watch > Family > Give bank details) wired into nightly; fix everything found.
- Done: a visitor can explore the whole church with no account and no dead ends, on both platforms, both themes.

### Phase 2 · Auth + contribution (the wedge live) + Dashboard Phase A

**W2.1 · Auth BE + OTP screens** (multi-session)
- Refs: `03`, `02` (profiles gates), `24` §1 rows 11-12.
- Build BE: Supabase email OTP (the 6-digit code in the template via `{{ .Token }}`, never a magic link); Resend custom SMTP for preview/prod, local Mailpit for dev; localized templates (EN/DE/NL/FR); rate limits + lockout config; review-bypass flag per `03` (enabled dev/preview, off prod); LargeSecureStore session adapter.
- Build FE: AUTH-1 (email entry, "why" copy), AUTH-2 (code, sent-to indicator, spam-folder hint, change email, resend, all error states incl. total-outage copy), AUTH-3 (profile setup: name, home branch prefilled, language, 16+ declaration → `onboarded_at` + `age_confirmed_at` in one update), AUTH-4 (success + return); half-created-profile routing (session with NULL `onboarded_at` → AUTH-3).
- Done: `03` flow + edge cases; sign-in works on dev with the fixed-code review email; killed-mid-AUTH-3 resume verified.

**W2.2 · GATE + gate-return**
- Refs: `03` (gate + security rules), `04`.
- Build: GateSheet wired to every gated action; in-memory pending-action store (session-scoped, lifetime rules, allowlisted deep-link navigation only); "Not now" per-action session memory.
- Done: unit tests on the gate-return state machine; Glory-gate-return E2E (tap as guest → sign in → reaction lands, stay in place).

**W2.3 · Compose slice: testimony + prayer + consent**
- Refs: `09` compose flow, `20` (Art. 9 capture), `02` (consent columns).
- Build: TESTIMONY-COMPOSE / PRAYER-COMPOSE (category, photo pick for testimonies, is_anonymous for prayers), CONSENT step (versioned wording file in repo; re-runs after draft restore), POST-PENDING, draft persistence; photo upload to the private bucket (size cap, re-encode, EXIF strip) with signed-URL display only for approved rows.
- Done: submits land `pending` (confirm the trigger, not the client, forces it); drafts survive process death; consent version + timestamp recorded.

**W2.4 · Reactions + offline queue slice**
- Refs: `09` (Glory, two-step prayer), `01` §8 (end-state queue), `02` (counters).
- Build: GloryButton (burst + reduced-motion variant + live-region count), "I will pray" → "I prayed" two-step with counts; the offline write queue (desired end-state per entity, replay on reconnect, eviction reverts optimistic UI, cleared on sign-out) covering glory/intercession/RSVP/attendance/plan-complete/playback.
- Done: queue reducer unit-tested (tap-untap-tap replays as one write); counters verified server-maintained; offline tap replays correctly after airplane mode.

**W2.5 · The loop: answered → testimony**
- Refs: `09` loop, `02` (from_prayer_id invariants).
- Build: MARK-ANSWERED (server-checked preconditions, undo rules), prefilled linked TESTIMONY-COMPOSE, answered ribbon + reverse link with visibility-degradation rules.
- Done: full loop E2E on dev: prayer → approve (dashboard) → commit → prayed → answered → testimony → approve → ribbon links both ways.

**W2.6 · MY-POSTS + report + block**
- Refs: `09` (MY-POSTS, post actions), `02` (reports, blocked_users), `16` (blocked list).
- Build: MY-POSTS with status chips + rejection reason + edit-and-resubmit (re-pends via trigger); `⋯` on detail headers (own: POST-ACTIONS edit/delete; others: REPORT, Block); Settings → Blocked members with unblock.
- Done: block hides content both ways immediately (feed + realtime drop); re-report is a no-op; edit of an approved post re-pends.
- **Amended 2026-08-03 (while building):** this item was scoped as front-end only, on the basis that W1.5 had landed `reports` and `blocked_users` with their policies and guards. It had, and two reads the approved frames need still had no path, so W2.6 carries two small migrations of its own. `public.blocked_members` (a security-definer view keyed on `blocker_id = auth.uid()`) exists because `profiles` SELECT is own-row + leaders-in-branch, so a member could read the record of their own block and not the NAME on it, and an unblock list of uuids is a list nobody can act on. `is_mine` on both feed views exists because `prayer_feed` strips `author_id` for an anonymous request unconditionally, including from its author, so the one member who should be offered Edit and Delete was the one the row refused to name. Both are asserted in `027`. The lesson for later items: "the backend for this landed already" is a claim about tables and policies, and a screen also needs a READ PATH for every value it draws.

**W2.7 · Dashboard foundation + Phase A: moderation + verses** (multi-session; blocks Phase 2 exit)
- Refs: `17` (platform, authz rule, module 1 + verse CRUD), `21` §4 (IDOR tests).
- Build: dashboard auth (same identity, role-checked), centralized authz middleware on every server route (no client-supplied authority), passkeys for admins + step-up actions; moderation queue (approve/reject-with-reason/remove, compare-and-set, reports inbox, 48h escalation job, safeguarding guideline surfaced in UI copy); daily-verse CRUD + CSV batch import; IDOR probes in CI; moderation pushes to leaders (in-app/email until push lands in Phase 3).
- Done: `17` module 1 flows work against dev; a leader can only touch their branch (proven by tests, not the UI); verse queue alert job pings healthchecks.
- Note: moderation actions here are the dependency for W2.5/W2.6 verification; build W2.7 in parallel with W2.3-2.6 and no later.
- Amended 2026-07-29: **role assignment is pulled forward from Phase B** (`17` module 5) into W2.7, after the moderation-actions slice. The queue is built for branch leaders, and until a role can be assigned there is exactly one admin and no leaders, so the whole module would be a single-user tool and the branch scoping W2.5/W2.6 depend on would never be exercised by a real leader. See `docs/spec/plans/W2.7-dashboard-phase-a.md` slice 3.5.
- Amended again 2026-07-29 after PR #101: role assignment and **branch moves** are one
  slice, decided in **ADR 0015** and specced in
  `docs/spec/plans/W2.7-people-roles-and-branch-moves.md`. Reason: the
  branch half was a live privilege-escalation hole (a leader could move their own profile
  into another branch and moderate it), and closing it removed the last write path to
  another member's profile, so both halves now need the same `SECURITY DEFINER` path, the
  same audit table and the same step-up. This slice reaches the APP as well as the
  dashboard. Its mockup frames do not exist yet and composing them is a blocking gate.
- Amended 2026-08-06 (slice 5, the last): this item also lands the project's FIRST scheduled
  work, so it carries the pattern the items above inherit rather than only its own two jobs
  (ADR [0016](../decisions/0016-pg-cron-plus-edge-functions-for-scheduled-work.md), `21` §5
  corrected in the same PR). Delivery is email + the dashboard's own queue: push is W3.3, and
  a leader's moderation work has no screen in the app to deep-link to at all, which is why
  these alerts do not go through `notifications` (that table stays W3.3's, with the
  partition-vs-unique conflict in `02` for it to resolve).

**W2.8 · Member Home + Rhythm slice**
- Refs: `10`, `07` (member Home, branch-context model), `02` (attendance/streaks/milestones).
- Build BE: attendance + streaks + milestones migrations, `client_taken_at` clamp trigger, streak recompute trigger + weekly cron safety net, milestone inserts; pgTAP (backdating fails, service_date derivation, ISO-week math incl. DST cases in unit tests).
- Build FE: member Home (named greeting, streak strip, inline Glory); "I'm here" on next-service card (idempotent second tap copy) + visiting-branch semantics; RHYTHM screen (streak, milestones, history, grace-framed pauses); milestone celebration overlay (reduced-motion variant); in-context notification pre-permission sheet on first "I'm here"/RSVP per `06`.
- Done: `10` acceptance criteria minus the plan (Phase 4); streak math unit tests cover the DST/timezone matrix; live-watch credit deferred to W3.2 and noted.
- **Backend landed 2026-08-07** (`20260807120000`, pgTAP `030`), with the plan doc
  `docs/spec/plans/W2.8-member-home-and-rhythm.md`. Two things to know before the screens: the
  DST matrix lives in **pgTAP rather than in mobile unit tests**, because the maths is
  server-side (the timezone is applied in exactly one SQL function and the app never repeats
  it); and the grace-versus-consecutive conflict between `02` and `10` was resolved in favour
  of `10` (one missed week is covered), with both docs corrected.

**W2.9 · RSVP + Academy + profile slice**
- Refs: `11` (RSVP), `13`, `02` (courses tables), `16` (profile edit), ADR 0017.
- Build BE: courses + course_fees_regional + course_registrations + course_interest migrations + RLS + pgTAP (cancel-only transition, partial unique) + seed conversion script (symbol majors → minor units + ISO currency, NG overrides).
- **Amended 2026-08-09 (ADR 0017, while building slice 2):** `course_registrations` is ONE table SHARED with the live website, so the backend also carries `profile_emails` + the claim flow (`email-claim`, **since retired: see the FE line**), the handoff (`course-handoff` + redeem RPC), the column-grant matrix on the shared table, and the fence-guard update; the app never writes a registration, and the REGISTER / REGISTER-CONFIRM screens are retired (`13`). The website's flag-gated half of the handoff lives in `Desktop/agbc` (PR opened from this slice; merged behind Track P P1 sequencing).
- Build FE: RSVP on EVENT-DETAIL (going/interested/cancel, gate, add-to-calendar via expo-calendar, share); ACADEMY pathway, COURSE (Register hands off to the website; already-registered + cancel), upcoming → Notify me (`course_interest`); ~~the "add another email" claim surface~~ (**cut 2026-08-11**, ADR 0017 amendment: the self-service claim is retired, its RPCs, ledger and edge function dropped, and the leader-linking tool on the dashboard becomes the only fallback for the different-address member); profile edit (name, avatar upload). **Amended 2026-08-10 (slice 3, in-session):** members do NOT cancel from the app; the registered state's action is "Email us about this registration" through the contact-form path, and staff cancel manually (`13`). Notify me is an online-only write (no new W2.4 queue kinds). The handoff token is minted NOW and appended even while the website ignores it (agbc-website#42 parked); fee display is base fee + regional note. **Home branch is NOT edited here** (ADR 0015): it moved into the W2.7 people slice as a request-and-approve flow, with a second entry point on the `BRANCH-SWITCH` sheet (`07`). If that slice has shipped by the time this item runs, this screen only links to it.
- Done: `11` + `13` acceptance criteria; RSVP against a cancelled event rejected server-side and reconciled quietly.

**W2.10 · Analytics + crash reporting + Phase 2 exit**
- Refs: `22` §5 (event list + north stars), `20` (consent gating), `01` §7, `18` Phase 2 exit, ADR 0020.
- Build: PostHog EU (anonymous/cookieless or opt-in per `20`), the ~20 v1 events with standard properties; Sentry (app + dashboard + edge) with PII scrubbing; then the exit audit: Family loop E2E both platforms, nothing publishes without approval (attempt the bypasses once more via the app), Maestro journeys extended (OTP sign-in, post testimony → pending, Glory gate-return, RSVP, block).
- Done: `18` Phase 2 exit; north-star events visible in PostHog from a dev device.
- **Sliced 2026-08-12 into three, with the native rebuild between 1 and 2** so both SDKs ride one EAS build rather than two:
  1. **The spine (landed 2026-08-12).** ADR 0020 settled the four decisions `20` had left open or contradictory (opt-in, device-scoped consent, no `identify()`, crashes not gated), and the two surfaces it needs were composed in `entry-flow.html` and approved BEFORE any code: `ANALYTICS-ASK` and the switch in SETTINGS' "Privacy & data". What landed: the typed tracking plan in `packages/shared` (all ~20 events, the six deferred ones naming their owning item), the consent store + gate, the PostHog client, Sentry across app + dashboard + edge with the scrubbing asserted in tests, and the shared `ToggleRow`/`ToggleList` that NOTIF-PREFS (W3.3) inherits. PostHog turned out to need NO native module (every native-ish peer is optional; it takes our AsyncStorage), so Sentry alone is why the dev clients need rebuilding.
  2. **Instrumentation (landed 2026-08-13, #169).** The 17 events with `fires: 'app'` are wired at the mutation/hook layer (`EVENT_SOURCE` in `packages/shared/src/analytics/events.ts` is the register; an earlier revision of this line said 14, which was a miscount), verified on the wire (real SDK, faked network) and confirmed arriving in PostHog EU project 227300 from the Android dev device, every event tagged `environment=development`. `gate_converted` fires from the replay executor (the one place that knows the action AND its outcome), and `own_branch`/`visiting` compare against the member's HOME branch, not the browsed chip. The fifth standard property `environment` exists because PostHog's free plan allows one project (ADR 0020 amendment): every insight must filter on it or the wedge baseline includes our own testing. Three DSN/token placements remain owed and each fails silently, so `docs/runbooks/credentials.md` §"Observability values" is the authority: the dashboard's DSN at its first Vercel deploy, and the edge DSN at the `19` cutover (`SENTRY_AUTH_TOKEN` landed 2026-08-13).
  3. **The exit audit (landed 2026-08-14).** Six Maestro journeys on the Android device, all green in one sequential run from a fresh DB (`apps/mobile/maestro/`: guest-smoke, otp-signin, post-testimony-pending, glory-gate-return, rsvp, block, sharing `subflows/signin-review.yaml`; runner setup + traps in the `maestro-e2e-runner` memory). The publish bypasses were re-attempted and all refused, at the app layer (post → pending → invisible in the public feed, visible only in MY-POSTS) and the RLS/trigger layer (a member's insert with `status=approved` lands `pending`; author self-approve and cross-author approve/moderate both affect 0 rows). **iOS E2E is owed, not skipped:** there is no iPhone in the project yet, so the iOS half of the loop cannot run; record it as a launch-checklist item for when an Apple device exists. Two things a signed-in member still sees are recorded in `18`, neither a Phase 2 miss: the mobile More tab renders its guest join card + "My Library · Sign in" (the member "My life" section is this file's own W3.3 item, line 252; W1.2 built the hub with the card as a stand-in), and Sentry stamps city-level geo on crash events from the sending IP even with `sendDefaultPii:false`.

### Phase 3 · Media depth + notifications + Dashboard Phase B

**W3.1 · Audio slice** (multi-session) · **COMPLETE 2026-08-15**, five slices: the shelf (1a), the dashboard upload (1b), the native rebuild (2), the player (3), the member surfaces (4) and message artwork (5). The slice plan that carried the working decisions was deleted on landing per its own instruction; everything it decided now lives in the specs below, in ADR 0015-0020, and in the migrations' own headers.
- Refs: `08` (expo-audio spec), `02` (storage buckets), `17` §4 (upload).
- Build BE: `sermon-audio` bucket + posture decision from `08` (**taken 2026-08-14 with slice 1: private bucket, signed URLs, 24h TTL, minted on player open; `02`/`08` record it**); dashboard sermon-audio upload + metadata attach (**pulled from `17`'s Phase C into this item, decided 2026-08-14: the audio promise has no supply line without it; `17`'s phasing note amended in the same PR**). Plus the `sermon-artwork` bucket and `sermons.artwork_path` (**slice 5, 2026-08-15: PUBLIC-read, deliberately not the audio's posture, because the audio is the asset and the artwork is the advertisement for it; the full argument and its three costs are in `02` §Storage**).
- Build FE: expo-audio engine (background config plugin, `setActiveForLockScreen`, interruption handling), audio-only toggle (only when `audio_path`, tooltip otherwise), ±15s, speed, throttled `playback_positions` writes + resume, SERMON-NOTES + MY-LIST + Save (now gated member features live). NOTE: the DEVICE-LOCAL half of resume (guests included) shipped early during the Watch/Home window (decision 2026-07-20, `08`); what remains here is the server-synced member layer that carries the position across devices.
- Done: `08` acceptance criteria: background + lock-screen playback survives 10+ minutes on both physical devices; resume within seconds; Play Console mediaPlayback declaration noted for release.

**W3.2 · LIVE slice · CUT 2026-08-15 (ADR 0021)**
- **Not deferred, removed.** Members are not to join a live stream from inside the app, so there is nothing here to build later. The item is kept in this list rather than deleted so the numbering of W3.1/W3.3 stays stable and so the next reader finds the decision instead of the gap.
- What went with it, in the same change: the `LIVE` screen and its three frames, the watching-now aggregator (`21` §10), the credit-on-open attendance rule (`source='live_watch'`, retired in place), `sermons.is_live` / `live_checked_at` and their staleness bound, the live banner on WATCH, the red LIVE badge, and the `live-detection` edge function.
- What deliberately stayed: `kind='live_replay'` and WATCH's "Recent live streams" rail. That value is the channel TAB a row was synced from, not a live state; those rows are recorded messages. Watching a replay is not joining live.

**W3.3 · Push infrastructure slice** (multi-session) · **COMPLETE 2026-08-19**
- All five slices landed. Slice 4's blocked tap criterion was closed at Track P Phase 4 (the conflict was a dev-client artefact: the preview build taps correctly from killed and backgrounded), and slice 5 (NC, NOTIF-PREFS, MORE's "My life", the Home bell) landed the same day. What its decisions now live in: ADR 0022 (no partitioning), `02`/`21` §5 (corrected there), `15` (the tier table's shared prayer control), the migrations' own headers, and the two lessons recorded below.
- **Two lessons from slice 5 worth carrying:** the OS-denied banner cannot key off `canAskAgain`, because a revoked and even user-fixed Android permission still reports it true outside an in-process request (instrumented on device, 2026-08-19); the honest signal is "we have already had our one ask" (`features/notifications/ask.ts`) plus "not granted". And the notification-centre pagination is a KEYSET cursor whose PostgREST `or=(...)` filter must carry a URL-encoded `+` in the timestamp, or Postgres reads it as a space and answers `22007`; the shapes were driven through real signed-in HTTP before the screen existed, per the W3.1 slice 4 convention.
- Refs: `15` (channels, ordering, payload privacy, localization model, receipts, deep links), `02` (notifications, push_tickets), `21` §5.
- Build BE: notifications (monthly-partitioned) + push_tickets migrations; template-key rendering per recipient language; push-send function (generic payloads only) + receipts sweep job (DeviceNotRegistered pruning, error-rate alert) + dead-man pings.
- Build FE: six Android channels created at first start BEFORE any permission request; token registration after in-context grant, sign-out deletion; deep-link config (scheme, AASA + assetlinks with the Play App Signing SHA-256, expo-router path handling, cold start via `getLastNotificationResponseAsync`; navigate-only rule); NC screen (cursor pagination, batching display, badge cap, retention footer) + NOTIF-PREFS (incl. OS-denied banner).
- Build FE, also: **MORE's member "My life" section** (`04` §MORE: Profile, My Rhythm, My List, My posts, Notifications). W1.2 built the hub with the sign-in card standing in its place, because none of those destinations existed yet; `NC` is the last of the five to land, and this is the item where the section stops being a promise. (Added 2026-08-08 during W2.8 slice 3, per §8's work-item drift rule: `04` specified the section and no item claimed it, so RHYTHM shipped reachable from Home's strip alone.)
- Done: `15` acceptance criteria testable subset: a dev push arrives localized, deep-links correctly from killed state, lands in NC; receipts job prunes a dead token; every "My life" row navigates.

**W3.4 · Reminder jobs slice** · **COMPLETE 2026-08-19**
- All three slices landed: the delivery seam + service reminders (1), RSVP + prayer reminders (2), counter reconciliation + retention purges + the Resend canary (3). Six new schedules on the existing ADR 0016 mechanism, and one new piece of infrastructure that turned out to be missing: **W3.3 built the push sender and never built a caller**, so slice 1's `deliver_notifications()` is where "who is due" becomes "rows written, then pushed". Its slice plan was deleted on landing per its own instruction; what it decided now lives in `02` (the corrected dedupe-key rule), `09` (the cadence and its stop conditions), `15` (the cadence, quiet hours and the payload rule for nudges), `21` §5 (six job rows) and §6.8 (the canary), and each migration's own header.
- **Four decisions taken with Ayo, all recorded where they belong:** the service dedupe key carries the local start time (`02` could not keep its own promise without it: two services on one date shared a key and a same-day reschedule was swallowed); the prayer cadence is day 1, day 3, day 7 anchored to `committed_at`; prayer nudges hold to 08:00-21:00 branch-local, the app's only quiet-hours rule; and an OPEN report past its 24-month window is kept, counted and logged rather than purged.
- **Three lessons worth carrying.** A window computed from `now()` loses an occurrence whenever a tick runs late, so all three reminder windows floor the clock to the tick GRID and every batch function takes its clock as an argument (which is also what makes DST testable from both sides in February). A pgTAP file that counts rows out of LIVE STATE is only a test if the state is its own: `038` and `041` both went red the moment this item gave the sender real callers and the seed real enrolments. And a trigger function runs as the INVOKING role, so `prayer_reminder_next` had to be granted to `authenticated` or "I will pray" failed `42501`.
- Refs: `21` §5 (jobs table), `15` (tiers), `09`/`02` (prayer reminders).
- Build: service reminders (15-min scan, dedupe keys embedding occurrence), RSVP reminders (hourly), prayer reminders (gentle cadence, hard cap, stop conditions), counter reconciliation, retention purges; every job idempotent + healthchecks ping; pgTAP/deno tests on dedupe-key behavior (rescheduled event mints a new key).
- **The verse-queue monitor is already built** (W2.7 slice 5, 2026-08-06), along with the whole scheduling pattern this item inherits: `cron.schedule` in the job's own migration, `jobs.invoke_edge_function` reading its two values from the vault, a lease per job, and the ledger/idempotency shape (`21` §5, ADR 0016). These jobs are new schedules on an existing mechanism, not new infrastructure. What W3.4 still owns for the verse monitor is the weekly **Resend canary** (`21` §6.8), which its daily run is the natural home for.
- Done: each job runs on schedule in dev, re-runs without double-sends, and its dead-man check is registered.

**W3.5 · Broadcasts + Dashboard Phase B** (multi-session) · **COMPLETE 2026-08-22**
- All slices landed: the broadcast domain (1), the fan-out (2), dashboard broadcasts (3), events CRUD + auto-notifications (4), the event picture (4b), and branches in three PRs (5a the domain, 5b the dashboard module, 5c the member's re-home). Its slice plan was deleted on landing per its own instruction; what it decided now lives in `17` §2/§3/§5, `02` (the broadcast state machine, `branches.status`, both new columns and the `event-images` bucket), `11` §Notifications, `15`'s tier table, `21` §5, ADRs 0021-0024 and each migration's own header.
- **Five decisions on the branch half, taken with Ayo before any SQL:** no second pair of eyes on an archive (step-up TOTP plus a typed confirm, which is what `17` §Platform already said); archiving CANCELS the branch's future events so slice 4's notices go out; the members' prompt is a dismissible surface rather than a gate; an archived branch can be re-opened by any admin, without reinstating events or sweeping members back; and the escalated moderation stays every admin's, because `moderation_alert_batch`'s no-leaders fallback already IS that rule.
- **Four lessons worth carrying.** `anon` and `authenticated` held ALL table privileges from Supabase's ambient default privileges, so RLS was the only boundary and no column grant could bite until a `revoke all` preceded it (ten tables and three views, PR #207; issue #96 closed by it). A second FK from `profiles` to `branches` made every bare `branches(name)` embed ambiguous, which `authorize()` read as `no_profile` and which signed every leader out of the dashboard. `02` promising that something "stops" is worth checking caller by caller: its "an archived branch's services stop" turned out to describe ONE join, so the app went on advertising a closed branch's Sunday service with a check-in under it. And a pgTAP count over live state must be scoped to its own fixtures now that the dashboard's branch tests leave a branch behind on EVERY run: a branch is archived, never deleted, so nothing can tidy it away (`002`).
- Refs: `17` §2/§3/§5, `02` (broadcasts state machine, deliveries), `15` (fan-out), `21` §5/§9.
- Build: dashboard broadcast compose (scope, locale bodies, link allowlist + preview, recipient count + rendered body pre-send, "Copy for WhatsApp" pasteable text), four-eyes ministry approval (DB CHECK + route refusal), edit-during-approval reset, halt control; fan-out edge function (chunked, cursor-resumable, deduped, respects prefs + blocks); events CRUD + cancellation/reschedule/reinstate auto-notifications; branch/role management + archive-branch flow. No channel picker, no cost estimation and no monthly cap: push + in-app only (ADR 0014).
- Done: `17` Phase B modules work on dev; a halted fan-out resumes exactly once per recipient (proven by deliveries rows); broadcast state machine covered by tests.

**W3.6 · Phase 3 exit audit** · **COMPLETE 2026-08-31. Phase 3 has exited.**
- Refs: `18` Phase 3 exit.
- Build: tier scoping verification (ministry-wide reaches all branches, branch stays in-branch, prefs suppress), audio-while-driving field test, notification E2E matrix (every tier → correct deep link). (The "load-test note for the first big live on preview" was struck 2026-08-16: ADR 0021 removed the live layer it was sizing.)
- Done: `18` Phase 3 exit criteria.
- **An audit that had to BUILD before it could verify, which is the headline.** Reading `18`, `15`, `09` and `08` against the code found that **three notification kinds `09` promises had no producer at all**: "someone prayed for your request", "N people said Glory", and "your post was approved / needs changes". Every other part of all three had shipped with W3.3 (the `type` CHECK, the six channels, the templates in four languages, the app's renderer, both switches on NOTIF-PREFS) and nothing anywhere wrote the rows, so **`prayer_activity` and `testimony_activity` were two switches a member is shown that gated nothing for six weeks**. Slice 2 built `activity-notices` to close it. This is the W3.4 shape a second time ("W3.3 built the push sender and never built a caller"): W3.3 owned infrastructure, W3.4 scheduled sends, W3.5 broadcast and event sends, and a send triggered by ANOTHER MEMBER'S ACT was a fourth shape no item had claimed. `registration.confirmed` is the fourth orphan of the same kind and is on `18`'s checklist.
- **Five lessons worth carrying, all of them about the gap between green and true.**
  1. **A green test is not evidence until it can fail.** Every assertion this item added was mutation-checked by breaking the thing it defends. The finding that justifies the habit: before slice 1, `broadcast_recipients` could have lost its branch predicate outright and all 47 pre-existing assertions in `043` would have stayed green, because every member in the cast was in one branch. Reaching the right people and reaching ONLY them are different claims and need different fixtures.
  2. **A function without a `[functions.<slug>]` block in `config.toml` is a job that no-ops silently, and every layer can be green while it happens.** `activity-notices` shipped without one and fired every minute into `404 Function not found` (49 times) while `cron.job_run_details` recorded "succeeded", because the POST worked. Hosted it fails differently and just as quietly: no block means `verify_jwt` defaults true, and ADR 0024's keys are not JWTs. Now guarded both ways by `_shared/configBlocks_test.ts`. It was caught by reading the deploy runbook's own line that a new function is a directory plus a config block, which is the best argument for keeping that file.
  3. **CI's supabase job runs two checks the local bar does not**, and both cost a red build here: the types-drift diff (any migration adding a function changes `packages/shared/src/database.types.ts`) and `deno test` WITH type-checking (the habitual local `--no-check` hides TS errors). Before pushing anything touching `supabase/`, run the job's four steps verbatim from `pr.yml`.
  4. **Deleting production test content does not undo what the content EARNED.** The slice 3 cleanup removed every row it created and still left two milestones behind, because milestones are server-owned and keyed `unique(profile_id, kind)`. Left in place they would have silently stolen the real celebration: the next genuine first testimony would fire nothing. Derived server-owned rows (milestones, streaks, counters) must be swept separately from the content that produced them.
  5. **Some promises can only be checked by contrast, on hardware.** "Only service reminders interrupt" (`15`) is invisible in any single notification: it showed up as `importance=4` on the service reminder against `importance=3|SILENT` on all nine others. Channel importance is fixed by the OS at creation and never re-read, so no amount of server-side testing could have observed it.
- **Two decisions taken with Ayo that changed the product**, both recorded in `15` and `09`: Glory collapses per testimony per HOUR rather than per day (per-day both undercounts and silently drops, telling an author "3" while later reactions go unmentioned), and a REMOVAL gets its own words rather than reusing "needs changes" (reusing it would have told a member whose post was taken down after review to go and edit it, and would have passed every test that existed).
- **The audio half closed 2026-08-31**, field-tested by Ayo on his own device and REPORTED rather than machine-checked, which is how `18` records it: 15+ minutes locked, working lock-screen controls, an interruption survived, and resume after reopening. The first two corroborate each other, since `08` warns Android stops background audio after ~3 minutes without lock-screen controls registered.
- **What Phase 3 exits WITHOUT, deliberately:** iOS for both audio and E2E (no iPhone in the project); a Bluetooth car head unit specifically; five of six Maestro journeys, which cannot run in CI because the review bypass is off on production (`18`, corrected 2026-08-31: the blocker is authentication, not CI minutes); and issue #213, a pending milestone modal drawn over a deep-link destination, which was closed as working-as-designed after reading the code.
- **A sixth lesson, from the audit's own mistakes rather than the code's.** Three times in two days a step LOOKED done and had done nothing: `vercel env add` returning guidance JSON that a grep swallowed, the first three Sentry variables silently not applying, and a Cloudflare proxy toggle that did not move. Each was caught by reading back the state rather than the command's output. The habit that generalises: after any write through a tool you do not control, ask the system what it now holds.

### Phase 4 · Store/Library + polish + submission + Dashboard Phase C

**W4.0 · Link a website registration by hand (#164)** (COMPLETE, 2026-08-31)
- Refs: `docs/spec/plans/164-link-a-registration-by-hand.md` (the SPEC and its eight decisions), ADR 0017 (decisions 2, 4, 5 and the 2026-08-11 amendment), ADR 0015, ADR 0016, ADR 0022, `13`, `17`, `20`, `02` §the two shared tables.
- **Why it runs first rather than beside W4.4.** ADR 0017's self-service claim was cut on 2026-08-11 along with its backend, so a member who paid on the website under one address and signed into the app under another has had NO path at all. The double-booking wall cannot save them either, because it keys on `(course_id, profile_id)` and their row has no `profile_id`: they can pay twice for the same course. The interim was a leader reading a stranger's payment record in a SQL client.
- **Backend, DONE (2026-08-31).** `set_aside_at` / `set_aside_by` (nullable and additive, so the website's INSERT is untouched); `link_registration`, `unlink_registration`, `set_registration_aside` and `registration_match_suggestions`, all `security definer`, all checking `caller_is_admin_live()` themselves, all granted to `authenticated`; and a FOURTH `activity_notice_batch` arm that finally gives `registration.confirmed` a producer, built as a job arm rather than a write inside the routine for every reason W3.6 slice 2 recorded (ADR 0016, `21` §5's no-outbox rule, ADR 0022's insert-is-the-claim). Tests: pgTAP `052` (46 new), `051` +4, `039` +2, and `032`'s grant matrix corrected.
- **The screen, DONE (2026-08-31).** Ten frames composed and approved first (the five asked for plus unlink's linked-history and typed confirm, the already-proven-address refusal, and loading/error/offline), then `/academy` with three views on one route, `/academy/[id]/link` with four surfaces on one route (suggestions, search, confirm, refusal) and `/academy/[id]/unlink`. `server/registrations.ts` is the whole data layer; nothing needed a client component, so every screen works with HTML alone. Walked end to end in a real browser against the local stack, both themes: link → the member's `registration.confirmed` row written by the real job 25 seconds later → unlink → set aside → bring back, plus the refusal with a genuine two-member address collision.
- **The name search was a decision, not a detail.** `17` §5 says exact email only; that cannot serve a feature whose whole premise is a member whose app address differs from the payment's. It is narrowed instead (admins only, two characters, wildcards stripped BEFORE the length check, eight rows, no empty listing) and recorded in `17` §5. **It needed no migration at all**, which was the opposite of the plan: `20260802120000` already gives admins SELECT on every profile under RLS and `20260820200000` grants `profiles` whole-table, so the search is an `ilike` through the caller's own client.
- **Four defects reached a screenshot that no test caught, and all four were copy or layout rather than logic**: the refusal sentence named the PAYER where it should have named the member (it read perfectly and said the wrong thing); the set-aside result printed the same sentence twice, once as an alert and once as the undo banner's title; the unlink mismatch error repeated the hint verbatim instead of saying what to do differently; and the top suggestion wore a filled button, which endorses far louder than a grey reason pill declines to. The standing "render it and LOOK" rule is what found every one.
- **A green test is not evidence until it can fail, twice over.** The first "the amount is never fetched" test rendered the loaded row and looked for the figure, and it PASSED with `amount` added back to the query, because `toRegistration` drops any column it does not map: it was testing the mapper while claiming to test the query. Asserting the exported column list instead turns red under exactly that mutation. And pgTAP `052`'s refusal assertions passed `null` for the message, so the dashboard's error mapping (message matching, since one SQLSTATE covers four different refusals) rested on strings nothing checked; `052` now asserts all twelve, mutation-checked.
- **Three lessons, all about things that are invisible when wrong.** (1) Roughly half the planned work already existed: `registration_linked` was already in the `privileged_action` enum and `course_registrations_audit` already fired on every change of `profile_id`, so link and unlink are audited without either routine remembering to. Read the neighbouring migration before planning against a SPEC. (2) On a table whose SELECT is granted PER COLUMN, a new column is readable by nobody until the grant is edited, and the failure is silent in the worst way: the queue would render empty forever. `032`'s exact grant-matrix assertion is what forced it to be a decision. (3) `revoke all ... from public` does NOT remove Supabase's default role grants, so `anon` kept EXECUTE on all four routines until they were revoked from `anon` BY NAME. Issue #96 one layer up, caught only because pgTAP asserted the negative.
- **CI found a grant the repo had been inheriting rather than owning** (`20260831140000`). `course_registrations` never granted `service_role` by name: it took Supabase's bootstrap grant at creation in `20260809202000`, and `donations` did it properly eight days later. The pinned CI CLI builds a database whose bootstrap does not hand that out, so every service-key INSERT there failed while the same suite passed locally on a newer CLI. This is one of THE TWO SHARED TABLES: the website's Stripe webhook writes it with the service key, and a refused INSERT there is a member charged with no record and no confirmation. Production is unaffected and was never broken; what the migration removes is the chance that an environment built fresh from this history comes up without the road in. `039` asserts it now, mutation-checked. The lesson generalises past this table: **an ambient grant is not a grant this repo owns**, and the only reason this one was ever visible is that W4.0's tests were the first code to insert a registration with the service key.
- **Applied to production 2026-08-31, and the question it was dispatched to answer came back "no".** `agbc-production` ALREADY held every grant `20260831140000` issues: all nine tables, the full seven privileges, and the four tables deliberately denied to `service_role` (`bootstrap_admins`, `privileged_actions`, `branch_change_requests`, `course_handoff_tokens`) still denied. The bootstrap did hand them out there, so the website's Stripe webhook and the whole cron fleet always had the road in and the migration is a no-op against production. The divergence was only ever the CLI version, never the environment. Worth keeping: those grants read as EXPLICIT rows in `information_schema.role_table_grants` even though no migration here issued them, because `alter default privileges` leaves exactly that behind at CREATE TABLE time. "It shows up in the grants table" was never evidence this repo owned it, which is the whole reason the gap could sit unnoticed.
- **Checking that turned up the real finding: production was FOUR migrations behind, not one, and half of W4.0 was already live against a database that could not serve it.** Production sat at `20260829120000`; the repo had all four of `20260831120000`, `130000`, `140000` and `150000`, so `supabase db push` was never going to apply the grants alone. Meanwhile `agbc-dashboard` redeploys on every push to `main`, so the Academy module went live at `app-dashboard.agbcglobal.com` the moment #225 and #226 merged, calling four routines and reading two columns that did not exist in production. `/academy` and both child routes were broken there from the merge until this deploy. **The two halves of this feature deploy on different triggers** (Vercel on push, Supabase prod only on a manual dispatch behind `PROD_DEPLOYS_ENABLED` and the environment gate), so a work item whose backend and screen land in one PR still reaches production in two pieces, and the screen goes first. Merging is not shipping until the dispatch has run; check the migration position against the repo at the end of any item that touched both.
- **How it was done, and verified by asking the database rather than reading the command's output** (the W3.6 lesson, applied). `backup.yml` dispatched first and green (`nightly/agbc-prod-2026-08-31.tar.zst.age`, size-matched at the destination, dead-man ping sent), then `supabase-deploy.yml` dispatched, 1m02s. Queried back afterwards: all four migrations in `schema_migrations` with head `20260831150000`, both columns present, all four routines present with EXECUTE for `authenticated` and NOT for `anon`, `pg_trgm` installed, the enum value added, `course_registrations_linked_at_idx` built, `profile_emails_normalized` validated, arm 4 in the deployed function body, and the eleven website columns on `course_registrations` unchanged in type and nullability (the shared-table contract, `02`). Two risks were checked against live data BEFORE dispatching and both were empty by construction: arm 4 fires only on `link_method = 'leader'` and production had zero such rows, so no backlog of notices could blast on the first tick; and `20260831150000`'s normalization UPDATE ran over an empty `profile_emails`. After the deploy the every-minute `activity-notices` job kept succeeding across the window and `activity_notice_batch()` returns zero rows due. Exactly one edge function's hash had changed since the 2026-08-29 deploy (`activity-notices/core.ts`), and exactly one was redeployed, to version 3.
- **And opening it in production immediately paid for itself: the handoff path writes two thirds of the link trio** (`20260831160000`). `20260809202000` calls `linked_by` / `linked_at` / `link_method` "who attached this row to a member, when, and by what proof", and a handoff checkout arrives carrying `profile_id` and `link_method` with no `linked_at`, because the column's only writers have ever been the claim flow cut on 2026-08-11 and W4.0's own routines. Production's single registration is exactly that. It made the Linked view's MOST RECENT FIRST a lie for handoff rows (the query orders on `linked_at` with nulls last, so they sink for ever) and made the unlink header print the registration date under the word "linked". Fixed in the INSERT guard, which already exists to fill in what the website cannot send (it resolves `course_id` from the slug for the same reason), never as an overwrite, and backfilled exactly rather than guessed: a row holding a `profile_id` with no `linked_at` got that `profile_id` at INSERT, so `created_at` IS the moment it was linked. **The invariant is deliberately NOT a CHECK constraint**, against the database standard's usual instruction, because `profile_id` is a column the website sends and `20260817120000` already settled that a constraint over those is a refused Stripe insert, which is a member charged with no record; `032` §13 asserts it instead, where being wrong costs a red build. **The lesson is about why 326 green tests could not see it**: every fixture in the suite names `linked_at` itself, and the website does not, so the suite was testing a shape the live writer never sends. §13's fixture is inserted the way a handoff actually arrives, and was mutation-checked: with the new block removed, the two assertions that say the trigger acts go red and the two that say it does not stay green.
- Done: an admin links a payment record to a member from the dashboard, the member is told, and a wrong link can be undone. All three verified on the running dashboard, not only in tests.

**W4.1 · Payhip pipeline + restore purchase** (multi-session; **slice 2 built 2026-09-01, the rest PARKED by decision**, slice plan at `docs/spec/plans/W4.1-payhip-pipeline.md`)
- Refs: `14` (trust model, drain, reconciliation, restore), `02` (books/entitlements/payhip tables + §Storage), `24` §1 row 13, `21` §4-5, `17` §4, `20` §retention.
- **RENAMED 2026-09-01, because two thirds of the old name was already done or deliberately deleted.** Resend custom SMTP landed at Track P Phase 2 on 2026-08-19 and is verified (`18`'s line is ticked). The dedicated email-verification OTP was struck on 2026-07-18: `03` §Security says "the identity email is verified by definition, so the Payhip restore-purchase flow (`14`) needs no separate email-verification step", and `14` says the same. What remained under that half of the name is the restore-purchase claim flow, which this item still owns.
- **AND THE PAYHIP API `14`'s TRUST MODEL WAS DESIGNED AROUND DOES NOT EXIST** (checked against Payhip's own docs, 2026-09-01). The public API covers coupons and licence keys only, in Payhip's own words: "At the moment we only have support for interacting with the Coupon and License Key resources, but more will be added in future." There is no transaction, sale, order or customer endpoint in v1 or v2, so the confirmer, the refund confirmation and the daily reconciliation job cannot be built as `14` and `21` §5 describe them. What `14` recorded on 2026-07-12 IS still true: the webhook signature is `hash('sha256', $apiKey)`, constant and replayable. The direction taken with Ayo on 2026-09-01 is **licence keys as the proof** (`/api/v1/license/verify` returns `enabled`, `uses`, `buyer_email`, `product_link`, `date`, and Payhip auto-disables a key on refund, which is the same shape a transaction lookup would have given), pending a live test that needs the key handoff. The slice plan carries the open questions and the fallback.
- Build BE: books/entitlements/reading_state/payhip_events/unmatched_purchases migrations (NO client write policies on entitlements: pgTAP proves it, at both the grant and the policy layer); webhook receiver (inbox only) + async confirmer + refund revocation + unmatched drain trigger + whatever reconciliation the licence API permits; restore-purchase claim flow (identity email or order id, uniform responses, rate-limited); the fifth `activity_notice_batch` arm that finally gives `purchase.added` a producer (`18`'s checklist already assigns it here); the dashboard's unmatched-purchases queue.
- **Slice 2 DONE (2026-09-01):** the five tables, the private `book-files` bucket and a new public-read `book-covers` one, the whole boundary (RLS + grants + column grants + `service_role` by name on all five), the four retention arms `21` §5 owed, dev seeds, and pgTAP `053` (52 assertions, four of them mutation-checked). Six documented departures from `02`'s sketch, all carried into `02` in the same PR. **One real bug was caught by the guest assertion**: RLS evaluates every permissive policy, so an unscoped "owners read the books they own" policy whose body reads `entitlements` made the whole catalogue unreadable to `anon` (permission denied on a table the guest holds no grant on), which is the store going blank for everybody without an account. Every policy on these tables is scoped `to authenticated` where it is not the public one.
- **PARKED 2026-09-01, deliberately, with the shelf built and the pipeline not.** Ayo's call: selling books through the app is not wanted yet, and every remaining slice needs a live Payhip account to be worth writing. **Nothing downstream is blocked**: W4.2 and W4.3 run on the schema slice 2 landed, and an entitlement can be granted by seed or by hand meanwhile. Resume at S1, the trust-model decision, with the four questions in the plan's §4.
- **The credential ask changed, and `24` §1 row 13 is corrected with it.** Do NOT request the account API key: Payhip has one per account with no scopes and no read-only mode, and it can mint free coupons on the church's store. Three narrower things instead: the webhook signature constant (`sha256` of the account key, computed by Ayo and handed over as the digest, so the key never leaves the pastor's account), one `product-secret-key` per book (the scoped credential licence verification actually uses), and a test product with licence keys switched on.
- **Do NOT read this item as "the website's bookstore needs automating".** Checked first-hand: `Desktop/agbc`'s store is one book (the Word Devotional, Payhip id `5cLzF`) rendered as a plain link to `payhip.com/b/5cLzF`, with no script and no webhook, and manual is the correct design for a shop window. Payhip takes the money and emails the file, so the buyer is already served and the website has no reason to learn a sale happened. This item exists only because the APP has to connect two facts that never meet: a payment made in a browser under one address, and an app account signed in as somebody. See the plan's §2.
- Done: `21` §4 edge-integration tests green (replayed fixture grants once; forged refund does not revoke; restore grants exactly once).

**W4.2 · Store + Library screens**
- Refs: `14`, mockup STORE/BOOK-DETAIL/LIBRARY frames.
- Build: STORE grid, BOOK-DETAIL (Buy → Payhip in-app browser; owned → Read; return-from-purchase refetch + banner), LIBRARY with progress; entitlement-gated signed-URL file access (short TTL, per-request edge function).
- Done: buy-on-dev flow end to end with a Payhip test product; "Read" on unowned routes to Buy.

**W4.3 · READER** (multi-session; honestly sized 2-3 weeks in `14`)
- Refs: `14` reader stack + offline model.
- Build: PDF first (`@kishannareshpal/expo-pdf`, fallback plan per `14`), then EPUB (`@epubjs-react-native/core` + file-system compatibility patch); location persistence (`reading_state`), font size, reading theme, offline download (File API, signed URL at download time, Wi-Fi-only option), refund re-lock behavior.
- Done: `14` acceptance criteria on both formats, both platforms, offline reading verified.

**W4.4 · Devotional plan + Dashboard Phase C**
- Refs: `10` (plan model), `02` (plan tables), `17` §4 (import tool), `22` §1.
- Build BE: reading_plans/devotional_days/plan_enrollments/plan_progress migrations (entitlement-join RLS); dashboard structured-import tool + books/content management.
- Build FE: PLAN (enrollment anchor, today's day logic), PLAN-DAY (mark complete → progress + milestone), Home verse-card CTA switches ON (entitled → PLAN-DAY, else BOOK-DETAIL); import the real devotional with the pastor's file.
- Done: purchase → entitlement → plan unlock E2E (`10` criteria); Home CTA never routes to an empty PLAN.

**W4.5 · Account deletion + web deletion path**
- Refs: `16` (deletion reach table, in order), `20`, `02`.
- Build: DELETE screen (choice on approved content, type/hold confirm); the deletion job executing the full `16` reach table in order (hard-cancel pending first, counters reconciled, storage objects, Payhip rows, email nulling); web deletion page on the church site (OTP one-shot, Turnstile, uniform responses); refresh-failure and deleted-account transitions in the app (`03`).
- Done: delete a seeded dev account and verify every table per the reach checklist; second-device queued write rejected after deletion.

**W4.6 · Localization + legal pass**
- Refs: `22` §4, `16`, `20`.
- Build: full DE/NL/FR translation of all namespaces (port website strings where possible; FR is net-new), reviewer sign-off (Berlin/Emmen/the named FR reviewer); legal strings (consent wording, privacy summaries, deletion copy) reviewed in all four languages; pseudo-localization run in nightly; PRIVACY screen + policy links.
- Done: no missing-key warnings in any locale; string freeze declared.

**W4.7 · Hardening audit: states, a11y, performance, tablet**
- Refs: `18` Phase 4, `05` (matrix), `04`.
- Build: sweep every screen: four states, hit targets, contrast, dynamic type 200%, VoiceOver + TalkBack pass, tablet layouts (master-detail per `05`), landscape player/reader; performance pass (startup, list virtualization, image caching); fix-list burned down.
- **One contrast finding is already measured and waiting for this item** (W3.3 slice 1, 2026-08-15): in DARK, surface separation is carried by hairlines at **~1.43:1** (`cardline` and `bandline` are both `#28323f` on a `#0e1420` page), under WCAG 1.4.11's 3:1 for a boundary that identifies a component. It is the whole dark theme rather than one component, so it was deliberately not fixed inside a feature slice. Decide here whether those boundaries need to identify anything (content mostly does that on its own) or whether the dark palette gets re-toned; either way it is one decision applied to every card, band and toast at once.
- Done: the `21` §4 manual matrix executed and recorded on the real low-end Android + current iPhone.

**W4.8 · Store submission** (with Ayo)
- Refs: `18` launch checklist, `19` (store product, listings, age ratings), `03` (review notes).
- Build: store assets EN/DE/NL/FR + screenshot matrix (incl. iPad/tablet), privacy labels + data-safety form (web deletion link), age-rating answer sheet, review notes (fixed-code review email, prod bypass window on), release-note copy for Grace Portal installs; TestFlight + Play internal; staged-rollout plan with written halt criteria; submit.
- Done: both stores in review; `18` launch checklist items all checked or explicitly waived by Ayo.

### Track P · Production (parallel, gated; interleave after Phase 1)

**Rewritten 2026-08-17 by ADR 0023: production is a NEW Supabase project and the church website moves onto it.** The authoritative document is `docs/spec/plans/track-p-fresh-prod-project.md`, phase by phase; this is the index.

- **P1 · DONE (2026-08-10).** Nightly off-provider `db dump` pipeline + one verified restore, covering the live website's data too (ADR 0018, `docs/runbooks/restore-from-backup.md`). Unaffected by the reversal, except that it has to FOLLOW the website onto the new project at Phase 3.
- ~~**P2-P6**~~ **superseded.** They described auditing, rehearsing and then executing a destructive cleanup of the shared project so it could become ours. There is no cleanup: our whole migration history applies to an empty project, which CI proves on every PR. P2's audit was done and stands as the record of what the old project holds (`docs/runbooks/prod-audit-2026-07-30.md`); it is also what priced the reuse plan and so caused the reversal.
- The plan's phases, in order: **0** decide and prepare (creates nothing: the ADR, the `donations` migration and its contract test, a final archived dump, the rotated review code) · **1** create the project and apply · **2** edge functions, secrets, vault · **3** move the website (the ONLY step that touches agbcglobal.com) · **4** point the app at production and close W3.3 · **5** retire the old project.
- **The traffic fence is lifted, deliberately** (ADR 0023): app builds point at production on Free, mitigated by uploading NO sermon audio to production storage, 80% usage alerts, and a written trigger to upgrade to Pro past 50% egress in any month. `24` §1's fence line is annotated accordingly.

---

## 3. Track BE: due process for every backend change

Read `~/.claude/standards/backend.md`, `database.md`, and `security.md` before the first backend session (and `qa-testing.md` before the first pgTAP file).

1. One logical change per migration; `supabase migration new <description>`; write against LOCAL (`supabase start`). Never against dev or prod directly (`23` §3a: the migrations folder IS the schema).
2. pgTAP tests land IN THE SAME PR: policy-matrix rows for new tables plus every applicable write-path invariant bypass attempt asserting failure. A table ships with `FORCE ROW LEVEL SECURITY` and its policies in the same migration, never "policies later".
3. Regenerate `database.types.ts`; CI fails on drift.
4. Seeds updated if affected; seeds must keep loading on a fresh DB.
5. Edge functions: zod request/response contract in `packages/shared` first; `deno test` covering the happy path AND the abuse case named in the spec; secrets only via `supabase secrets set`; scheduled functions end with a healthchecks.io ping; logs never contain phone numbers or UGC content (`20`).
6. Merge to `main` auto-applies to DEV only. Prod applies exclusively via the manual `workflow_dispatch` job (Track P onward).

**Definition of done, backend unit:** migration + RLS + pgTAP + types + seeds + (if a function) contract + deno tests + dead-man ping, all merged and green.

---

## 4. Track FE (mobile): due process for every screen

Invoke the `frontend-bootstrap` skill before W0.7 and work its stages through W0.9. Read `~/.claude/standards/frontend.md` and `mobile.md` before UI sessions.

1. Read the feature's numbered doc + `04` (destinations) + `02` (data); open the matching mockup frames (light, dark, tablet, edge states). Mockup = visual truth; docs = behavioral truth.
2. Confirm the backend contract for this item is merged (§3 definition). If not, build the BE part of the slice first; do not stub data shapes.
3. Tokens only (no hard-coded hex), i18n keys only (no literal strings), primitives from `src/components/ui`.
4. Every data surface implements the four states (loading skeleton, empty with CTA, error with retry, offline/cached) and every gated action uses GateSheet + gate-return. No dead ends (`04`).
5. Tests in the same PR: Jest for logic, RNTL for the four states + gate flows (`21` §4).
6. Verification before the PR is ready: small phone (~320-360dp), large phone, tablet width, 200% text scale, VoiceOver or TalkBack spot pass, BOTH themes. Screenshot each and compare against the mockup; list and fix differences first. "Renders at one size" is not done.
7. PR carries the verification evidence (screenshots per matrix cell).

**Definition of done, screen:** matches mockup in both themes, four states, gate flows return correctly, i18n keys resolve (EN complete; DE/NL/FR keys exist, full translation lands in W4.6), a11y roles/labels per the `05` contract, matrix-verified, tests green.

---

## 5. Track FE (dashboard): due process

Same as §4 minus the device matrix (desktop-first web, but check a narrow window). Additionally:

- Every server route goes through the centralized authz middleware; client input never supplies authority (`17`).
- Every new route ships with an IDOR probe test (foreign branch id) in CI (`21` §4).
- Service-role usage is reserved for genuinely admin operations; prefer the caller's JWT + RLS.
- Passkey/step-up requirements per `17` before any privileged module ships.

---

## 6. Due process for every PR (all tracks)

- Branch from `main`: `feat/w<item>-<slug>`, `fix/…`, `chore/…`, `docs/…`. Never commit to `main`.
- Commits and pushes only with Ayo's explicit approval, message proposed first; approval never carries over; no AI attribution anywhere (commits, PRs, branches).
- PR body: summary, what changed and why, verification results (test output, screenshots for UI), notes/follow-ups. After push, provide the pre-filled PR creation link.
- CI must be green before merge (branch discipline is by convention until GitHub Team, `21` §3).
- Any decision that changes architecture, a vendor, or money gets an ADR in the same PR (`23` §3d).
- Security self-review on anything touching data, auth, input, or external I/O.
- Update the item's checklist issue / board card. No hand-edited progress files; the board is the status view (`23` §3c).

---

## 7. Dependency map (what blocks what)

| Dependency | Blocks | Lead time / note |
|------------|--------|------------------|
| ~~Meta business verification~~ | ~~WhatsApp broadcasts~~ | **Gone 2026-07-29** (ADR 0014): broadcasts are push + in-app, so nothing waits on Meta at any phase |
| Resend SMTP + SPF/DKIM/DMARC on the domain | real-user sign-ins (Founding Members onward) + Phase 4 restore emails | ~1 day; Ayo holds DNS (`24` §1 rows 11-12). Dev never waits (local Mailpit) |
| Apple Admin invite + Play lookups | iOS dev builds (W0.11), release config | same day once requested |
| FCM V1 key + APNs in EAS | Push (W3.3) | same day; do it in W0.1 |
| Dashboard Phase A (W2.7) | Phase 2 exit (nothing publishes without it) and verification of W2.5/W2.6 | build in parallel with W2.3-2.6 |
| Named owners (Gate 2) | Phase 2 start | Ayo confirms the tracker's proposed table |
| Supabase Pro upgrade (P6) | first prod-pointed TestFlight build; launch | decision made; timing per `24` traffic fence |
| Off-provider dump + verified restore (P1) | any destructive prod step | hard precondition, `21` §7 |
| Devotional file + Payhip API key handoff | W4.1/W4.4 | request early in Phase 3 |
| Founding-members program | public launch (not the build) | pastors' buy-in; runs against dev or post-P6 prod |
| Wedge interviews (Gate 1) | confidence for Phase 2 scope, not the schedule | run during Phases 0-1 |

---

## 8. Standing rules that keep the process honest

- **Docs win.** Prototype/mockup vs docs conflict: docs win on behavior (`README`).
- **The cross-cutting requirements of `18` apply to every phase** (no dead ends, guest-first, grace-framed, multi-branch, four languages, server-trusted).
- **Two corrections on the same issue** in a session: stop, capture the lesson (standards file or project CLAUDE.md), restart with a better prompt.
- **Spec drift:** if implementation reveals a spec error, fix the numbered doc in the same PR, never silently diverge.
- **Work-item drift:** if the flow order proves wrong while building (a hidden dependency, a better slice), update THIS doc in the same PR and say why in the PR body. The playbook must always match how we actually build.
- **Stale trackers:** `BUILD-READINESS-TRACKER.md` stays the gate-level view until the GitHub board exists (W0.2), then the board is authoritative for work status.
