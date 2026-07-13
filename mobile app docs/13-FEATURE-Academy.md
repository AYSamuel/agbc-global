# 13 · Feature — Grace Academy & Courses

## Purpose
Bring the church's discipleship pathway (**Grace Academy**) into the app: browse the levels, view a course, and **register** — mirroring the website's academy but app-native.

## User stories
- As a member, I see the discipleship pathway and where I am in it.
- As a member, I view a course's outline and what I'll gain, and register.
- As a visitor, I can explore courses and be prompted to sign in to register.

## Screens
`ACADEMY` (pathway) · `COURSE` (detail) · `REGISTER` · `REGISTER-CONFIRM`.

### `ACADEMY`
- Intro to the pathway ("walk it out"). 
- **Levels** (from `academy/*.json`): e.g. **01 Grace Reset** (Foundations), **02 Grace Masterclass** (Deeper training), **+ Further levels** (upcoming). Clean cards in a consistent grid — no half-empty splits (design fix already applied in prototype).
- Tap a level/course → `COURSE`. Upcoming levels show "Coming soon / Notify me" (not a dead register).

### `COURSE`
- Slim text-led hero (level · name · one-line), meta row (formats · duration · fee), **outline** (numbered topics), **what you'll gain** list, prerequisite banner if any (e.g. Masterclass requires Reset).
- **Register** → `REGISTER` (gate).
- Data from `courses/*.json` (name, level, step, summary, outline, gains, prereq, fee, upcoming).

### `REGISTER`
- **Checkout-style** form (design already refined): format selector (**In person / Online**), name + contact (prefilled from `profiles`, not stored again), **branch** (optional, defaults to home branch), notes (stored in `course_registrations.notes`, see `02`); **fee summary** (live total); submit.
- Submit → `course_registrations` (`status = pending` or `confirmed` per church policy) → `REGISTER-CONFIRM` (checkmark, what happens next).
- Prereq enforcement: if required course not done, show prereq banner + link (don't hard-block v1 unless church wants).

### `REGISTER-CONFIRM`
- Confirmation + next steps (when it starts, how they'll be contacted). Back to Academy/Home.

## Data
- `courses`, `course_registrations`. Seed courses from `agbc/src/content/courses/*.json` + `academy/*.json`.

## States / edge cases
- **Guest:** browse academy/courses; Register → gate (returns to registration).
- **Upcoming course:** "Notify me" instead of Register; records a `course_interest` row (unique per member per course, see `02`) so admins can actually notify interested members when the level opens (`17`).
- **Fee:** display only in v1 (payment handled offline / on web / in person) unless church specifies in-app payment (then follow giving-style link-out).
- **Submit fails:** inline error + retry, form state preserved.
- **Already registered:** show status ("You're registered — pending confirmation").

## Permissions
- Browse: guest. Register: member.

## Notifications
- Registration received/confirmed. Course starting soon reminder. Deep-link → `COURSE`.

## Acceptance criteria
- [ ] Pathway + courses render from seeded content.
- [ ] Register gates for guests and records a registration with format + branch.
- [ ] Prerequisite is surfaced where relevant.
- [ ] Upcoming courses never present a dead Register button.
- [ ] Confirmation clearly states next steps.
