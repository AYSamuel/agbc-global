# 17 · Admin — Leader Web Dashboard

## Purpose
Give branch leaders and ministry admins the tools to **run the app's content and community** — without shipping admin power into the member app. **Decision: a separate web dashboard** (not in the mobile app) for moderation, broadcasting, and content.

## Why a separate web dashboard
- Moderation and broadcasting are desk tasks — easier on a keyboard/large screen.
- Keeps the mobile app lean and the attack surface small (no admin code in the consumer binary).
- Faster to iterate (web deploy, no store review).

## Platform
- Web app (Next.js/React) on the **same backend** (Supabase) — reads/writes the same Postgres with **admin-scoped RLS / service role** behind server routes. Auth via the same identity (leaders sign in; role checked).
- **Authorization rule (service role bypasses RLS entirely, so route code IS the authorization layer):** centralized middleware on EVERY server route derives the caller from their session JWT, loads role + branch server-side, and authorizes the specific action + target BEFORE any service-role call. Client input never supplies authority (no request-body `branch_id` trusted). Prefer the caller's own JWT + RLS where possible; reserve service-role for genuinely admin operations. CI runs IDOR probes (foreign branch ids) against every route (`21` §4).
- **Staff MFA (per the security standard):** passkeys/WebAuthn on the dashboard, **mandatory for admins**, strongly recommended for leaders (phone OTP alone is SIM-swappable and phishable, unacceptable for accounts that can broadcast to the whole ministry). Step-up re-auth for role assignment, branch management, and ministry-scope broadcasts. Dedicated admin accounts; short idle timeout; every privileged action audit-logged (actor, action, target, timestamp, immutable).

## Roles
- **Leader** — scoped to **their branch**: moderate that branch's testimonies/prayers/reports, post branch events, send **branch** broadcasts, manage branch service times/details.
- **Admin** — **ministry-wide**: everything leaders can do across all branches, plus manage branches, assign roles, post global events, send **ministry** broadcasts, manage global content (daily verses, devotional plans, courses, books, sermon audio).

## Modules

### 1. Moderation queue
- Pending **testimonies** + **prayers** (per branch for leaders; all for admins).
- Actions: **Approve / Reject (with reason) / Remove**. Approving flips `status='approved'` → appears in app feed; author notified.
- **Reports** inbox (`reports`): review flagged content → action or dismiss.
- Audit trail (`moderated_by`, `moderated_at`).
- **Freshness safeguard:** leaders are notified (push/in-app) when new items enter their queue; anything `pending` longer than 48h escalates to admins, who can moderate any branch. A quiet leader must never make a branch's feed look dead.
- **Language rule:** stale items in a language the escalation admin cannot read escalate to the named reviewer for that language (DE: Berlin lead, NL: Emmen lead, Yoruba: Ogbomosho leads; see `22` §4). Nobody approves content they cannot read: hold + request translation instead.
- **Rejection flow:** "Reject (with reason)" writes `rejection_reason`; the author sees it in MY-POSTS with an "Edit and resubmit" action (`09`). Any author edit to an approved post automatically re-enters this queue (`02` invariants).
- **Safeguarding guideline:** posts disclosing abuse or self-harm are NOT approved; they route to the branch lead pastor via the church's existing safeguarding process (see `20`). Photos of identifiable minors without known consent are rejected.

### 2. Broadcasts
- Compose a `broadcast`: scope (branch/ministry), title, body (+ optional `body_de`/`body_nl`, see `22` §4), channels (push / WhatsApp / in-app), optional deep link.
- **Blast-radius controls:** confirmation screen shows the EXACT recipient count, the fully rendered body, and any link's expanded destination before send; outbound links are allowlisted/previewed; per-account daily send caps; **ministry scope requires a second admin's approval (four-eyes)**: the approve route refuses `approver == author` (backed by the DB CHECK in `02`), and a rejection sets `status='rejected'` + `review_note`, returning the broadcast to draft with the note shown to the author; the WhatsApp cap is **enforced server-side** (the send route counts sent ministry-scope WhatsApp broadcasts in the calendar month and refuses beyond 2; override requires a second admin + an audit-log entry); WhatsApp shows the estimated cost pre-send (`21` §9); a **halt control** stops an in-flight fan-out mid-delivery.
- Send → edge function fan-out respecting `notification_prefs` (see `15`), chunked and resumable via `broadcast_deliveries`. History of sent broadcasts with per-channel outcomes.

### 3. Events
- CRUD `events`; leave branch empty for ministry-wide (`branch_id IS NULL`, see `02`); enable RSVP; upload image. (Sanity sync is a post-v1 option, see `11`.)
- **Cancellation/reschedule:** a published event with RSVPs is CANCELLED (`status='cancelled'`), never hard-deleted; cancelling or changing time/venue auto-notifies all non-cancelled RSVPs (`11`).

### 4. Content
- **Daily verses** — schedule per date/language, with CSV/spreadsheet batch import (quarterly 90-day batches, `22` §1).
- **Devotional plans** — the structured-import tool: a purchased devotional (Payhip book) gets its day rows (`devotional_days`) imported once per release against the template in `22-CONTENT-OPERATIONS.md`; the plan links to the book (`reading_plans.book_id`) so the entitlement unlocks it. Free plans (if ever) are created the same way without a book link.
- **Courses** — manage academy courses, registrations list, confirm/cancel registrations.
- **Sermon audio** — upload self-hosted audio, attach metadata; YouTube video auto-syncs.
- **Books** — manage catalog, link Payhip, upload files, handle entitlement issues / manual grants, and work the **unmatched-purchases queue** (`02`/`14`) weekly.

### 5. People & branches
- **Admins:** manage branches (add/edit — service times, lead, leaders, address, lat/lng, YouTube channel), assign **roles** (member→leader→admin), scope leaders to branches.
- Member directory (basic), with care for privacy.

### 6. Insights (light)
- Counts: active members, testimonies/prayers this week, attendance trends, giving taps (no financial PII), registrations. Enough to shepherd, not a full BI suite.

## Data touched
- Writes across `testimonies`, `prayers`, `reports`, `broadcasts`, `events`, `daily_verses`, `reading_plans`, `devotional_days`, `courses`, `course_registrations`, `books`, `entitlements`, `branches`, `profiles.role`.
- All gated by role + branch scope on the server.

## States / edge cases
- **Leader acting outside branch:** blocked server-side.
- **Double-moderation:** last action wins with audit; UI shows current status.
- **Broadcast to opted-out users:** suppressed per prefs; count reflects eligible recipients.
- **Deleting content with reactions:** reactions cascade/soft-remove; counts recompute.

## Acceptance criteria
- [ ] No public content goes live without passing the moderation queue.
- [ ] Leaders are strictly branch-scoped; admins are global — enforced server-side.
- [ ] Broadcasts fan out by scope and respect prefs.
- [ ] Admins can add a branch and it appears in the app (onboarding, Home switch, map) without an app release.
- [ ] Course registrations and entitlement issues are resolvable here.

> **Dashboard phasing (referenced as Phase A/B/C from `18`):** **Phase A** (with app Phase 2): moderation queue + **daily-verse CRUD** (verses cannot wait, see `22`). **Phase B** (app Phase 3): broadcasts, events, branch/role management. **Phase C** (app Phase 4): devotional plan structured-import + books/content management.
