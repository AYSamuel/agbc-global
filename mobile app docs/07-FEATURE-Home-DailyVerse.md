# 07 · Feature: Home & Daily Verse

## Purpose
The daily landing surface. It answers "what's happening for *my* family today," gives one spiritual touchpoint (the verse), the next concrete step (next service / plan a visit), and quick routes into the rest of the app. Branch-aware and person-aware.

## User stories
- As a member, I open the app and see my branch, today's verse, my next service, and my rhythm.
- As a visitor, I see who this church is and how to take a next step.
- As anyone, I can jump to Watch, Give, or Academy in one tap.

## Screen: `HOME` (Tab 1)

Composition, top to bottom:
1. **Header**: greeting ("Good morning" / "Good morning, {name}" for members), **branch chip** (current branch → `BRANCH-SWITCH` sheet), **bell** → `NC` (unread dot).
2. **Daily Verse card**: reference + text (from `daily_verses` for today, user language; EN v1; **WEB translation**, public domain, so storing and share-imaging the text is licensing-clean). Gold accent. Action: **Read today's devotional** → entitled members with an active plan go to `PLAN-DAY`; everyone else goes to the devotional's `BOOK-DETAIL` ("Get the devotional"; devotionals are paid, see `10`/`14`). Never an empty PLAN. Share verse (OS/WhatsApp).
3. **Next service card**: for the current (browsed) branch: the next service is selected and any countdown computed from **`branch_services`** (the machine-readable schedule, see `02`); `service_times` strings are display-only. Address line, **"I'm here"** (attendance write, gate) and **Plan a visit** → `BRANCH-INFO`. If a service is imminent/live, show live/countdown treatment. **Zero `branch_services` rows** (new branch, schedule not entered yet): render the `service_times` display strings without countdown or "I'm here"; if those are empty too, "Service times coming soon" + Plan a visit; reminders and live detection skip such branches (same rule on `BRANCH-INFO`). **Midnight rollover:** date-anchored Home queries (daily verse, next service) key on the device-local date and invalidate at local midnight while foregrounded and on every foreground transition.
4. **Quick actions row** (4): **Plan a visit · Watch · Give · Academy**. (This mirrors the website's "Start with a hello" but app-personal.)
5. **Latest message**: most recent sermon (from `sermons`) → `SERMON`.
6. **Testimony highlight**: a recent approved testimony → `TESTIMONY-DETAIL`; **Glory to God** inline (gate). "See all" → `FAMILY`.
7. **(Member) Rhythm strip**: current streak + next milestone → `RHYTHM`. Grace-framed.
8. **(Guest) Join the family card**: soft prompt → `GATE`/`AUTH-1`.

## Branch context model (`BRANCH-SWITCH`): two distinct concepts, never conflated

1. **Browsing context (the chip):** view-only and session-persistent. Switching it changes what Home SHOWS: next service card, events, live channel. It does NOT change notifications, streak timezone, or the Family scope default.
2. **Home branch (the profile):** drives attendance timezone, service reminders, branch-tier notifications, and "My branch" scoping. Changed only via an explicit action.

- The `BRANCH-SWITCH` sheet lists branches AND (for members) offers a second, explicit action: **"Make this my home branch"** (writes `profiles.branch_id`). Browsing and moving home are visibly different operations.
- **"I'm here" while browsing another branch** records attendance AT the browsed branch (real visits happen: diaspora members travel); streaks count attendance at any branch (week = the ISO week of `service_date`, fixed at write time, `10`).
- The chip never changes the Family scope default (Family defaults to "Everywhere" per `09`; the user's manual scope choice persists).
- This is the multi-branch backbone on Home: nothing on Home assumes Glasgow.

## Daily Verse: behavior
- One verse per day (`daily_verses.date`), same for all users in a language.
- Source: seeded content set (admin-managed via dashboard; verse CRUD ships in dashboard Phase A, see `17`/`18`): **not** an external API dependency for v1. Translation: **WEB (World English Bible)**, public domain: no attribution requirement, no quotation caps, safe for branded share images (decision 2026-07-12; `translation` column exists if a licensed translation is added later, which would bring an attribution line onto `VerseCard` and share images).
- **Operations:** 365+ rows/year need an owner, a quarterly batch cadence, and a low-queue alert (fewer than 14 future days queued alerts admins). Pipeline in `22-CONTENT-OPERATIONS.md`.
- **Phasing:** until the Store/Library + entitlement pipeline ships (build Phase 4), the verse card renders WITHOUT the devotional CTA (verse + share only). The CTA appears when `BOOK-DETAIL` exists to route to (`18`).
- Caching: prefetch today's on open; cache last N for offline.
- Share renders a branded verse image/text.

## Data
- Reads: `branches` (current), `daily_verses` (today), `sermons` (latest), `testimonies` (1 highlight, approved), member `streaks`.
- Writes: attendance ("I'm here"), glory reaction (inline).

## States / edge cases
- **Guest:** greeting without name; rhythm strip replaced by Join card; "I'm here" and inline Glory → gate.
- **No verse for today:** fall back to most recent, or a static evergreen verse; never blank.
- **No sermons yet:** hide latest-message block or show "New messages coming soon" → Watch.
- **No testimonies yet:** hide highlight or show compose prompt.
- **Offline:** cached verse + service card (service times are static per branch) render; dynamic blocks show cached or skeleton→retry.
- **Service reminder timing:** if within X hours of service, elevate the next-service card.

## Permissions
- Browse: guest. Contribute (I'm here, inline Glory, plan progress): member (gate).

## Notifications touchpoints
- Bell → `NC`. Service reminders and ministry announcements deep-link into relevant Home/Event/Family screens (see `15`).

## Acceptance criteria
- [ ] Home reflects the **browsed branch** everywhere it should (times, events, live).
- [ ] Switching the browsing chip does NOT change notifications, streak timezone, or the Family scope default.
- [ ] Daily verse shows for the user's language (EN v1) and is shareable.
- [ ] Members see streak; guests see Join card; neither state is empty/broken.
- [ ] "I'm here" and inline Glory gate cleanly and complete after sign-in.
- [ ] Everything degrades gracefully offline.
