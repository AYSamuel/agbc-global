# 13 · Feature: Grace Academy & Courses

## Purpose
Bring the church's discipleship pathway (**Grace Academy**) into the app: browse the levels, view a course, and **register**: mirroring the website's academy but app-native.

## User stories
- As a member, I see the discipleship pathway and where I am in it.
- As a member, I view a course's outline and what I'll gain, and register.
- As a visitor, I can explore courses and be prompted to sign in to register.

## Screens
`ACADEMY` (pathway) · `COURSE` (detail) · `REGISTER` · `REGISTER-CONFIRM`.

### `ACADEMY`
- Intro to the pathway ("walk it out"). 
- **Levels** (from `academy/*.json`): e.g. **01 Grace Reset** (Foundations), **02 Grace Masterclass** (Deeper training), **+ Further levels** (upcoming). Clean cards in a consistent grid: no half-empty splits (design fix already applied in prototype).
- Tap a level/course → `COURSE`. Upcoming levels show "Coming soon / Notify me" (not a dead register).

### `COURSE`
- Slim text-led hero (level · name · one-line), meta row (formats · duration · fee), **outline** (numbered topics), **what you'll gain** list, prerequisite banner if any (e.g. Masterclass requires Reset).
- **Register** → `REGISTER` (gate).
- Data from `courses/*.json` (name, level, step, summary, outline, gains, prereq, fee, upcoming).

### `REGISTER` (superseded 2026-08-09, ADR 0017)
- **The app no longer registers anybody.** Courses are delivered on a third platform and
  every course is paid, so registration and payment both happen on the WEBSITE, and
  **Register** opens the website's own registration page in an in-app browser exactly as
  `12` does for giving. One form, one payment, one row.
- The handoff carries a short-lived, single-use token bound to (profile, course). The
  website resolves it server-side, prefills, and writes `profile_id`, `source = 'app'` and
  `link_method = 'handoff'`, so an app-started registration is linked from birth and needs
  no matching afterwards. The token is opaque; `profile_id` is never in the URL.
- The app therefore has **no member INSERT on `course_registrations`**; it reads them.
- Prereq enforcement: if a required course is not done, show the prereq banner + link
  before handing off (don't hard-block v1 unless the church wants).
- The previously refined in-app checkout form (format selector, name/contact prefill,
  branch, notes, fee summary) is retired with this change, along with its
  `REGISTER` / `REGISTER-CONFIRM` mockup frames. Kept in the mockup for history, not built.

### `REGISTER-CONFIRM` (superseded 2026-08-09, ADR 0017)
- The website shows its own confirmation. Returning to the app, `COURSE` simply reads as
  registered.

## Data
- `courses`, `course_registrations`. Seed courses from `agbc/src/content/courses/*.json` + `academy/*.json`.

## States / edge cases
- **Guest:** browse academy/courses; Register → gate (returns to registration).
- **Upcoming course:** "Notify me" instead of Register; records a `course_interest` row (unique per member per course, see `02`) so admins can actually notify interested members when the level opens (`17`). An ONLINE-ONLY write (decided 2026-08-10): it does not join the W2.4 offline queue; an offline tap fails honestly with a retry. Withdrawing is a DELETE, offered in place once interest is recorded.
- **Fee:** displayed in the app, charged on the website (ADR 0017). Regional pricing comes from `course_fees_regional`; both current courses are paid (£40 Masterclass, £25 Reset, with Nigeria overrides), so there is no free path. Because the course itself runs on a third platform, this is a real-world service booked off-platform: external payment is REQUIRED and **no Apple IAP question arises**. Never add in-app purchase here without re-checking policy. *Display rule (decided 2026-08-10):* the app always shows the BASE fee in the meta chip; where a regional override exists, COURSE adds one note line ("₦5,000 in Nigeria") alongside `fee_note`. Never a guess at what this viewer will pay: the website derives its own price at checkout.
- **Handoff fails / member cancels in the browser:** returns to `COURSE`, still unregistered, no error state beyond the browser's own (same as `12` §giving). The token simply expires unused.
- **Already registered:** show status ("You're registered: pending confirmation" / "your
  place is confirmed") plus **"Email us about this registration"** *(amended 2026-08-10,
  Ayo, superseding the in-app Cancel action)*: members do NOT cancel from the app. A paid
  place is released by a human after a conversation, so the action opens a prefilled,
  editable message sent through the same `contact-form` function the CONTACT screen uses
  (same inbox, same rate limit), with the course and a short registration reference
  attached automatically. Staff cancel, and handle any refund, manually. The database's
  member cancel transition (trigger-limited pending/confirmed → cancelled, the partial
  unique freeing the slot for a new row) stays exactly as W2.9 slice 2 built it: unused
  by the app, available to staff tooling; revoking the member grant is a possible later
  tightening, recorded here so it would be a decision rather than drift.
- **"Notify me" delivery:** when a course opens, the dashboard's "Notify interested members" action sends the transactional `course_opened` notification to every `course_interest` row and deletes them (interest is consumed); see `17` §4.

## Permissions
- Browse: guest. Register: member.

## Notifications
- Registration received/confirmed. Course starting soon reminder. Deep-link → `COURSE`.

## Acceptance criteria *(amended 2026-08-09 with ADR 0017: the app registers nobody; and 2026-08-10: cancelling is a conversation)*
- [ ] Pathway + courses render from seeded content.
- [ ] Register gates for guests; for members it opens the website's registration page in
      an in-app browser, carrying the handoff token when one could be minted.
- [ ] A registration made on the website (either address the member has proven) shows as
      registered in the app; the member is never walked into paying twice.
- [ ] Prerequisite is surfaced where relevant.
- [ ] Upcoming courses never present a dead Register button.
- [ ] A registered member can reach the team about their registration from the app
      (prefilled message, contact-form path); the app writes NOTHING on the row.
