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
- **Milestones** achieved + next milestone (progress, the server's; see §Milestones).
- **Attendance history** (calendar/list).
- **Devotional progress** summary → `PLAN`.
- Grace-framed empty/paused states.

### Milestones (`milestones`)
Named kinds: `first_service`, `first_testimony`, `first_prayer`, and later `plan_7_days` / `plan_complete` (W4.4). Achieving one shows a brief celebration overlay + optional share. Purely positive.

**Two endless ladders** (built W2.8 slice 5, `20260808214722`; decided with Ayo 2026-08-08 after RHYTHM exposed the dead end). `4, 12, done` meant that past twelve weeks the ring sat permanently full, the "Next" card vanished, and the app never celebrated a member again: the retention loop went quiet for exactly the people who show up most.

| Ladder | Kind | Rungs | Answers |
|---|---|---|---|
| Rhythm rungs | `4_week_rhythm`, `12_week_rhythm`, `26_week_rhythm`, `52_week_rhythm`, `<52n>_week_rhythm` | a month of Sundays; then a season, half a year, a year and every year after, in calendar months (W4.16, below) | "how long without a gap"; the time rungs are measured within a run, so a place on them CAN be lost |
| Gatherings | `<n>_gatherings` | 10, 25, 50, 100, then one per hundred without end | "how many times, ever"; cumulative, so a lapse costs nothing |

**The rhythm rungs keep a real calendar** (W4.16, decided with Ayo 2026-09-14, migration `20260914120000`; the plan `docs/spec/plans/W4.16-rhythm-real-calendar.md` carries every reason). Until then each rung was a COUNT of attended weeks (4, 12, 26, 52), which disagreed with its own name: "A month of Sundays" landed with a fifth Sunday still to come, in 17 days where a branch meets midweek, and after six weeks of every other Sunday.
- **A month of Sundays is every week of one calendar month.** A week belongs to the month its SUNDAY falls in, so a month has exactly as many weeks as Sundays (4 or 5). Any gathering covers its week, not only a Sunday one (members who work Sunday shifts come midweek), and several in one week count once. Grace does not apply inside the month; a missed week loses that month, and the next is a fresh chance. It is not tied to the current run: any fully covered month in a member's history earns it. A midweek gathering in the month's last week completes it before its last Sunday, so no copy may say "every Sunday".
- **A season, half a year and a year are 3, 6 and 12 calendar months** from the first gathering of the CURRENT run, then every further 12 months. Earned at the first gathering ON OR AFTER the anniversary, never before (a run from Sunday 6 September 2026 does not reach its year on Sunday 5 September 2027). Grace still carries a run across one missed week and two still end it, so the anniversary restarts with a new run. Somebody who gathers every other Sunday reaches a year in about 27 gatherings; the gathering ladder is what counts the times.
- **Progress is the server's.** `rhythm_state()` answers `next_kind` (the first rung the member does not hold yet, so "Next" never counts down to a badge they already have), `progress_done`, `progress_total` and `progress_month`. Before the month is held the ring and the Next card count its weeks ("2 of 4 in September", "In October" while nothing counts yet); after it, whole calendar weeks toward the next time rung ("5 weeks to go", and "Almost there" when the count is full, never "0 weeks to go"). The ring keeps the run's weeks as its label, so it can be an empty track but never a 0.

- **Deliberately not Duolingo's engine.** The endlessness is copied; the loss aversion is not. Every award is `unique(profile_id, kind)`, so a badge already held is never re-awarded and never taken away: a member whose streak breaks keeps every rung they ever reached, and the gathering ladder keeps climbing through the break. Badges the old week count gave that the calendar rule would not are kept too.
- **Awarding is a sweep, not a test of one number.** `attendance_after_insert` awards the month if any month is fully covered, every time rung the current run has reached, and every gathering count reached, which is self-healing: a late offline replay that completes a month or bridges two runs awards whatever it made true on the next check-in. The new rules award on a member's NEXT check-in; nothing was backfilled.
- **Named in church language, not counted:** a month of Sundays, a season with us, half a year, a year of Sundays; past that `{{count}} years of Sundays`. **The rhythm kind strings are identifiers, not counts**: they kept their names when W4.16 moved them onto the calendar, because renaming them would re-celebrate every badge already held (`celebrated.ts` keeps each device's list of kinds it has told). The gathering rungs are ORDINALS ("your 50th gathering"), which are not plurals: i18next needs `{ ordinal: true }` or it renders the raw key.
- A **belonging anniversary** ("one year since your first Sunday") was offered and NOT taken. Do not add it without asking.

### Devotional plan (`PLAN` / `PLAN-DAY`): paid, entitlement-gated
**Model decision (2026-07-12):** devotionals are written by the lead pastor and **purchased** (Payhip, like books; see `14`). A purchased devotional is both a book in My Library AND, once imported, a structured day-by-day plan. `reading_plans.book_id` links a plan to its book; the entitlement unlocks the plan experience.
- A reading plan (`reading_plans`) with daily entries (`devotional_days`: verse ref, verse text (WEB translation), reflection, prayer). **English v1.**
- `PLAN`: owned plans + today's day, progress ring, day list. **Enrollment anchor:** a `plan_enrollments` row (see `02`) is created on first PLAN open; "today's day" = the lowest incomplete day_number (missed days shift, never skip; calendar- and timezone-independent); the "active plan" (Home CTA target when a member owns several) = the enrollment with incomplete days and the most recent progress write. Non-owners see the devotional's store page (`BOOK-DETAIL`) with a "Get the devotional" CTA, never an empty or locked screen.
- `PLAN-DAY`: the day's verse + reflection + prayer; **Mark complete** (owner) → `plan_progress` + possible milestone (`plan_complete:<plan_id>`).
- Home daily-verse CTA routing: entitled + active plan → `PLAN-DAY`; otherwise → the devotional's `BOOK-DETAIL`. (The free daily verse itself stays free for everyone.)
- Structured days are imported once per devotional via the dashboard (`17`; pipeline in `22-CONTENT-OPERATIONS.md`).

## Data
- `attendance`, `streaks` (derived/cached), `milestones` (unique per profile+kind: no double celebrations), `reading_plans`, `devotional_days` (entitlement-gated reads), `plan_progress`, `daily_verses`.
- **Streak computation (built W2.8, `20260807120000`):** an AFTER INSERT trigger on `attendance` runs an idempotent FULL recompute from `attendance` (never incremental-only, so late offline replays retro-correct via `client_taken_at`, see `02`; a replayed row that BRIDGES two runs joins them, which an incremental count cannot see). A streak week is **the ISO week of `attendance.service_date`, nothing else** (the timezone acted once, at write time, in the attended branch; `service_date` is immutable, so timezone edits and home-branch moves never re-bucket history); `longest_weeks` is monotonic. A weekly lease-locked cron pass re-runs it as a safety net (`21` §5, ADR 0016).
- **The timezone acts in exactly one function**, `attendance_service_date(instant, zone)`, which is why it is a function and not a line inside the trigger: the 72-hour clamp puts every historical instant out of the trigger's reach, so the March and October clock changes can only be asked about directly. `030` asks about both, in both directions, plus a branch with no DST at all.

## States / edge cases
- **Guest:** "I'm here" / streak → gate. Devotional plan content is PAID: guests and non-owners see the store page, not the day content (a free teaser day per plan is allowed if the pastor wants one; decide per plan).
- **Visiting another branch:** "I'm here" records attendance at the BROWSED branch (see the branch-context model in `07`); streaks count attendance at any branch (week = the ISO week of `service_date`, fixed at write time). **The tap asks before it writes whenever that branch is not the member's home branch** (2026-09-07; the reasoning, the refusal's behaviour and the BRANCH-INFO variant are in `07`). One extra tap, for one kind of member, on one kind of Sunday, and it buys back the only unrecoverable mistake this feature can make: the day is unique per member, so a stray tap cannot be moved afterwards by anyone.
- **Stream never went live:** members who opened `LIVE` during the service window already wrote attendance at open (credit-on-open, `08`), so grace-framing survives technical failures with no extra mechanism.
- **Missed week: grace covers one, two start again** (decided with Ayo 2026-08-07, W2.8, and specified here because `02` said "consecutive ISO weeks" while this line said "pauses and resumes", which are different rules). One missed week does not break the run: four weeks, a hard Sunday, then back reads as **five**, with grace copy for the week that was missed. Two consecutive missed weeks end the run, and the next attendance begins a new one at 1 while `longest_weeks` keeps what they did. A member who attends every other week therefore keeps an unbroken rhythm, which is the intended reading of "a streak is a gift, not a debt". (Design choice: document if the church later wants strict streaks.)
- **The four states a screen must render**, from `rhythm_state()` rather than from the client's own arithmetic: `none` (nothing recorded yet), `active` (attended this week or last), `grace` (one full week missed, the run carried across it), `lapsed` (two or more full weeks missed; the live streak reads 0 and the longest is untouched). The server owns "today", in the timezone of the branch being browsed, so the card and the write can never disagree about which day it is.
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
