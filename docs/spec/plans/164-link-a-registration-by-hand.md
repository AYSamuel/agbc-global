# #164 · Link a website course registration to a member by hand

**SPEC, written 2026-08-30 from an interview with Ayo. THE BACKEND HAS LANDED; the screen
has not.** Delete this file when the screen lands, per the convention W3.1, W3.3, W3.4 and
W3.5 followed, and not before: everything below §The screen is still the brief.

---

## Status (2026-08-31)

**DONE, in migrations `20260831120000` and `20260831130000`:**

- `set_aside_at` / `set_aside_by`, nullable and additive, with `set_aside_at` granted to
  `authenticated` and `set_aside_by` withheld on the `linked_by` reasoning.
- `link_registration`, `unlink_registration`, `set_registration_aside` and
  `registration_match_suggestions`: all `security definer`, all checking
  `caller_is_admin_live()` inside, all granted to `authenticated` and revoked from `anon`.
- The notification, as a fourth `activity_notice_batch` arm exactly as §The notification
  asked, plus its `core.ts` mapping. `registration.confirmed` has a producer for the first
  time.
- Tests: pgTAP `052` (46 assertions), `051` +4 for the new arm, `039` +2 for the shared-table
  contract, `032`'s grant matrix corrected. Deno `core_test.ts` +3.

**Three things the build learned that this SPEC did not know:**

1. **Half of §The server routines already existed.** `registration_linked` was already in the
   `privileged_action` enum and `course_registrations_audit` already fired on EVERY change of
   `profile_id`, so link and unlink are audited by the existing trigger and neither routine
   writes an audit row. Only set-aside needed a new value and an explicit write, because it
   changes no owner and so fires no trigger.
2. **"Linking always writes `profile_emails`" cannot always hold**, and the SPEC did not say
   what to do when it cannot. Two existing constraints refuse: a global unique on the
   normalised address, and a guard against taking another account's sign-in address. The
   decision taken, and asserted in `052`, is to **refuse the whole link** rather than link
   without proving the address, because either collision means two people claim one mailbox,
   which is the mis-link decision 5 accepted the risk of. Linking quietly would hide it and
   leave an admin believing the auto-match had been taught.
3. **`039` guards the website's columns, not ours**, so what it gained was the two columns'
   NULLABILITY rather than their existence: a NOT NULL added here would refuse every live
   website registration while every test in this repo stayed green.

**OWED: the screen** (§The screen below, unchanged). The mockup frames come first and need
Ayo's approval before any screen code, including the EMPTY queue.

---

Refs: ADR [0017](../decisions/0017-one-course-registrations-table.md) (decisions 2, 4, 5 and
the 2026-08-11 amendment), ADR [0015](../decisions/0015-branch-is-assigned-not-chosen.md),
`13` (Academy), `17` (dashboard), `20` (minimum necessary), `02` §the two shared tables.

---

## Why this exists

ADR 0017 named three ways a website registration gets attached to a member: the automatic
email match, a self-service claim, and a leader linking the row by hand. **The self-service
claim was cut on 2026-08-11** and its backend removed with it.

So today somebody who paid on the website with one address and signed into the app with
another has **no path at all**. The app shows them as unregistered, and the double-booking
wall cannot save them because it keys on `(course_id, profile_id)` and their row has no
`profile_id`. **They can pay twice for the same course.**

The interim is a leader reading a stranger's payment record in Supabase Studio and setting a
column by hand. This replaces that.

**No research gate.** The need is a documented hole in a decision record with a concrete
failure, not a product guess, so `25`'s research gate is satisfied by ADR 0017's amendment
rather than by interviews.

---

## Decisions taken with Ayo (2026-08-30)

1. **Suggested matches, admin confirms.** The screen offers likely members and the admin
   picks; free search is the fallback. Accepted risk, stated so it is designed against: a
   confident-looking wrong suggestion is easier to accept than a wrong name somebody typed
   themselves, so every suggestion must show WHY it was suggested (see §Suggestions).
2. **Unlink exists, admin-only, audited.** A wrong link returns the row to the unlinked
   queue. Without it the error case leaves you exactly where this issue started: somebody in
   a SQL client. Costs a second routine and its tests, and is worth it.
3. **The member is told**, by push plus a notification-centre row. This is why the work is
   worth more than it looks: **`registration.confirmed` is the fourth orphaned template the
   W3.6 audit found**, existing in four languages with channel routing and never once
   produced. This gives it its producer and closes that launch-checklist item.
4. **A never-matchable row can be set aside** as "no app account", reversibly. A queue that
   only grows is a queue people stop reading, and then a real one is missed among the
   permanent residents.
5. **Linking always writes `profile_emails`.** The member stops hitting this problem for
   good, which is what they contacted the church about. **The risk is real and accepted:** an
   admin link is a JUDGEMENT, not proof of address ownership, so a shared or mistyped address
   quietly becomes a permanent auto-match rule and a future payment could attach to the wrong
   member with no human in the loop. Decision 2's unlink is the mitigation, but only after
   somebody notices. See §Open risks.
6. **Suggestions rank on name similarity, then same branch.** Explainable to the admin and
   uses what both records actually carry.
7. **The screen shows name, email, course and date. NOT the amount.** `20`'s minimum
   necessary: the figure is irrelevant to deciding who somebody is, and a payment amount on
   screen is a thing to leak over a shoulder or in a screenshot.
8. **It lives in a new Academy area of the dashboard** (Claude's call, unopposed): there is
   no courses module today, and burying a payment-record surface inside People would misfile
   it.

---

## Data model

### One new pair of columns, additive and nullable

**`course_registrations` is SHARED with the live website** (`02`, `039`). The contract
forbids dropping, renaming, retyping or NOT NULL-ing any of the website's columns; it does
not forbid adding nullable ones, which is exactly how the app's existing additions landed.
Keep it that way.

```
set_aside_at   timestamptz
set_aside_by   uuid references public.profiles (id) on delete set null
```

**Do NOT reuse `status` for this.** Its own comment draws the line this decision sits on:
`status` is an enrolment decision ("you have a place"), the link trio is an identity one
("this row is yours"). "No app account" is an identity statement, so it needs its own column
or it corrupts a distinction ADR 0017 made deliberately.

`039`'s contract test gains the two columns so the next reader sees them as a decision.

### Nothing else changes

`profile_id`, the link trio and `profile_emails` all already exist and are already
server-written. The `link_method` enum already carries `'leader'`, which is this path.

---

## The server routines

Three, all `security definer`, all granted to `authenticated` and **all checking
`caller_is_admin_live()` themselves**. Never a direct client write: `profile_id` and the trio
are server-written by ADR 0015's rule that a column an authorization check reads must not be
writable by its subject.

| Routine | Does |
|---|---|
| `link_registration(registration, member)` | Sets `profile_id`, `linked_by = auth.uid()`, `linked_at = now()`, `link_method = 'leader'`; upserts `profile_emails` for the row's email (normalised lower/trim); refuses if the row is already linked, or set aside, or if the member is deleted |
| `unlink_registration(registration)` | Clears `profile_id` and the trio, returning the row to the queue. Does NOT remove the `profile_emails` row it wrote: see §Open risks |
| `set_registration_aside(registration, aside boolean)` | Sets or clears `set_aside_at` / `set_aside_by`. Refuses on a linked row |

**Audited by trigger, not by the caller.** `privileged_actions` already works this way and
the rule is explicit: a caller that has to remember to write the audit row is a caller that
will forget. All three are privileged acts on somebody's payment record and all three are
audited.

**Idempotency:** linking an already-linked row raises rather than silently re-links, so a
double-submit cannot quietly move a registration between members.

---

## Authorization and what may be seen

- **Admins only, everywhere.** ADR 0017 decision 5, and the reason is structural rather than
  a preference: an unlinked website row carries no `branch_id`, so "leaders read in-branch"
  has no answer for it. There is no correct branch leader for a stranger's payment record.
- The `branch` TEXT column on the row is a website display name and is **never** used for
  scoping. It may be shown, and it may inform suggestion ranking. It may not gate anything.
- pgTAP must cover **an admin linking a row to a member who is not its match**, not merely
  reading one. Reading is the easy half; the write is where the damage is.
- A leader and a member must both be refused by every one of the three routines, asserted
  separately rather than assumed from a shared helper.

---

## Suggestions

For each unlinked registration, offer at most a handful of members, ranked:

1. **Name similarity** between the row's `full_name` and `profiles.display_name`. Postgres
   `pg_trgm` similarity is the obvious tool and is already available; if it is not enabled,
   enabling it is part of this work.
2. **Same branch first**, comparing the row's `branch` display name to the member's branch
   name. A tie on name is broken by the branch matching.

**Every suggestion states its reason on screen** ("similar name", "similar name, same
branch"). Decision 1's accepted risk is that a confident suggestion gets accepted without
thought; showing the reason is what makes the admin able to disagree with it.

**Exact email is not a suggestion.** That case is already auto-matched before a human sees
it, so a suggestion is inexact by definition and must never be presented as certainty.

---

## The screen

A new **Academy** area, one route: unlinked registrations.

- **Default view:** unlinked, not set aside, newest first.
- **Filters:** set aside, and linked (read-only history, so an admin can find a row to
  unlink).
- **Each row shows:** full name, email, course, registration date, branch display name.
  **Never the amount** (decision 7).
- **Linking:** suggestions with their reasons, plus a member search by name or email.
  Confirm before writing, naming both sides of the link in the confirmation.
- **Unlinking:** on a linked row, behind a typed confirm, since it detaches somebody from a
  course they paid for.
- **Set aside:** one action with an undo, and set-aside rows stay reachable under their
  filter.
- Copy in `src/copy/en.ts`, not i18next: the dashboard is a staff tool. Type sizes in rem
  from the shared scale; colours and radii from `cssVariables.ts`. No hex.

### The mockup comes FIRST

There is no frame for any of this. Per the standing rule, **compose the frames and get Ayo's
approval before writing a line of the screen**, and never build from this prose. Frames
needed: the queue (populated), its EMPTY state, the link flow with suggestions, the confirm,
and the set-aside state. A surface is a state, not a screen: the empty queue is the one an
admin sees most weeks and needs a frame of its own.

---

## The notification

Linking produces `registration.confirmed` for the member, which **nothing has ever
produced**.

- Type `registration`, channel `transactional` (no pref key: it answers something the member
  did). Both already exist in `_shared/pushChannels.ts`.
- Template `registration.confirmed`, already written in four languages.
- Deep link `/course/<course_id>`, which is already on the app's allowlist as a dynamic
  prefix.
- **Produced by the `activity-notices` job**, as a fourth arm, not by the routine writing a
  notification row itself. Every reason from W3.6 slice 2 applies unchanged: ADR 0016 (a
  trigger-fired call is silence when it fails), `21` §5 (derive from live state, never an
  outbox), ADR 0022 (the insert is the claim on a send). Due = a registration linked since
  the lookback with no notification for its dedupe key.
- Dedupe key `registration:<registration_id>:<linked_at>`, so a relink after an unlink
  correctly tells the member again.
- **Unlinking sends nothing.** There is no kind way to say "that course is not yours after
  all" in a push, and the admin who unlinked knows why and can reach the member.

---

## Tests

- **pgTAP** for the three routines: the happy path; refusal for a leader, a member and a
  guest, each asserted separately; linking an already-linked row refused; setting aside a
  linked row refused; the `profile_emails` upsert; the audit rows; and the case the issue
  names, **an admin linking a row to a member it does not match**, which must succeed because
  the admin is the judge, and must be audited.
- **Assert what CHANGED, not that nothing errored.** An UPDATE a caller is not entitled to
  make is filtered by RLS silently, so a refusal test that only checks for an exception
  proves nothing.
- **Vitest** for the dashboard: the queue's four states, suggestion ordering and its stated
  reasons, the confirm, and axe on every new surface.
- **`deno test`** for the new `activity-notices` arm's entry building.
- Fixture-scoped counts only (#184).

---

## Open risks, carried deliberately

1. **`profile_emails` turns a judgement into a rule** (decision 5). A wrong link teaches the
   auto-match to repeat itself. `unlink_registration` deliberately does NOT remove the
   `profile_emails` row, because the address may have been proven by another route since;
   removing it is a separate admin act and is **not in this scope**. If mis-matching ever
   happens in practice, that is the first thing to build.
2. **Name similarity across a diaspora church** will tie often. The branch tiebreak helps and
   will not always be enough; the admin is the backstop, which is why the reason is shown.
3. **Set aside is a judgement about a stranger** made from four fields. It is reversible and
   audited, which is the whole mitigation.

---

## Not in scope

- Removing a `profile_emails` row (risk 1).
- Any member-facing claim flow: cut on 2026-08-11 and not coming back.
- Bulk linking. If the queue ever justifies it, it justifies a rethink first.
- `purchase.added`, the other orphaned template. That is W4.1's, since Store does not exist.

---

## Where this sits in the build flow

**This is Phase 4 work.** `25`'s flow wants Phase 3 to exit before Phase 4 begins, and Phase
3 has one clause left (the audio field test, W3.6 slice 4). Writing the SPEC now costs
nothing and blocks nothing; **building it before Phase 3 exits would break the flow**, and
that is Ayo's call rather than an accident to drift into.

It belongs in `25` as an item under Phase 4, nearest to W4.4's dashboard Phase C work, and
should be added there when it is scheduled rather than now.
