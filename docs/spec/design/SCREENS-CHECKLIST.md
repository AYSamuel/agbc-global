# Screens Build Checklist

Every screen the app needs, from `04-NAVIGATION-MAP.md`. No screen is left out. Build order is by feature batch. Base pass is **light + phone** (the canonical design); the **matrix pass** adds dark + tablet for each once the light set is approved.

Status keys: `[ ]` not started · `[~]` in progress · `[x]` light-phone done · `[D]` dark done · `[T]` tablet done.

## Batch A: Entry & Onboarding
- [x] SPLASH
- [x] ONB-1 Welcome
- [x] ONB-2 Pick branch
- [x] ONB-3 Language
- [x] HOME (guest)
- [ ] HOME (member: adds rhythm strip, named greeting)
- [ ] BRANCH-SWITCH (bottom sheet)

## Batch B: Auth cluster
- [x] GATE (bottom sheet)
- [x] AUTH-1 Phone entry
- [x] AUTH-2 OTP verify
- [x] AUTH-3 Profile setup (first time)
- [x] AUTH-4 Success / return

## Batch C: Watch
- [x] WATCH (featured, live state, rails, search entry)
- [x] SERMON (player: video/audio, resume, notes, save, share)
- [x] LIVE (live player + watching-now count)
- [x] WATCH-SEARCH
- [x] MY-LIST
- [x] SERMON-NOTES

## Batch D: Family (the wedge)
- [x] FAMILY / Testimonies (default, scope toggle)
- [x] FAMILY / Prayer
- [x] FAMILY / Map
- [x] TESTIMONY-DETAIL
- [x] TESTIMONY-COMPOSE
- [x] CONSENT
- [x] POST-PENDING (confirmation)
- [x] PRAYER-DETAIL
- [x] PRAYER-COMPOSE
- [x] MARK-ANSWERED
- [x] POST-ACTIONS (own post: edit/delete sheet)
- [x] REPORT / Block (other post)

## Batch E: Give
- [ ] GIVE (explainer + methods)
- [ ] GIVE-BANK (copyable account fields)

## Batch F: More hub + Church
- [ ] MORE (menu hub)
- [ ] PROFILE (member) + Profile guest empty state
- [ ] BRANCHES (list)
- [ ] BRANCH-INFO (one branch)
- [ ] ABOUT
- [ ] CONTACT (form)
- [ ] LEADER-HOME (role-gated)

## Batch G: Events & Academy
- [ ] EVENTS (list)
- [ ] EVENT-DETAIL (RSVP, add to calendar, share)
- [ ] ACADEMY (courses)
- [ ] COURSE (detail)
- [ ] REGISTER
- [ ] REGISTER-CONFIRM

## Batch H: Store & Reading
- [ ] STORE (bookstore)
- [ ] BOOK-DETAIL (buy / owned)
- [ ] LIBRARY (owned books)
- [ ] READER (resume location)
- [ ] PLAN (devotional plan)
- [ ] PLAN-DAY (mark complete)

## Batch I: Rhythm & Notifications
- [ ] RHYTHM (streak, milestones, attendance history)
- [ ] NC (notification center)
- [ ] MY-POSTS (own posts, with pending badges)

## Batch J: Settings
- [ ] SETTINGS
- [ ] NOTIF-PREFS
- [ ] PRIVACY
- [ ] DELETE (delete account)

## Cross-cutting states
- [x] Empty states (generic feed, empty Library, empty NC, search no-results, guest profile)
- [x] Loading state (skeleton example)
- [x] Error + offline retry states (generic, plus Family offline cached feed)

## Edge / in-screen states (HTML edge-states pass, 2026-07-18)
- [x] Prayer two-step: "I will pray" / "I prayed" / "Prayed", with praying + prayed counts (feed + both detail views)
- [x] COURSE already-registered (pending + Cancel) and upcoming (Notify me)
- [x] NOTIF-PREFS push disabled (OS banner)
- [x] MY-POSTS Removed (terminal, contact-leader) alongside In-review / Needs-changes
- [x] LIVE starting-soon (countdown) and ended (replay)
- [x] Anonymous prayer ("A member") shown in the Prayer feed

## Matrix pass (after light set approved)
- [ ] Dark variants for all screens
- [ ] Tablet layouts for list-heavy tabs (Watch, Family, Events, Store) + Home width cap + landscape player/reader
