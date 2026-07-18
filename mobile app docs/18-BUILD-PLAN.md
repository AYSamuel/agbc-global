# 18 · Build Plan & MVP Phasing

A pragmatic path from empty repo to a launched app + leader dashboard. Cut lines are chosen so each phase is shippable and testable.

## Guiding cut principles
- Ship the **wedge early**: the app must feel like *this* church (Family), not a generic template, from the first internal build.
- Everything **browsable without auth** first; contribution + personalization layered on.
- Real content wired to the backend from Phase 1 (no permanent mock data). Until the dashboard tooling lands, Phase 0/1 content comes from versioned seeds (`supabase/seed.sql`: pre-approved seed testimonies/prayers, sample events, 90 daily verses); Phase 1 must also render correct empty states.

---

## Phase 0: Foundations (setup)
- Expo app scaffold (TypeScript, Expo Router, theming provider with light/dark tokens from `05`). App identity set to the Grace Portal values from day one (`19`): `com.oami.agbcapp` / `com.olayinkaademiluka.grace-portal`.
- Supabase: audit + clean the existing shared project per `19` (it becomes **production**; the agbc website's tables stay untouched); fresh free-tier project for **dev**. Schema from `02` migrated, RLS baseline.
- Fonts (Bricolage, Hanken), design primitives (`Button`, `Card`, `TabBar`, `EmptyState`, `Skeleton`, `GateSheet`, `Toast`).
- Seed branches, courses, academy, giving config from the `agbc/` codebase.
- CI/CD, testing pyramid, EAS profiles, secrets map, and job operations set up per `21-OPERATIONS.md` (Phase 0 is where all of it lands).
- Design primitives are built with the accessibility contract from `05` (roles/labels/reduced-motion) and responsive width classes (tablet layouts are v1, see `05`).
- **Exit:** blank themed app runs on the Android emulator/device AND on the iPhone via an **EAS development build** (Expo Go is not the workflow, see `01` §2); dark/light works; CI green on the empty app.

## Phase 1: Guest shell (no auth)
- Onboarding (branch/language; notification permission comes later, in context, see `06`).
- Home (branch-aware, daily verse, next service, quick actions, latest message): read-only.
- Watch (list + `SERMON` video, guest playback) from YouTube sync.
- Family **read-only** (testimonies + prayers feeds, map) with scope toggle.
- Give (link-out + bank details from `site.ts`).
- More hub + Branches, Events (read), About/Contact, Settings (theme/language).
- **Exit:** a visitor can explore the whole church with no account; no dead ends.

## Phase 2: Auth + contribution (the wedge live)
- Phone-OTP auth (`AUTH-1…4`, WhatsApp-first delivery + SMS fallback via Twilio Verify), gate sheet + gate-return.
- Family write: post testimony/prayer (consent → pending), **Glory to God**, **I prayed**, prayer→answered→testimony loop, report.
- Moderation dependency: minimal dashboard moderation queue + **daily-verse CRUD** (Phase A of `17`; verses cannot wait for Phase 4, see `22`).
- Analytics instrumentation: the v1 event list + north stars from `22-CONTENT-OPERATIONS.md` §5 (launch week is the only chance to baseline the wedge).
- Member Home (greeting, streak strip, inline Glory), Watch personalization (resume, save, notes).
- Attendance "I'm here" + streaks + milestones. (The devotional plan is PAID and moves to Phase 4 with the entitlement pipeline; until then the daily-verse card ships without the devotional CTA, see `07`.)
- Events RSVP; Academy register; profile.
- **Exit:** members can contribute; the Family loop works end-to-end; nothing publishes without approval.

## Phase 3: Media depth + notifications
- **Audio-only sermons** (self-hosted), background + lock-screen playback, robust resume.
- HQ **Live** with "watching now" + live-watch attendance.
- Push (Expo) + Notification Center + tiers + deep links.
- WhatsApp broadcast integration (opt-in).
- Dashboard: broadcasts + events + branch/role management (Phase B of `17`).
- **Exit:** members get the right notifications at the right scope; audio works while driving.

## Phase 4: Store/Library + polish + store submission
- Bookstore (buy on Payhip) + entitlement pipeline (API-confirmed, see `14`) + **My Library reader** + reading state. Honest sizing: the reader is 2 to 3 weeks (both PDF and EPUB ship in v1 by decision 2026-07-12); the devotional structured-import tool ships with it (`10`/`17`).
- Devotional plan feature (`PLAN`/`PLAN-DAY`) unlocks here, riding the entitlement pipeline; the daily-verse CTA switches on (`07`/`10`).
- Content management in dashboard (plans, books) (Phase C of `17`; verse CRUD already shipped in Phase A).
- Account deletion, privacy, full localization pass (EN/DE/NL/FR), empty/error/offline states audit.
- Analytics + Sentry; performance pass; accessibility (hit targets, contrast, dynamic type).
- Store assets, privacy nutrition labels, TestFlight + Play internal testing → **submit**.
- **Exit:** v1 live on both stores.

## Post-v1 (architecture-ready, deferred)
- Native in-app giving + recurring management.
- Per-branch livestreams/channels (decentralization).
- Per-language content (DE/NL devotionals).
- In-app community/chat (currently: share to WhatsApp).
- Deeper insights/BI in dashboard.

---

## MVP definition (smallest lovable launch)
If you must cut to the bone for v1, ship: **Onboarding · Home + daily verse (no devotional CTA while Store is deferred) · Watch (video + audio + resume) · Family (testimonies + Glory + prayer loop + scope + block) · Rhythm (attendance + streaks + milestones) · Give (link-out) · Events + RSVP · Auth + moderation · Notifications (push + tiers) · Settings (theme/language/blocked/delete).** Defer Store/Library (and with it the paid devotional plan), Academy registration, WhatsApp, and dashboard content-management beyond verse CRUD to fast-follows.

## Cross-cutting requirements (every phase)
- **No dead ends**: every action has a destination + empty/loading/error state (`04`).
- **Guest-first**: gates never block browsing (`03`).
- **Grace-framed**: encouraging copy, never guilt (`10`).
- **Multi-branch**: nothing hard-codes a single branch (`00`).
- **Four languages**: UI EN/DE/NL/FR (`16`).
- **Server-trusted**: RLS/role checks; never trust the client (`02`,`03`).

## Launch checklist
- [ ] Apple: **reuse the existing app record** (bundle id `com.olayinkaademiluka.grace-portal`) under the existing (non-profit) team; listing updated to AGBC Global branding; privacy labels; account-deletion present; screenshots. See `19`.
- [ ] Google: **existing Play listing** (package `com.oami.agbcapp`), `versionCode` > 19, signed with the existing upload keystore (in EAS credentials); listing assets updated; data-safety form incl. the web deletion link. See `19`.
- [ ] Store review access: designated test phone number with fixed OTP documented in the review notes (`03`).
- [ ] Backend: prod = cleaned shared Supabase project (`19`), backups verified, **Pro plan active** (deferred upgrade, `21` §7: mandatory before launch), RLS reviewed, secrets in EAS/Supabase (never in bundle). EU region confirmed 2026-07-13 (`19`).
- [ ] Twilio Verify live: WhatsApp channel approved + SMS fallback, sender IDs registered (NG/DE), rate limits configured (`03`).
- [ ] Push (APNs key + FCM) configured in EAS.
- [ ] WhatsApp broadcast sender approved (if in v1).
- [ ] Forced-update gate wired: remote minimum-version check (Android in-app updates + config gate on iOS).
- [ ] Staged rollout plan with written halt criteria (Play staged %, iOS phased release); crash + ANR reporting live before widening.
- [ ] Moderation coverage: at least one leader per branch trained on the dashboard; pending-item notifications + 48h admin escalation working (`17`).
- [ ] Audio owner assigned: weekly sermon MP3 upload is someone's named job (`08`).
- [ ] Seed content: branches, first daily verses, a devotional plan, courses, initial sermons synced.
- [ ] Legal: privacy policy + terms reachable in-app; DPAs on file; analytics consent implemented; web deletion page live (`20`, `16`).
- [ ] Launch-content checklist from `22-CONTENT-OPERATIONS.md` §2 complete (verses queued, devotional imported, seeded testimonies, trained moderators).
- [ ] Restore drill executed (prod dump restored into a scratch project, `21` §7).
- [ ] Shipping on Expo SDK 56+ (Play target API 36 requirement from 2026-08-31).
- [ ] Block, report, and moderation UGC controls verified against Apple 1.2 / Play UGC policy.

---

## Reference prototypes in this project (build to match)
- `App iOS + Android.dc.html`: full app, both device frames (primary visual/behavior reference)
- `AppFull.dc.html`: the app component (all screens + theming)
- `App Guest vs Member.dc.html`: guest vs member states
- `App Screen Map.dc.html`: the screen graph (~57 screens/states)
- `App Blueprint.dc.html`: system blueprint (journey/auth/data)

These are the source of truth for **look and feel only**; this doc set is the source of truth for **behavior, data, and architecture**, and **the docs win on every conflict**.

**Prototype patch (landed 2026-07-13):** every contradiction-level delta was fixed. AppFull: onboarding is now 2 steps + welcome (no blocking privacy screen, no notification step; layered privacy note on welcome; "I'm just looking" added), compose has a consent block and pending/moderation copy on both testimony and prayer flows, the gate is phone-OTP only, OTP copy shows WhatsApp-first + SMS switch. Screen Map: Nations map retagged **v1** (nation detail stays ph2), OAuth and recovery-email cards marked post-v1 with the docs' v1 rules, notifications shown as in-context (not a step), GIVE-BANK added (G3), giving history marked post-v1, Groups marked post-v1, events marked dashboard-managed, devotional reader marked paid/entitled, blocking-consent card rewritten as layered notice, footer corrected. Blueprint: auth decision updated to phone-OTP-only, WhatsApp-first. Both wrapper pages now embed **AppFull**; `AppPrototype.dc.html` is deprecated (banner in the file).

What remains in the prototypes are **absences, not contradictions** (screens the docs spec that AppFull doesn't demonstrate: BRANCH-SWITCH, LIVE with watching-now, WATCH-SEARCH, MY-LIST, the I-prayed / mark-answered loop actions, REPORT/POST-ACTIONS, AUTH-1 phone entry and AUTH-3 profile setup, real map pins). The gap list stays in `AUDIT-2026-07-12.md` Part D; build those from the docs.
