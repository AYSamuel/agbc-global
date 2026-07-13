# 11 · Feature — Events

## Purpose
Keep members aware of what's happening — at **their branch** and **ministry-wide** — and let them RSVP. Global gatherings (the "many nations, one family" moments) reach everyone.

## User stories
- As a member, I see events for my branch and ministry-wide events.
- As a member, I RSVP and add an event to my calendar.
- As a leader, ministry-wide events I post notify the whole family (see `15`/`17`).

## Screens
`EVENTS` (list) · `EVENT-DETAIL` · RSVP (inline/sheet).

### `EVENTS`
- Filter/scope: **My branch** + **Ministry-wide** (global). Optional upcoming/past toggle.
- List: date block (day/month), title, time, location, **branch tag or "All branches"** badge, image.
- Empty → "No events scheduled yet" + "Check back soon" (never blank).
- Tap → `EVENT-DETAIL`.

### `EVENT-DETAIL`
- Hero image, title, full date/time (branch timezone), location (+ map/directions link), description.
- **RSVP** (gate): Going / Interested / Cancel → `rsvps` (unique per event+profile). Confirmation toast.
- **Add to calendar** (device calendar via `expo-calendar`).
- **Share** (OS/WhatsApp).
- **Global events** show "Ministry-wide — the whole family" treatment.

## Data source
- `events` (+ `rsvps`). **v1 source: manual entries from the dashboard.** A Sanity sync is a post-v1 option if the website's CMS must stay canonical for events. `branch_id IS NULL` ⇒ ministry-wide (notifies all; see `15`).

## Data
- Reads: `events` filtered by branch or global. Writes: `rsvps`.

## States / edge cases
- **Guest:** browse events; RSVP → gate (completes after sign-in).
- **Past events:** greyed/moved to "Past"; RSVP disabled.
- **Cancelled event (`status='cancelled'`, see `02`):** EVENT-DETAIL shows a "Cancelled by the organiser" banner, RSVP disabled, "See other events" CTA; all non-cancelled RSVPs are auto-notified on cancellation AND on time/venue changes (`17`); the member's RSVP list keeps the row with a cancelled state; deep links from old notifications land on the cancelled treatment, never "not found."
- **RSVP full/closed** (if capacity later): show "Full — join waitlist" or closed, not a dead button.
- **No image:** branded placeholder.
- **Timezone:** events store wall-clock + IANA zone (`starts_at_local` + `timezone`, see `02`), shown in the event's timezone with a clear label; global events show viewer-local + origin.
- **Offline:** cached list; RSVP queues/retries.
- **Calendar permission denied:** explain + link to settings; RSVP still recorded.

## Permissions
- Browse: guest. RSVP: member.

## Notifications
- Branch event posted → branch members (if `branch_updates` on). **Global event → all members** (if `ministry_announcements` on). Reminder before an RSVP'd event. Deep-link → `EVENT-DETAIL`.

## Acceptance criteria
- [ ] Events correctly separate branch vs ministry-wide, and both are reachable.
- [ ] RSVP gates for guests and records once per member per event.
- [ ] Add-to-calendar works on both platforms.
- [ ] Global events notify the whole family; branch events notify that branch.
- [ ] No dead RSVP states (past/closed/cancelled handled).
- [ ] Cancelling or rescheduling a published event notifies every non-cancelled RSVP.
