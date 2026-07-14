# 10 · Feature: Rhythm (Attendance · Streaks · Milestones · Devotional Plan)

## Purpose
Encourage a healthy spiritual rhythm (showing up, and daily devotion), **framed by grace, never guilt.** This is the retention loop, done in a way that fits a church (celebration and encouragement, not Duolingo-style punishment).

## Guiding principle
> A streak is a gift, not a debt. A missed week **pauses** the streak with kind copy ("Grace covers this week: we'd love to see you"), never a red broken-heart shaming pattern. The goal is drawing people closer, not manufacturing anxiety.

## User stories
- As a member, when I attend a service I tap "I'm here" and my rhythm reflects it.
- As a member, I see a gentle streak and celebrate small milestones.
- As a member, I follow a daily devotional plan and mark days complete.

## Screens
`RHYTHM` (My Rhythm) · `PLAN` (devotional plan) · `PLAN-DAY` · milestone celebration (overlay).

### Attendance: "I'm here"
- Surfaced on **Home** (next-service card) and available around service time.
- Tap **"I'm here"** → `attendance` insert for that `service_date` (one per member per service). Simple, trust-based (chosen over geofencing/QR for simplicity and warmth).
- **Live watch** also counts: watching the HQ `LIVE` writes `attendance.source = live_watch`: so remote/diaspora members keep rhythm too (critical for a scattered family).
- Confirmation: warm toast + streak update.

### `RHYTHM` (My Rhythm)
- **Current streak** (consecutive weeks with attendance), longest streak, encouraging headline.
- **Milestones** achieved + next milestone (progress).
- **Attendance history** (calendar/list).
- **Devotional progress** summary → `PLAN`.
- Grace-framed empty/paused states.

### Milestones (`milestones`)
Examples: `first_service`, `4_week_rhythm`, `12_week_rhythm`, `first_testimony`, `first_prayer`, `plan_7_days`, `plan_complete`. Achieving one shows a brief celebration overlay + optional share. Purely positive.

### Devotional plan (`PLAN` / `PLAN-DAY`): paid, entitlement-gated
**Model decision (2026-07-12):** devotionals are written by the lead pastor and **purchased** (Payhip, like books; see `14`). A purchased devotional is both a book in My Library AND, once imported, a structured day-by-day plan. `reading_plans.book_id` links a plan to its book; the entitlement unlocks the plan experience.
- A reading plan (`reading_plans`) with daily entries (`devotional_days`: verse ref, verse text (WEB translation), reflection, prayer). **English v1.**
- `PLAN`: owned plans + today's day, progress ring, day list. **Enrollment anchor:** a `plan_enrollments` row (see `02`) is created on first PLAN open; "today's day" = the lowest incomplete day_number (missed days shift, never skip; calendar- and timezone-independent); the "active plan" (Home CTA target when a member owns several) = the enrollment with incomplete days and the most recent progress write. Non-owners see the devotional's store page (`BOOK-DETAIL`) with a "Get the devotional" CTA, never an empty or locked screen.
- `PLAN-DAY`: the day's verse + reflection + prayer; **Mark complete** (owner) → `plan_progress` + possible milestone (`plan_complete:<plan_id>`).
- Home daily-verse CTA routing: entitled + active plan → `PLAN-DAY`; otherwise → the devotional's `BOOK-DETAIL`. (The free daily verse itself stays free for everyone.)
- Structured days are imported once per devotional via the dashboard (`17`; pipeline in `22-CONTENT-OPERATIONS.md`).

## Data
- `attendance`, `streaks` (derived/cached), `milestones` (unique per profile+kind: no double celebrations), `reading_plans`, `devotional_days` (entitlement-gated reads), `plan_progress`, `daily_verses`.
- **Streak computation (specced):** an AFTER INSERT trigger on `attendance` runs an idempotent FULL recompute from `attendance` (never incremental-only, so late offline replays retro-correct via `client_taken_at`, see `02`). A streak week is **the ISO week of `attendance.service_date`, nothing else** (the timezone acted once, at write time, in the attended branch; `service_date` is immutable, so timezone edits and home-branch moves never re-bucket history); `longest_weeks` is monotonic. A weekly lease-locked cron pass re-runs it as a safety net (`21` §5).

## States / edge cases
- **Guest:** "I'm here" / streak → gate. Devotional plan content is PAID: guests and non-owners see the store page, not the day content (a free teaser day per plan is allowed if the pastor wants one; decide per plan).
- **Visiting another branch:** "I'm here" records attendance at the BROWSED branch (see the branch-context model in `07`); streaks count attendance at any branch (week = the ISO week of `service_date`, fixed at write time).
- **Stream never went live:** members who opened `LIVE` during the service window already wrote attendance at open (credit-on-open, `08`), so grace-framing survives technical failures with no extra mechanism.
- **Missed week:** streak pauses at prior value with grace copy; resumes on next attendance (no reset-to-zero shame). (Design choice: document if the church later wants strict streaks.)
- **Duplicate "I'm here":** idempotent (unique per service_date): second tap is a no-op with "You're already checked in."
- **Timezone/branch service day:** `service_date = (now() at time zone branches.timezone)::date` (the `branches.timezone` IANA column, see `02`); same-day double services deliberately collapse into one attendance row.
- **Plan finished:** celebrate completion; offer next plan or replay.
- **Offline:** queue attendance/completion; sync when back.

## Permissions
- All tracking is member-level. Devotional plan content requires the entitlement (paid); the free daily verse (`07`) is the guest-facing daily touchpoint.

## Notifications
- Optional gentle daily devotional reminder (if enabled). Service reminder before service. Milestone achieved (in-app celebration; push optional). Never guilt pushes.

## Acceptance criteria
- [ ] "I'm here" records once per service and updates the streak.
- [ ] Watching HQ live counts toward attendance for members.
- [ ] A missed week never shows shaming UI; copy stays encouraging.
- [ ] Devotional days are readable and completable by entitled owners, with progress + milestones; non-owners are routed to the devotional's store page, never a dead or locked screen.
- [ ] Purchase → entitlement → plan unlock works end to end (Payhip flow, see `14`).
- [ ] Milestones trigger a positive celebration, not a nag.
