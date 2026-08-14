# 17 · Admin: Leader Web Dashboard

## Purpose
Give branch leaders and ministry admins the tools to **run the app's content and community**: without shipping admin power into the member app. **Decision: a separate web dashboard** (not in the mobile app) for moderation, broadcasting, and content.

## Why a separate web dashboard
- Moderation and broadcasting are desk tasks: easier on a keyboard/large screen.
- Keeps the mobile app lean and the attack surface small (no admin code in the consumer binary).
- Faster to iterate (web deploy, no store review).

## Platform
- Web app (Next.js/React) on the **same backend** (Supabase): reads/writes the same Postgres with **admin-scoped RLS / service role** behind server routes. Auth via the same identity (leaders sign in; role checked).
- **Authorization rule (service role bypasses RLS entirely, so route code IS the authorization layer):** a **centralized `authorize()` that EVERY server route awaits** (a Data Access Layer, `apps/dashboard/src/server/authorize.ts`) derives the caller from their session cookies, confirms the session is still live with the auth server (`getUser()`, not a locally-decoded `getClaims()`, so a signed-out or revoked session dies immediately rather than at token expiry), loads role + branch server-side from `profiles`, and authorizes the specific action + target BEFORE any service-role call. Client input never supplies authority (no request-body `branch_id` trusted; the target branch is read from the row being acted on). Prefer the caller's own JWT + RLS where possible; reserve service-role for genuinely admin operations. CI runs IDOR probes (foreign branch ids) against every route (`21` §4).
  - **Not Next's `proxy.ts`** (the Next 16 rename of `middleware.ts`). Next's own docs say that layer "should not be your only line of defense in protecting your data" because it runs on prefetched routes and must stay cookie-shallow; it is used here ONLY for an optimistic redirect of signed-out visitors. Wording corrected 2026-07-29 (W2.7 slice 1): the requirement is unchanged, the word "middleware" pointed at the one place Next says not to rely on.
  - **Order of refusal:** identity and role are decided BEFORE the second factor. An ordinary member who opens the dashboard is told plainly that it is not for them, rather than being walked through installing an authenticator app first and refused afterwards.
- **Staff MFA (per the security standard):** **TOTP today; passkeys/WebAuthn when they reach GA**, mandatory for admins and leaders alike (`authorize()` refuses any session below `aal2`, so the dashboard is unreachable without a second factor). Step-up re-auth for role assignment, branch management, and ministry-scope broadcasts. Dedicated admin accounts; every privileged action audit-logged (actor, action, target, timestamp, immutable) in **`privileged_actions`** (`02`, introduced by ADR 0015): append-only, admin-read-only, written by an `AFTER UPDATE` trigger rather than by each caller, so auditing is structural and cannot be forgotten. Role and branch changes write to it first; moderation decisions, restores and broadcasts migrate on as those surfaces are next touched. Retention 7 years, surviving a member's erasure with the identity dropped (`20`). **Note the step-up list above is narrower in practice than it reads:** role assignment yes, approving a branch-change request no, because re-challenging a leader on every queue item is how queues stop getting cleared (decided 2026-07-29).
  - **KNOWN GAP (decided 2026-07-28, W2.7):** TOTP is a real second factor but is relay-phishable, so this does not yet meet the phishing-resistant bar this doc and `~/.claude/standards/security.md` ask for. Supabase's passkey support is in beta (28 May 2026) and its docs reserve the right to change the API without notice, which is not acceptable under the accounts that can publish to the whole ministry. **Trigger to revisit: passkeys reaching GA.** The enrolment UI is nearly the same shape, so the swap is small.
  - **Idle timeout is enforced here, not in Supabase.** Supabase session timeouts are project-wide and would sign out the mobile app's members too, so `authorize()` requires the session's TOTP verification (read from the JWT's `amr` claim) to be under **24 hours** old and sends the leader back through the challenge otherwise. A leader types six digits about once a day; a stolen laptop session goes stale overnight.
  - **Enrolling a factor is account-level, not app-level.** Once a leader enrols, every client signing that account in reports `nextLevel: aal2`, including the mobile app. The app is unaffected (its session stays valid at `aal1`, and no RLS policy in this project requires `aal2`) and simply never offers the challenge. Do NOT reach for the restrictive-RLS pattern in Supabase's MFA guide to enforce this: applied to these tables it would hit the app's members and lock every one of them out of their own content the moment any of them enrolled.

## Roles
- **Leader**: scoped to **their branch**: moderate that branch's testimonies/prayers/reports, **approve or refuse requests to JOIN their branch** (module 5; the branch being joined decides, never the one being left), post branch events, send **branch** broadcasts, manage branch service times/details. A leader's branch is assigned by an admin and is never self-writable, because moderation authority derives from it (`02` §Invariants, ADR 0015).
- **Admin**: **ministry-wide**: everything leaders can do across all branches, plus manage branches, assign roles, **approve branch-change requests as the fallback** (immediately where the destination has no leader, after 48 hours where it does) and approve a LEADER's own move, post global events, send **ministry** broadcasts, manage global content (daily verses, devotional plans, courses, books, sermon audio). An admin sets their own home branch directly, which grants nothing since they already moderate everywhere; they cannot change their own role, and the last admin cannot be demoted (ADR 0015).

## Modules

### 1. Moderation queue
- Pending **testimonies** + **prayers** (per branch for leaders; all for admins).
- Actions: **Approve / Reject (with reason) / Remove**. Approving flips `status='approved'` → appears in app feed; author notified. **Compare-and-set:** every decision carries the `updated_at` of the version reviewed; if the author edited meanwhile, the action fails with "content changed since review" and the item returns to the queue (`02` invariants). Only admins can restore `removed` content (audit-logged).
- **Reports** inbox (`reports`): review flagged content → action or dismiss.
- Audit trail (`moderated_by`, `moderated_at`).
- **Freshness safeguard:** leaders are notified (push/in-app) when new items enter their queue; anything `pending` longer than 48h escalates to admins, who can moderate any branch. A quiet leader must never make a branch's feed look dead.
- **Language rule:** stale items in a language the escalation admin cannot read escalate to the named reviewer for that language (DE: Berlin lead, NL: Emmen lead, FR: named reviewer TBC, Yoruba: Ogbomosho leads; see `22` §4). Nobody approves content they cannot read: hold + request translation instead.
- **Rejection flow:** "Reject (with reason)" writes `rejection_reason`; the author sees it in MY-POSTS with an "Edit and resubmit" action (`09`). Any author edit to an approved post automatically re-enters this queue (`02` invariants).
- **Safeguarding guideline:** posts disclosing abuse or self-harm are NOT approved; they route to the branch lead pastor via the church's existing safeguarding process (see `20`). Photos of identifiable minors without known consent are rejected.

### 2. Broadcasts
- Compose a `broadcast`: scope (branch/ministry), title, body (+ optional `body_de`/`body_nl`/`body_fr`, see `22` §4), optional deep link. Channels are push + in-app, both, always: there is no channel picker (ADR [0014](../decisions/0014-push-only-broadcasts.md)).
- **"Copy for WhatsApp":** the rendered message plus its deep link as pasteable text, for a leader to post into the church's existing WhatsApp community. This is the ONLY route that reaches people who do not have the app, and it is a human action, not an integration. Not a send: nothing is delivered by the dashboard, and the copy carries no member data.
- **Blast-radius controls:** confirmation screen shows the EXACT recipient count, the fully rendered body, and any link's expanded destination before send; outbound links are allowlisted/previewed; per-account daily send caps; **ministry scope requires a second admin's approval (four-eyes)**: the approve route refuses `approver == author` (backed by the DB CHECK in `02`), and a rejection sets `status='rejected'` + `review_note` (shown to the author); the author's next edit moves it back to `draft` for resubmission; a **halt control** stops an in-flight fan-out mid-delivery. (Four-eyes is about blast radius, not cost, so it survives the removal of the paid channel.)
- Send → edge function fan-out respecting `notification_prefs` (see `15`), chunked and resumable via `broadcast_deliveries`. History of sent broadcasts with per-channel outcomes.

### 3. Events
- CRUD `events`; leave branch empty for ministry-wide (`branch_id IS NULL`, see `02`); enable RSVP; upload image. (Sanity sync is a post-v1 option, see `11`.)
- **Cancellation/reschedule/reinstate:** a published event with RSVPs is CANCELLED (`status='cancelled'`), never hard-deleted; cancelling, changing time/venue, or reinstating (future events only) auto-notifies all non-cancelled RSVPs (`11`).

### 4. Content
- **Daily verses**: schedule per date/language, with CSV/spreadsheet batch import (quarterly 90-day batches, `22` §1).
- **Devotional plans**: the structured-import tool: a purchased devotional (Payhip book) gets its day rows (`devotional_days`) imported once per release against the template in `22-CONTENT-OPERATIONS.md`; the plan links to the book (`reading_plans.book_id`) so the entitlement unlocks it. Free plans (if ever) are created the same way without a book link.
- **Courses**: manage academy courses, registrations list, confirm/cancel registrations. **"Notify interested members"** (offered when a course opens): sends the transactional `course_opened` notification to every `course_interest` row, then deletes them (interest is consumed). Closing a course back to `upcoming=true` is blocked while any registration is `pending`: confirm or cancel each first.
- **Sermon audio**: upload self-hosted audio, attach metadata; YouTube video auto-syncs. (Built in W3.1, not Phase C: see the phasing note below.)
- **Books**: manage catalog, link Payhip, upload files, handle entitlement issues / manual grants, and work the **unmatched-purchases queue** (`02`/`14`) weekly.

### 5. People & branches
- **Admins:** manage branches (add/edit: service times, lead, leaders, address, lat/lng, YouTube channel), assign **roles** (member→leader→admin), scope leaders to branches. **Archive branch** (never delete, `02`): blocked until the branch's leaders are reassigned or demoted; archiving stops its reminders/broadcasts, hides it from all pickers and the map, escalates its residual pending moderation to admins, and triggers the members' "choose your new home branch" prompt.
- **Role assignment is Phase A**, pulled forward from Phase B (`25`, amended 2026-07-29): the queue is built for branch leaders and until a role can be assigned there is exactly one admin and none. It is admin-only, finds people by **exact email address only** (no partial matching, so nobody can probe which addresses belong to the ministry, and no member list is rendered), requires **step-up re-auth**, refuses an admin changing their own role, and refuses demoting the last admin.
- **Branch-change requests** are the leader half of this module and ship with it: leaders approve or refuse requests to JOIN their branch and see moves OUT of it as read-only history. Admins are the fallback approver. Refusal reasons are private and never reach the member. `16` carries the member side, ADR 0015 the decision, and `docs/spec/plans/W2.7-people-roles-and-branch-moves.md` the full design.
- Member directory (basic), with care for privacy. Note this now sits in tension with the exact-email rule above; when it is built, decide deliberately how much of a branch's membership a leader may enumerate at once.

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
- [ ] Leaders are strictly branch-scoped; admins are global: enforced server-side.
- [ ] Broadcasts fan out by scope and respect prefs.
- [ ] Admins can add a branch and it appears in the app (onboarding, Home switch, map) without an app release.
- [ ] Course registrations and entitlement issues are resolvable here.

> **Dashboard phasing (referenced as Phase A/B/C from `18`):** **Phase A** (with app Phase 2): moderation queue + reports inbox + **daily-verse CRUD** (verses cannot wait, see `22`) + **role assignment AND branch-change requests** (module 5's people half, pulled forward 2026-07-29: the queue is built for branch leaders, and until a role can be assigned there is exactly one admin and no leaders; the branch half joined it because ADR 0015 made branch assignment a server-approved action and both halves need the same write path, audit table and step-up). Branch MANAGEMENT itself stays Phase B. **Phase B** (app Phase 3): broadcasts, events, branch management. **Phase C** (app Phase 4): devotional plan structured-import, books/content management, courses, and **Insights** (module 6). **Sermon audio moved out of Phase C into W3.1 (2026-08-14, with Ayo):** this list had it in Phase C while `25`'s W3.1 carried it, and W3.1 is right: the audio slice's "listen while driving" promise has no content supply without the upload tool, and the media team's standing weekly upload task (`08`, `18`) must exist before launch, not after the feature it feeds.
>
> **Insights placed in Phase C (2026-07-29).** It had no phase at all, which meant nobody could say whether it was in v1. Phase C is right for two reasons: it is the only module that shepherds rather than operates, so nothing is blocked on it; and every number in it (attendance trends, testimonies this week, giving taps) says nothing useful until a season of real data sits behind it. Shipping it earlier would show a leader an empty chart and teach them the module is not worth opening.
