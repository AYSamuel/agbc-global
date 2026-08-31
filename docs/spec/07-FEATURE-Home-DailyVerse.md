# 07 · Feature: Home & Daily Verse

## Purpose
The daily landing surface. It answers "what's happening for *my* family today," gives the next concrete step (next service / plan a visit), shows a member their own rhythm, and offers one spiritual touchpoint (the verse) before handing off to the family. Branch-aware and person-aware.

## User stories
- As a member, I open the app and see my branch, my next service, my rhythm, and today's verse.
- As a visitor, I see who this church is and how to take a next step.
- As anyone, I can see what the family is testifying to and hear the latest message without hunting for them.

## Screen: `HOME` (Tab 1)

Composition, top to bottom:
1. **Header**: greeting ("Good morning" / "Good morning, {name}" for members), **branch chip** (current branch → `BRANCH-SWITCH` sheet), **bell** → `NC` (unread dot).
2. **Next service card**: for the current (browsed) branch: the next service is selected and any countdown computed from **`branch_services`** (the machine-readable schedule, see `02`); `service_times` strings are display-only. Address line, **"I'm here"** (attendance write, gate) and **Plan a visit** → `BRANCH-INFO`. If a service is imminent/live, show live/countdown treatment. **Zero `branch_services` rows** (new branch, schedule not entered yet): render the `service_times` display strings without countdown or "I'm here"; if those are empty too, "Service times coming soon" + Plan a visit; reminders and live detection skip such branches (same rule on `BRANCH-INFO`). **Midnight rollover:** date-anchored Home queries (daily verse, next service) key on the device-local date and invalidate at local midnight while foregrounded and on every foreground transition.
3. **(Member) Rhythm strip**: current streak + next milestone → `RHYTHM`. Grace-framed.
4. **Daily Verse card**: reference + text (from `daily_verses` for today, user language; EN v1; **WEB translation**, public domain, so storing and share-imaging the text is licensing-clean). Gold accent. Action: **Read today's devotional** → entitled members with an active plan go to `PLAN-DAY`; everyone else goes to the devotional's `BOOK-DETAIL` ("Get the devotional"; devotionals are paid, see `10`/`14`). Never an empty PLAN. Share verse (OS/WhatsApp).
5. **Testimony highlight**: a recent approved testimony → `TESTIMONY-DETAIL`; **Glory to God** inline (gate). "See all" → `FAMILY`.
6. **Latest message**: most recent sermon (from `sermons`) → `SERMON`.
7. **(Guest) Join the family card**: soft prompt → `GATE`/`AUTH-1`.

**Why this order** (decided 2026-08-11, mockup reworked in the same change). The service card leads because it is the only time-bound thing on the screen and it carries the primary action. The rhythm strip sits directly under it so that the consequence of tapping **"I'm here"** is visible without scrolling: the tap and the streak it feeds are one loop and must not be separated. The verse follows as the small daily reason to open the app on a weekday. **The testimony highlight sits above the latest message on purpose**: sermons already own a bottom-tab (`WATCH`), while testimonies live two levels deep under `FAMILY`, so Home surfaces the harder-to-reach thing first, and it is the wedge. Members and guests share one composition; the only differences are the rhythm strip (members) and the Join card (guests).

**There is no quick-actions tile row** (removed 2026-08-11; it previously sat between the service card and the verse with Plan a visit · Watch · Give · Academy). Every destination it held is reachable without it: Plan a visit is a button on the service card, Watch and Give are bottom tabs, and **Grace Academy** is the first row of the `MORE` hub. Do not reintroduce a shortcut grid on Home without a mockup frame and a decision recorded here.

## Branch context model (`BRANCH-SWITCH`): two distinct concepts, never conflated

1. **Browsing context (the chip):** view-only and session-persistent. Switching it changes what Home SHOWS: next service card, events, live channel. It does NOT change notifications, streak timezone, or the Family scope default.
2. **Home branch (the profile):** drives service reminders, branch-tier notifications, and "My branch" scoping. Changed only by REQUEST, approved by the branch being joined. It does NOT decide which day a check-in counts for: that is the timezone of the branch ATTENDED, applied once at write time (`10`, `02`, and the bullet below). This line said "attendance timezone" until W2.8 built the domain and made the difference real for a member who travels.

- The `BRANCH-SWITCH` sheet lists branches AND (for members) offers a second, explicit action: **"Make this my home branch"**. Browsing and moving home are visibly different operations, which is the whole point of the two-concept model.
- **That action does NOT write `profiles.branch_id`** (changed 2026-07-29, ADR 0015). It opens a request that the destination branch's leader approves, because moderation authority derives from this column and a self-writable one was a privilege-escalation hole. So the action leads to the same confirm sheet, pending state, refusal state and 90-day cooldown that `16` specifies, and this sheet is the SECOND entry point into that one flow, not a shortcut past it. Both entry points show the same state: a member with a request already open sees "awaiting confirmation" here too, not a fresh action.
- Browsing is untouched by any of this. The chip stays instant, guest-available and needs no approval, which is what makes it the right place to explore other branches while a move is pending.
- **"I'm here" while browsing another branch** records attendance AT the browsed branch (real visits happen: diaspora members travel); streaks count attendance at any branch (week = the ISO week of `service_date`, fixed at write time, `10`).
- The chip never changes the Family scope default (Family defaults to "Everywhere" per `09`; the user's manual scope choice persists).
- This is the multi-branch backbone on Home: nothing on Home assumes Glasgow.

## Daily Verse: behavior
- One verse per day (`daily_verses.date`), same for all users in a language.
- Source: seeded content set (admin-managed via dashboard; verse CRUD ships in dashboard Phase A, see `17`/`18`): **not** an external API dependency for v1. Translation: **WEB (World English Bible)**, public domain: no attribution requirement, no quotation caps, safe for branded share images (decision 2026-07-12; `translation` column exists if a licensed translation is added later, which would bring an attribution line onto `VerseCard` and share images).
- **The other three languages, decided 2026-08-31.** WEB is an ENGLISH translation, and this doc named it without saying what German, Dutch and French should use, while `daily_verses.language` has allowed all four since `20260720210000`. The gap surfaced the first time anyone actually queued a verse. Each language now uses a PUBLIC DOMAIN translation, chosen to preserve exactly the property WEB was chosen for, so no language brings an attribution line or a quotation cap:

  | Language | Translation | `translation` value |
  |---|---|---|
  | English | World English Bible | `WEB` |
  | German | Luther 1912 | `Luther 1912` |
  | Dutch | Statenvertaling | `Statenvertaling` |
  | French | Louis Segond 1910 | `Louis Segond 1910` |

  **The cost is accepted and worth restating, because somebody will raise it.** Luther 1912 and the Statenvertaling are archaic; the Dutch especially reads to a modern congregation roughly as Jacobean English does to us. The modern alternatives (NBG 1951, Elberfelder, Segond 21) are all copyrighted, so switching means an attribution line on the verse card AND on every share image, plus quotation limits. That is the trade this doc already made once for English; it is made the same way for the other three. Revisiting it is a licensing decision, not a technical one, and it changes this table.
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
