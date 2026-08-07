# Phase 2 completion · what is left, and the order to build it

Written 2026-08-05, the day W2.5 merged (PR #139). Behavioral truth stays in the numbered
specs; the execution flow stays in `25-BUILD-PROCESS.md`. This doc carries the things that
otherwise live only in a session: what is genuinely left, what each item costs, the traps
the last five items paid for, and the order I would build them in. **Delete once W2.10
lands and Phase 2 exits.**

## Where the phase stands

Six of ten work items are done end to end (W2.1 auth, W2.2 gate + gate-return, W2.3
compose + consent, W2.4 reactions + the offline queue, W2.5 the answered-prayer loop, W2.6
MY-POSTS + report + block), plus four of W2.7's five slices. The wedge is live: a member
signs in, posts, reacts, commits to pray, marks answered, testifies, reports and blocks,
and a leader moderates all of it from the dashboard.

Two of the three Phase 2 exit criteria in `18` are already true and device-proven (members
can contribute; the Family loop works end to end). The third, "nothing publishes without
approval", is enforced and asserted in pgTAP; W2.10 re-attempts the bypasses through the
app one last time.

## What is left

### 1. W2.7 slice 5 (#133) · the jobs nobody has written yet · **DONE 2026-08-06**

The last slice of the dashboard's Phase A, and with it Phase A itself. What landed: the
hourly moderation digest, the 48h escalation to admins, the daily verse-queue monitor, and
the scheduling pattern the three items below inherit (pg_cron -> `jobs.invoke_edge_function`
-> pg_net -> edge function, values from the vault, one lease per job, dead-man ping;
ADR 0016, `21` §5 corrected in the same PR). The findings are in
`W2.7-dashboard-phase-a.md` under "What slice 5 turned up"; the two worth carrying forward
are that a lease must be released rather than left to expire, and that `02`'s
`notifications` table cannot be built as specced (partitioning versus its unique keys),
which W3.3 now has to settle deliberately.

Three things, none of them built: leader notifications when items enter the queue, the
**48h escalation to admins**, and the verse-queue alert job. `grep "cron.schedule"` over
`supabase/migrations` returns nothing, so there is no scheduling of any kind in the
project yet: this slice establishes that pattern for W2.8's streak safety net, W3.4's
whole reminder family, and Track P's nightly dump.

Why first: until the escalation exists, a quiet leader can leave a branch's queue sitting
for days and the feed looks dead to that branch, which is exactly what `09` §Freshness
safeguard forbids. W2.6 shipped reporting to members, so the volume is real now.

Notes for whoever picks it up:

- **`#133`'s STATUS block is stale.** It says slice 4 "landed only HALF: daily verses
  shipped, the REPORTS INBOX did not". The reports inbox landed the same day in PR #137.
  Only slice 5 remains. Fix the issue before working from it.
- Delivery is in-app + email until push lands in W3.3 (`25` W2.7). Do not build a push
  path here.
- Prefer **pg_cron / Supabase cron over GitHub Actions**, per the CI budget rule in
  `CLAUDE.md`: Actions minutes are a shared pool across all of Ayo's private repos and
  workflows must cost zero when idle.
- Every scheduled job ends with a healthchecks.io ping (`25` §3.5). The helper already
  exists at `supabase/functions/_shared/healthchecks.ts`, used by `youtube-sync` and
  `live-detection`.
- Jobs must be idempotent and safe to re-run; assert that in tests rather than assuming it.

### 2. W2.8 (#134) · Member Home + Rhythm · **backend landed 2026-08-07, screens next**

Its own plan doc now: `W2.8-member-home-and-rhythm.md`, which carries the contract the screens
draw from, the two decisions taken (grace covers one missed week; content milestones are
awarded on approval), and the frame gate that blocks two of the four remaining surfaces.

**The biggest remaining slice, and the only one with a new domain and real maths.** Budget
more than one session.

Backend: attendance, streaks and milestones migrations; the `client_taken_at` clamp
trigger (a device clock must not be able to backdate attendance); the streak recompute
trigger plus a weekly cron safety net; milestone inserts. pgTAP has to cover backdating
refusal, `service_date` derivation, and the ISO-week maths including the DST cases.

Frontend: member Home (named greeting, streak strip, inline Glory), "I'm here" on the
next-service card with its idempotent second tap and visiting-branch semantics, the
RHYTHM screen, the milestone celebration overlay with a reduced-motion variant, and the
in-context notification pre-permission sheet on the first "I'm here" or RSVP (`06`).

Traps this one is walking into:

- **Timezone and DST are the whole risk.** Branches span Glasgow, Berlin, Emmen and
  Ogbomosho. `25` calls for the DST matrix in unit tests specifically because a streak
  that breaks on the clock change is a streak that shames somebody for nothing.
- Grace-framed copy matters more here than anywhere else in the app (`CLAUDE.md`): streaks
  encourage, never shame.
- Live-watch attendance credit is **deferred to W3.2**; note it and move on.

### 3. W2.9 (#135) · RSVP + Academy + profile

Backend: courses, `course_fees_regional`, `course_registrations`, `course_interest` with
RLS and pgTAP (cancel-only transition, the partial unique), plus the seed conversion
script that turns symbol majors into minor units + ISO currency with the NG overrides.

Frontend: RSVP on EVENT-DETAIL (going / interested / cancel, gate, add-to-calendar via
expo-calendar, share); the Academy pathway, COURSE, REGISTER, REGISTER-CONFIRM,
already-registered and cancel, upcoming → "Notify me"; profile edit (name, avatar upload).

**Home branch is NOT edited here** (ADR 0015). It moved into W2.7's people slice as a
request-and-approve flow, which has shipped, so this screen only links to it.

### 4. W2.10 (#136) · analytics, crash reporting, and the exit

PostHog EU (anonymous/cookieless or opt-in per `20`), the ~20 v1 events with standard
properties from `22` §5, Sentry across app + dashboard + edge with PII scrubbing. Then the
exit audit itself: the Family loop E2E on both platforms, one more attempt at the publish
bypasses through the app, and the Maestro journeys extended (OTP sign-in, post → pending,
Glory gate-return, RSVP, block).

Launch week is the only chance to baseline the wedge (`18`), so the event list is not
polish and should not be trimmed under time pressure.

## The other clock: Track P

Track P does not gate the Phase 2 exit, but it gates anything real reaching a phone.

- **P1** (nightly off-provider dump + one verified restore) is a HARD precondition for any
  destructive step on prod, and it has not started. It is the long pole.
- **P2** (audit the shared project) is done: `19` steps 1-2, the fenced inventory is in
  `CLAUDE.md` and the runbook is `docs/runbooks/prod-audit-2026-07-30.md`.
- **P6** (Supabase Pro) must land before the first prod-pointed TestFlight build.

If TestFlight is anywhere on the horizon, P1 should be interleaved rather than saved for
later.

## Recommended order

1. ~~**W2.7 slice 5.**~~ Landed 2026-08-06. The scheduling pattern the next items borrow is
   now in the repo: a new job is a migration registering `cron.schedule` plus an edge
   function that takes its lease and pings its check.
2. **W2.8.** Fresh session, new domain, budget for the date maths. Its weekly streak-recompute
   safety net is a schedule on the existing mechanism, not new infrastructure.
3. **W2.9.** Mostly a known shape by then.
4. **W2.10.** Instrumentation first, then the audit, then the phase exits.

Fresh session per item, per `CLAUDE.md`'s context rule. Each one starts the same way:
derive position from git history plus the board, read the item's Refs, read the matching
`~/.claude/standards/` file if it is the first session in that domain, and read the mockup
frames first-hand before writing any screen.

## What the last five items cost, and what not to repeat

These are the lessons that were paid for in defects, not the ones from a checklist. The
project conventions in `CLAUDE.md` carry most of them; these are the ones most likely to
bite the four items above.

- **"The backend for this landed already" is a claim about tables and policies.** A screen
  also needs a READ PATH for every value it draws. W2.6 found this twice, W2.5 once. Check
  the read path before believing an item is front-end only.
- **When several rules govern one relationship, they must be scoped the same way.** W2.5's
  device defect: three rules counted only live rows and a UNIQUE constraint counted every
  row ever written, so an author who deleted their testimony was offered the chance to
  write another and then refused by a constraint pointing at a row that no longer exists
  anywhere in the product. Invisible to 510 green tests.
- **The device pass is where the valuable defects live.** W2.6 found two, W2.5 found one,
  and none of them were visible to a passing suite. Drive the matrix over adb rather than
  handing Ayo a checklist.
- **One visible fact, one owner.** Deriving a displayed value from two stores that update
  independently is the bug. W2.4 lost four device-only bugs to it.
- **react-query per-call `mutate` callbacks are dropped when the observer unmounts.** If
  the row disappears or the screen changes branch on success, use `mutateAsync().then()`.
- **Mockup-first, first-hand.** Read the frame's HTML and CSS in the build session. If a
  surface has no frame, compose it from existing classes and get Ayo's approval BEFORE
  building. W1.1, W1.5 and W1.6 all drifted by working from summaries.
- **`pnpm db:reset` mid-session takes the signed-in device account with it**, and the app
  silently degrades to guest once the access token expires, which looks exactly like a bug
  in the code you just wrote. Do not hand-insert `auth.users` rows to repair it: the row
  satisfies Postgres and RLS, and GoTrue then fails every OTP for that address while the
  app reports "You're offline."

## Open follow-ups, unclaimed

Small, real, and not attached to any of the four items above:

- `PostPendingStep.tsx` owes the frame's "View my posts" link. Its own comment says it
  returns with W2.6, which shipped. W2.3's surface, wants its own frame diff.
- Three components now draw the mockup's `.success` (`SuccessScreen`, `PostPendingStep`,
  `MarkAnsweredStep`), differing in disc, glyph, button variant and whether a secondary
  link follows. Worth one shared layout; touches AUTH-4 and POST-PENDING.
- 17 stale local branches from merged items, plus `origin/feat/w2-5-answered-prayer-loop`,
  which GitHub did not auto-delete.
