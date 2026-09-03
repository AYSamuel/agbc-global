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
- Home (branch-aware, next service, daily verse, testimony highlight, latest message): read-only.
- Watch (list + `SERMON` video, guest playback) from YouTube sync.
- Family **read-only** (testimonies + prayers feeds, map) with scope toggle.
- Give (link-out + bank details from `site.ts`).
- More hub + Branches, Events (read), About/Contact, Settings (theme/language).
- **Exit:** a visitor can explore the whole church with no account; no dead ends.

## Phase 2: Auth + contribution (the wedge live)
- Email-OTP auth (`AUTH-1…4`, typed code delivered by email via Resend SMTP, `03`), gate sheet + gate-return.
- Family write: post testimony/prayer (consent → pending), **Glory to God**, **I prayed**, prayer→answered→testimony loop, report.
- Moderation dependency: minimal dashboard moderation queue + **daily-verse CRUD** (Phase A of `17`; verses cannot wait for Phase 4, see `22`).
- Analytics instrumentation: the v1 event list + north stars from `22-CONTENT-OPERATIONS.md` §5 (launch week is the only chance to baseline the wedge).
- Member Home (greeting, streak strip, inline Glory), Watch personalization (resume, save, notes).
- Attendance "I'm here" + streaks + milestones. (The devotional plan is PAID and moves to Phase 4 with the entitlement pipeline; until then the daily-verse card ships without the devotional CTA, see `07`.)
- Events RSVP; Academy register; profile.
- **Exit (met on Android 2026-08-14, W2.10):** members can contribute; the Family loop works end-to-end; nothing publishes without approval. Verified by six green Maestro journeys on the Android device (`apps/mobile/maestro/`) plus publish-bypass attempts refused at both the app and RLS/trigger layers. The iOS half of the E2E is **owed** (no iPhone in the project yet, see the launch checklist). Two gaps found and carried to the checklist: the More tab has no member variant, and Sentry stores city-level geo from the sending IP.

## Phase 3: Media depth + notifications
- **Audio-only sermons** (self-hosted), background + lock-screen playback, robust resume.
- HQ **Live** with "watching now" + live-watch attendance.
- Push (Expo) + Notification Center + tiers + deep links.
- ~~WhatsApp broadcast integration~~ (dropped 2026-07-29, ADR 0014: broadcasts are push + in-app only).
- Dashboard: broadcasts + events + branch/role management (Phase B of `17`).
- **Exit MET on Android, 2026-08-31 (W3.6). Both clauses:** members get the right notifications at the right scope; audio works while driving.
  - **"The right notifications at the right scope" is met, and substantiated rather than assumed.** All ten tiers were driven to the physical Android device against PRODUCTION: every one arrived with the right words, on the right one of the six Android channels, and tapped through to the right destination across all four deep-link routes, from BOTH backgrounded and killed. The scoping half was demonstrated with two real accounts in two branches: a ministry broadcast produced recipients in both, a Glasgow branch broadcast produced exactly one delivery row to the Glasgow member and nothing at all for the Berlin device. "Only service reminders interrupt" was proven by contrast (`importance=4` against `importance=3|SILENT` everywhere else). Evidence and method: W3.6 slice 3.
  - **The audit had to BUILD before it could verify.** Three notification kinds `09` promises had no producer at all, so two NOTIF-PREFS switches gated nothing; W3.6 slice 2 built `activity-notices` and they are now live in production and monitored.
  - **"Audio works while driving" is met**, field-tested by Ayo on his own device on 2026-08-31 and REPORTED rather than machine-checked, which is how this record states it. Four things observed: 15+ minutes playing with the screen locked, working lock-screen controls (play/pause, ±15s, artwork), survival of an interruption, and resume where it stopped after closing and reopening. The first two corroborate each other: `08` warns Android stops background audio after about three minutes without lock-screen controls registered, so a 15-minute locked listen is only possible if that registration worked.
  - **What this exit does NOT cover, so the gaps are deliberate rather than forgotten:** iOS, for both audio and E2E, because there is still no iPhone in the project; a Bluetooth car head unit specifically (the audio route and interruptions were exercised, an AVRCP head-unit display was not); and five of the six Maestro journeys, which cannot run in CI because the review bypass is deliberately off on production. All three sit on the launch checklist, and the first two belong to `21` §4's per-release manual matrix, which exists for exactly this.

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
If you must cut to the bone for v1, ship: **Onboarding · Home + daily verse (no devotional CTA while Store is deferred) · Watch (video + audio + resume) · Family (testimonies + Glory + prayer loop + scope + block) · Rhythm (attendance + streaks + milestones) · Give (link-out) · Events + RSVP · Auth + moderation · Notifications (push + tiers) · Settings (theme/language/blocked/delete).** Defer Store/Library (and with it the paid devotional plan), Academy registration, and dashboard content-management beyond verse CRUD to fast-follows. (WhatsApp used to sit in this list; ADR 0014 removed it from the product entirely rather than deferring it.)

**This is the shipping shape, and W4.7 slice 1 made it true in the app (2026-09-02).** Deferring a feature had never removed its DOOR: the More hub went on offering Bookstore, My Library and Daily devotional, all three opening a `StubScreen` that says "on its way". That is the placeholder content App Store guideline 2.1 rejects, and it was the likeliest cause of a re-submission cycle. The rows are now hidden behind `apps/mobile/src/lib/features.ts`, whose flags are **deleted by the item that finishes each feature** (W4.2 for the Store pair, W4.4 for the plan) rather than flipped and left behind, so `pnpm typecheck` hands that item the complete list of doors to reopen. The routes stay routable, because `04` forbids dead ends and the notification deep-link allowlist still names all three. Academy registration is the one line above that shipped early and stays: W2.9 built it and W4.0 gave leaders the tool to link a website payment to a member.

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
- [ ] Store review access: designated review email address with fixed code documented in the review notes (`03`).
- [ ] **Backend.** Rewritten 2026-08-31: this said "cleaned shared Supabase project", which ADR 0023 reversed. Production is `agbc-production`, a project of our own, eu-central-1. **Done:** created and fully migrated, EU region, RLS reviewed across the whole schema, secrets in EAS/Supabase and never in the bundle, nightly off-provider backups running and verified green. **Still owed: Pro plan** (`21` §7 calls it mandatory before launch; the project is on Free with usage alerts at 80% and a stop-and-upgrade rule at 50% egress).
- [x] ~~Email OTP delivery live: Resend custom SMTP on the church domain, SPF + DKIM + DMARC verified, rate limits configured (`03`).~~ **Done at Track P Phase 2 (2026-08-19), verified 2026-08-31.** Resend wired as custom SMTP on `agbc-production` with the four localized templates; a REAL sign-in reaching AUTH-3 closed it, and Ayo has since signed in on the production build. DNS carries SPF (`send`, amazonses), Resend DKIM (`resend._domainkey`, byte-compared before cutover) and DMARC. Rate limits set at Phase 1 and corrected at Phase 2 (`mailer_otp_exp` 600, `smtp_max_frequency` 30 to match the app's resend countdown). **One caveat, not a blocker:** DMARC is `p=none`, so it is monitoring and collecting reports rather than enforcing. Tightening it is a decision for after launch traffic exists.
- [ ] **Push: FCM done, APNs owed.** Split 2026-08-31 because half of it has been proven and the other half cannot start. **FCM V1 is configured and PROVEN end to end**: real pushes reached the physical Android device through Expo -> FCM across all ten notification tiers on 2026-08-30 (W3.6 slice 3), with receipts `ok`. **APNs is owed and blocked**: there is no iPhone in the project, so no iOS build has ever existed to carry a key. Same root cause as the iOS E2E below.
- [x] ~~WhatsApp broadcast sender approved~~ (not applicable: ADR 0014 removed the Cloud API and its sender registration).
- [x] ~~Forced-update gate wired: remote minimum-version check (Android in-app updates + config gate on iOS).~~ **Built in W1.2 and verified then by faking the minimum**, `apps/mobile/src/features/update-gate/`. Ticked 2026-08-31 after the audit found it done but unticked. The one thing still worth doing before submission is setting `app_config.minimum_supported_version` to a real floor on production; it currently has to let the current build through, which is correct until there is a released version to be below.
- [ ] Staged rollout plan with written halt criteria (Play staged %, iOS phased release); crash + ANR reporting live before widening.
- [ ] Moderation coverage: at least one leader per branch trained on the dashboard; pending-item notifications + 48h admin escalation working (`17`).
- [ ] **Audio owner AND audio SOURCE assigned**: weekly sermon MP3 upload is someone's named job (`08`), and the job needs a source `08` never names. **Not YouTube.** `08` already forbids the app extracting or proxying a video's audio track, and copyright ownership does not grant a download right, because YouTube's terms govern access to the service separately from who owns the content. The two legitimate sources are the media team's ORIGINAL recording (better quality, no terms question, and the only one that scales to a weekly task) or YouTube Studio's own download of your own upload. Raised 2026-08-30 when W3.6 slice 4 needed a file and there was none.
- [ ] **YouTube brand asset swap** (`08`, added W3.1 slice 4, 2026-08-15): audio mode attributes YouTube with a badge **we drew** (`features/watch/YouTubeCredit.tsx`). Their developer policies ask for YouTube Brand Features, which means their own asset, so take the official mark from YouTube's branding kit and replace the drawn one before submission. Nothing about the placement or the link changes.
- [ ] **Play Console `mediaPlayback` foreground-service declaration** (`08`, added W3.1 slice 3): the app now holds `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (expo-audio's config plugin) and uses it for background sermon audio, which the app-content form must declare or the release is rejected. Nothing to build; someone has to fill the form.
- [ ] **Seed content, and the one gap here is live right now.** Audited against production 2026-08-31: branches **4**, courses **3**, sermons **100** synced, testimony categories **8**, consent versions **2**. **`daily_verses` is 0.** Home's daily verse card is a core Phase 1 surface (`07`) and verse CRUD shipped early in W2.7 precisely because verses could not wait. The devotional plan is legitimately Phase 4's. **The monitoring works and has been telling you:** `verse-monitor` has emailed a `verse_depth` alert to BOTH admins every morning since 2026-08-19, twelve days of them, which is exactly the job doing its job. This is a content-operations gap (Gate 2, issue #19), not an engineering one.
- [ ] Legal: privacy policy + terms reachable in-app; DPAs on file; analytics consent implemented; web deletion page live (`20`, `16`): **the page is LIVE and proven end to end against production on 2026-09-02** (browser to route to function to OTP to erasure to the other device noticing); the rest of this line is what still holds the box open.
  **Reachable in-app is DONE (W4.6, 2026-09-03) and it was two defects, not one.** The PRIVACY
  screen `04` has listed since the navigation map was written did not exist: Settings had
  quietly replaced it with a row that opened the website. And the link went to the ENGLISH
  policy for everybody, while the site has served `/de/privacy`, `/nl/privacy` and
  `/fr/privacy` all along, which matters most here because `20` wants the policy understood
  rather than merely reachable. **What still holds this box open, and it is not app work:** the
  website's legal pages are DRAFTS (`legalEntity.reviewed` is `false`, so privacy, terms and
  Impressum all carry a draft banner), and the Impressum is incomplete under § 5 DDG, missing
  the company number, registered office, representative, VAT number and responsible person.
  Play asks for a privacy-policy URL at submission, so this is a W4.8 blocker as much as a
  W4.6 one. The named data-protection contact `20` asks for is also still unnamed.
- [ ] Launch-content checklist from `22-CONTENT-OPERATIONS.md` §2 complete (verses queued, devotional imported, seeded testimonies, trained moderators).
- [ ] Restore drill executed (prod dump restored into a scratch project, `21` §7). **Never run** (audited 2026-08-31). Note the dependency the audit surfaced: `21` §7 asks the drill to "boot the dashboard against it", so this cannot be completed until the dashboard is deployable. Also note a restore needs a free ACTIVE project slot on the Free plan, and the old paused project currently holds the second one.
- [x] ~~Shipping on Expo SDK 56+ (Play target API 36 requirement from 2026-08-31).~~ **Done, and verified on the deadline itself (2026-08-31).** `apps/mobile` is on `expo ~57.0.8`, and the build installed on the device reports `targetSdk=36`. The Play requirement took effect today and the app already satisfies it, so this needs watching rather than doing: the next SDK bump must not regress it.
- [ ] Block, report, and moderation UGC controls verified against Apple 1.2 / Play UGC policy.
- [ ] **The manual matrix (`21` §4) is executed EXCEPT for two dimensions, W4.7 (2026-09-02).**
  Done and recorded: small-phone width (~360dp), large phone (S22 Ultra), tablet in both
  orientations (Tab S10+), 1.8x text with the longest branch name, both themes, and an
  accessible name on every clickable node across eight screens. **Still owed: a LOW-END Android
  on the minimum supported OS**, because both devices in the project are current flagships and
  will hide exactly the jank `21` names low-end to catch; and **a human TalkBack pass**, since
  spoken output is not scriptable and only the labelling could be checked structurally. The
  iPhone column is deferred with the platform (Android-first launch, Ayo 2026-09-02).
- [ ] **iOS E2E owed:** the Maestro journeys and the Family loop have run on Android only (no iPhone in the project at W2.10). Run the suite on an iOS build once an Apple device exists; `21` §4 asks for both platforms pre-release.
- [x] ~~**More tab member variant (scheduled W3.3, not a loose end):** `apps/mobile/app/(tabs)/more.tsx` is guest-only by design.~~ **Built 2026-08-19 (W3.3 slice 5)** and verified on the device in both themes and in German: the member hub draws the `.mehead` identity card, the five "My life" rows all navigate (Profile, My rhythm, My List, My posts, Notifications with its unread count), and My Library lost its "Sign in" badge for members. The rhythm line on the card is omitted until the first "I'm here" (its own approved frame).
- [ ] **Push tray icon (Android):** `expo-notifications` has its `color` (brand gold) but deliberately no `icon`, because Android's small icon must be a solid-white silhouette with transparency and the only candidate in the repo is the 432x432 adaptive monochrome layer, whose art is inset for the adaptive mask and renders as a small blob in the tray. Until a purpose-built 96x96 exists, Android falls back to the app icon, which rendered correctly on device (2026-08-16). Making that asset is a design task; the decision and its reasoning sit in `app.config.js`'s plugin comment.
- [x] ~~**DEPLOY THE DASHBOARD.**~~ **Added and DONE the same day, 2026-08-31.** It was the
  largest thing this checklist was missing: there had never been a dashboard deployment, and
  `credentials.md` had recorded it as "OWED, blocked" since Track P, which is why TOTP
  enrolment had to run on a laptop. Until today no leader could moderate a testimony, publish
  an event, compose a broadcast or upload sermon audio unless somebody ran `next start`
  locally. The checklist had assumed a deployed dashboard existed, asking that leaders be
  TRAINED on one while nothing asked that it be put anywhere.
  **Live at `app-dashboard.agbcglobal.com`** (Vercel project `agbc-dashboard`, Git-connected
  to `apps/dashboard`, redeploys on push to `main`; DNS-only A record at Cloudflare).
  Verified: HTTPS 200, a real sign-in by Ayo, a signed-out `/moderation` turned away at
  `/sign-in`, Sentry crash reporting live with the DSN confirmed inlined in a client chunk,
  and sourcemap upload confirmed in the build log. `SUPABASE_SECRET_KEY` is deliberately
  absent and unnecessary until the first route calls `createAdminClient()`, which nothing
  does yet.
- [ ] **The dashboard `/mfa` QR code does not scan** (recorded in `credentials.md` at Track P
  Phase 4, surfaced onto this checklist 2026-08-31). Enrolment succeeded via the manual setup
  key for both admins, and the QR failed to scan even inside Google Authenticator. Every
  future staff member has to enrol, and an admin without a second factor cannot assign roles
  at all, so this stops being a curiosity the moment somebody who is not Ayo needs access.
- [x] ~~**`registration.confirmed` has no producer** (found by W3.6's audit, 2026-08-30).~~ **Built in W4.0 (#164, 2026-08-31)** as a fourth arm on `activity_notice_batch` (`20260831130000`), deployed to production the same day and verified against a real link. This line stayed unticked when the work landed; struck 2026-09-01 while W4.1 picked up the last orphan below. The
  fourth orphan of the same shape slice 2 fixed: the type, the template in four languages and
  the channel routing all exist, and nothing ever writes the row, so a member who registers
  for an Academy course is never told it was confirmed. W2.9 shipped it before push existed
  (W3.3) and no item claimed the caller afterwards. Now a one-armed addition to
  `activity_notice_batch`, not new infrastructure. `purchase.added` is the same shape but
  legitimately W4.1's, since Store does not exist yet, and is slice 6 of it.
- [ ] **Maestro E2E: one journey of six can run in CI, and the other five have nowhere to
  run.** Rewritten 2026-08-31; the first version of this item said simply "not in CI", which
  understated it. `nightly.yml` DOES exist and DOES run Maestro, on `workflow_dispatch` with
  an APK URL as input, and its own comment explains the missing cron as a budget decision
  deferred until CI can build its own binary.
  **The deeper blocker is authentication, not minutes.** Five of the six journeys
  (`otp-signin`, `post-testimony-pending`, `glory-gate-return`, `rsvp`, `block`) sign in
  through `subflows/signin-review.yaml`, which needs the store-review bypass. That bypass is
  deliberately OFF on production (`03`, ADR 0023 amendment), and ADR 0023 records that no
  separate dev project exists or is planned. So there is no environment CI can reach where
  those five could run at all. `guest-smoke` is the only one wired up because it is the only
  one that needs no account.
  **What would actually unblock it**, none of which is a workflow change: Supabase branching
  for ephemeral per-PR databases (a Pro feature, and Pro is already owed above); or building
  the APK in CI against a stack started in the same job, which compounds the binary problem
  rather than solving it; or W4.8's store-review window, when the bypass returns to production
  anyway and becomes a natural moment to run the full six. Until one of those, the full suite
  is a pre-release manual run, which is what `21` §4's own cadence line already asks for.
- [ ] **Sentry geo minimisation:** crash events store city-level Geography derived from the sending IP even with `sendDefaultPii:false`. If unwanted under `20`, enable the project's "Prevent Storing of IP Addresses" setting (`21` §6.1).

---

## Reference prototypes in this project (build to match)
- `App iOS + Android.dc.html`: full app, both device frames (primary visual/behavior reference)
- `AppFull.dc.html`: the app component (all screens + theming)
- `App Guest vs Member.dc.html`: guest vs member states
- `App Screen Map.dc.html`: the screen graph (~57 screens/states)
- `App Blueprint.dc.html`: system blueprint (journey/auth/data)

These are the source of truth for **look and feel only**; this doc set is the source of truth for **behavior, data, and architecture**, and **the docs win on every conflict**.

**Prototype patch (landed 2026-07-13):** every contradiction-level delta was fixed. AppFull: onboarding is now 2 steps + welcome (no blocking privacy screen, no notification step; layered privacy note on welcome; "I'm just looking" added), compose has a consent block and pending/moderation copy on both testimony and prayer flows, the gate is phone-OTP only, OTP copy shows WhatsApp-first + SMS switch. Screen Map: Nations map retagged **v1** (nation detail stays ph2), OAuth and recovery-email cards marked post-v1 with the docs' v1 rules, notifications shown as in-context (not a step), GIVE-BANK added (G3), giving history marked post-v1, Groups marked post-v1, events marked dashboard-managed, devotional reader marked paid/entitled, blocking-consent card rewritten as layered notice, footer corrected. Blueprint: auth decision updated to phone-OTP-only, WhatsApp-first. Both wrapper pages now embed **AppFull**; `AppPrototype.dc.html` is deprecated (banner in the file).

What remains in the prototypes are **absences, not contradictions** (screens the docs spec that AppFull doesn't demonstrate: BRANCH-SWITCH, LIVE with watching-now, WATCH-SEARCH, MY-LIST, the I-prayed / mark-answered loop actions, REPORT/POST-ACTIONS, AUTH-1 sign-in entry and AUTH-3 profile setup, real map pins). The gap list stays in `AUDIT-2026-07-12.md` Part D; build those from the docs.

> **Update 2026-07-18:** auth switched from phone-OTP to email-OTP (`03`). Where the `.dc.html` prototypes still show phone entry or WhatsApp/SMS OTP copy, they are superseded on that point by `03` and the patched `design/mockups/entry-flow.html`; the prototypes are historical and are not being re-edited.
