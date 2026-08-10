# 0017 · One course registrations table, shared by the app and the website

- Status: accepted
- Date: 2026-08-09
- Spec: `docs/spec/02-DATA-MODEL.md` §`courses` / `course_registrations` / `course_interest`, `13-FEATURE-Academy.md`, `19-PROD-MIGRATION.md`
- Amends: the fence on `public.course_registrations` recorded in `CLAUDE.md` and `docs/runbooks/prod-audit-2026-07-30.md` (2026-07-30)

## Context

W2.9 slice 2 builds the Academy domain. `02` and `13` both name the app's table
`public.course_registrations`, which is the exact name of a table fenced on 2026-07-30
because the LIVE website writes it. A fenced object may not be referenced by any
migration, so the slice could not start without resolving the collision.

The first reading was that these are two entities sharing a noun, and that the app
should simply take a different name. Reading the website's real schema
(`Desktop/agbc/src/lib/server/database.types.ts`) rather than the fence inventory
changed that.

| Website column | What the app's spec wanted |
|---|---|
| `course` (text slug) | `course_id` FK |
| `format` (text) | `format` enum(`in_person`\|`online`) |
| `branch` (text, null) | `branch_id` FK, null |
| `amount`, `currency` | minor units + ISO currency |
| `full_name`, `email`, `city`, `country` | not stored again; prefilled from `profiles` |
| `payment_status`, `stripe_session_id` | (no equivalent) |
| | `profile_id` FK, `status`, `notes` |

Four facts decided it.

1. **The overlap is the entity, not the name.** Format, branch, amount, currency and
   course are on both sides already. What differs is how the registrant is identified:
   guest details plus a Stripe session, or a `profile_id`. That is guest checkout versus
   account checkout, which is one entity with two front doors, not two entities.

2. **The website writes from a trusted server, not a device.** `src/lib/server/`
   holds its Supabase client, it uses the service key, and the row is written after a
   Stripe Checkout session completes (`src/lib/services/registration-map.ts`). RLS exists
   to govern what reaches devices. Adding policies for `authenticated` therefore leaves
   the website's path completely untouched, because the service key bypasses RLS. No
   sign-in needs to be added to a public course form.

3. **The money already matches.** `amount` is `session.amount_total`, which is Stripe's
   minor units, and `currency` is a lowercase ISO code. That is precisely the shape `02`
   asks the seed conversion script to produce, so the two are not even converging: they
   already agree.

4. **Separate tables cannot deliver the feature.** A member who registers on the website
   and then opens the app would be shown as unregistered, and could register and pay a
   second time for the same fee-bearing course. Nothing on the app's side fixes that
   without reading the website's rows, so any solution pays the fence cost anyway.

## Decision

One table, `public.course_registrations`, serving both platforms.

1. **The app's migration builds the merged shape**, adding to what the website has:
   `profile_id` FK null, `status` enum(`pending`|`confirmed`|`cancelled`), `notes`,
   `source` enum(`app`|`website`|`import`), nullable `course_id` / `branch_id` FK
   columns ALONGSIDE the existing `course` / `branch` text rather than replacing them,
   and the link trio `linked_by` FK null, `linked_at` null,
   `link_method` enum(`handoff`|`email_auto`|`self`|`leader`) null.
   Additive only: every column the website writes today keeps its name, type and meaning,
   and a registration made with no knowledge of any of this still lands exactly as it
   does now.

2. **Identity linkage happens three ways, because one is not enough.**

   The first is **the verified email**, which costs nothing and is instant. A member sees
   a registration when `profile_id = auth.uid()` OR when the row's email matches their
   own. Sign-in is email OTP (ADR 0011), so controlling that mailbox is proven rather
   than claimed. The address is read from `auth.users` through a `security definer`
   function and never from `auth.jwt() ->> 'email'`, the same rule that gives us
   `caller_is_admin_live()` instead of `is_admin()`. Both sides are compared as
   `lower(trim(...))`, because a stray capital would silently break the match and present
   as "the app forgot my registration".

   The second is **the member claiming a second address themselves**, which is the one
   that needs nobody. Someone who paid on the website with a different email adds that
   address in the app and proves it with a code sent to it. Nothing is linked until the
   code is entered, so the proof is the same proof sign-in uses: control of the mailbox.
   This is the primary answer for the different-address case, because it is immediate,
   it exposes nobody's data to anybody, and it scales without a human in the loop.

   The third is **an admin linking the row by hand on the dashboard**, for the people who
   will not or cannot do it themselves. It stays because self-service never reaches
   everybody, and because a leader running a course needs a way to fix a stubborn case.

   Without any of them, somebody who used one address at checkout and another in the app
   is invisible to themselves and can pay twice for the same course. That is not an edge
   case, it is ordinary human behaviour.

   Confirming and linking are different acts and stay separate: `status` is an enrolment
   decision ("you have a place"), the link trio is an identity one ("this row is yours").

3. **A claimed address is stored, not just spent.** `profile_emails` holds the addresses
   a member has proven, so the email match reads a SET of addresses rather than the one
   on `auth.users`. Claim once and every later website registration by that address links
   itself; spend the proof on a single row instead and the same person is back to
   "not registered" the next time they book a course, which for a discipleship pathway
   with several courses is the normal case rather than the rare one.

   The flow is an edge function, not Supabase's own auth: `signInWithOtp` on the second
   address would sign them in AS that address and `updateUser({ email })` would REPLACE
   their login, and neither is what "also mine" means. The pieces already exist:
   `_shared/email.ts` sends through Resend (as `contact-form` and `moderation-alerts` do)
   and `_shared/rateLimit.ts` bounds it (as `contact-form`, `photo-guard` and
   `review-signin` do). Codes are hashed at rest, single use, short lived, and rate
   limited per caller and per target address so this cannot become a way to post mail to
   strangers or to brute-force a code.

   Two refusals matter more than the happy path. An address that already belongs to a
   different auth user is REFUSED, with "sign in with that address instead", because
   linking it would let one account absorb another's identity. And the response before
   verification never reveals whether an address has registrations, or the flow becomes a
   way to ask the database who has bought what.

4. **`profile_id` and the link trio are server-written only.** A policy that READS
   `profile_id` to decide who may see a row makes that column part of the security
   boundary, so its subject must not be able to write it (ADR 0015). Otherwise any member
   can point a stranger's registration at their own account and read that person's name,
   email, city, country and what they paid. The member-facing policies grant no write on
   those columns at all; the admin's link goes through a `security definer` routine, and
   that routine writes `privileged_actions` **by trigger** rather than by remembering to.
   The pgTAP matrix must include a member attempting to claim a registration that is not
   theirs, not merely a member reading one that is.

5. **An unlinked website registration is visible to ADMINS ONLY** (Ayo, 2026-08-09).
   Guest rows carry no `branch_id`, so "leaders read in-branch" has no answer for them and
   would otherwise be settled by whatever the policy happened to do. A branch leader
   therefore cannot see a stranger's purchase; once the row is linked to a member, or
   given a branch, it falls under the normal in-branch rule from `02`. The website's
   free-text `branch` column is deliberately NOT used for scoping, because it is not
   trustworthy enough to gate access to somebody's payment record.

6. **Registration happens on the website, and the app never writes a registration.**
   Courses are delivered on a third platform; the website and the app only take sign-ups,
   and every course is paid (Ayo, 2026-08-09). Payment therefore stays external, which for
   a real-world service booked off-platform is required rather than merely allowed, so no
   Apple IAP question arises at all. The app shows the course and its regional fee, then
   opens the website's own registration page in an in-app browser exactly as `12` does for
   giving. One form, one payment, one row, nothing to reconcile.

   `course_registrations` is therefore **read-only to members in the app**: no member
   INSERT policy on it, which also keeps the number of write paths onto a table holding
   payment data at one. `course_interest` is the exception and stays a member write, since
   "notify me when this opens" is free and has no web equivalent.

7. **The handoff carries identity, so an app-started registration is born linked.**
   Tapping Register mints a short-lived, single-use token bound to (profile, course),
   stored hashed, and opens the website with it. The website resolves it server-side with
   the Supabase client it already has, prefills the form, and writes `profile_id` on the
   row along with `source = 'app'` and `link_method = 'handoff'`.

   The token is opaque and carries no personal data, because a query string ends up in
   browser history and server logs; `profile_id` is never passed in the URL and never
   trusted from the client. Single use and short lived so a shared link is not a way into
   somebody's identity, and bound to one course so it cannot be replayed against another.

   This is the difference between matching people up afterwards and never having to.
   Email matching, self-claim and the admin link all remain, but they now only serve
   people who started on the WEBSITE independently, which is what they were designed for.

8. **The website does change, and only additively.** Nothing it writes today changes shape
   or meaning, and a registration arriving with no token behaves exactly as it does now.
   This supersedes the earlier draft of this ADR, which promised the website would not
   change at all; that promise was made before it was clear the app would never own the
   registration form.

   The work in `Desktop/agbc`, recorded here because it belongs to no app work item and
   would otherwise survive only in a conversation:

   1. **Read and resolve the token.** The registration page takes it from the URL and
      resolves it server-side with the Supabase client already in `src/lib/server/`.
      Never trust a `profile_id` supplied by the caller; the token is the only input.
   2. **Carry it through Stripe.** This is the step that is easy to miss and expensive to
      discover: the row is not written at checkout, it is written when the session
      completes. So the resolved `profile_id` must ride in the Checkout Session
      **metadata** and be read back out in `src/lib/services/registration-map.ts`, which
      already reads `session.metadata`. A token resolved and then dropped at the checkout
      boundary produces an unlinked row and looks exactly like success.
   3. **Prefill** name and email from the resolved profile, so the form is a confirmation
      rather than a retyping.
   4. **Set `profile_id`, `source = 'app'` and `link_method = 'handoff'`** on the insert.
   5. **Regenerate `src/lib/server/database.types.ts`**, which is the website's own copy
      and will not update itself when the app's migration adds columns.

   **Sequencing.** The website talks to PRODUCTION, so it cannot write `profile_id` until
   prod's table has the column. The chain is Track P P1, then the prod `ALTER` in `19`,
   then this deploy. Until it completes the app simply hands off without a token and the
   email match does the linking, so nothing is broken meanwhile; the handoff only makes it
   exact. Worth knowing that this puts P1 on the critical path for a member-visible
   feature and not only for the prod cleanup.

9. **Invariants live in constraints and triggers, never in policies alone.** The service
   key bypasses RLS but not constraints and not triggers, so the partial unique
   `(course_id, profile_id) where status <> 'cancelled'` and the cancel-only status
   transition hold for every writer. A rule expressed only as a policy would apply to the
   app and quietly not to the website.

10. **The fence is lowered for this one table, deliberately.** The CI fence-guard is
   updated to permit `course_registrations`; `donations` stays fenced exactly as it is.
   Lowering it is a recorded decision here rather than an exception argued in a PR.

11. **Prod convergence waits for Track P.** Local and dev get the full shape now, which is
   safe because the traffic fence means no app build points at prod. The prod `ALTER`
   belongs to `19`, behind P1 (the nightly off-provider dump plus one verified restore),
   like every other destructive-capable step. It reconciles four rows.

## Consequences

- The app is built once, on the shape we actually want, instead of building a second
  table and paying to merge it later.
- "You're already registered" works across platforms, which is the point.
- **Prod's table lags local and dev until P1.** The migrations folder is still the schema;
  convergence is an `ALTER` in `19` that backfills `status` and `source` for four existing
  rows and leaves their `profile_id` null. Until then, prod is knowingly behind, and no
  app build may point at it regardless.
- **The app and the live website now share a table**, so an app migration can break the
  live site. The mitigation is a rule, not a hope: changes to the website's columns are
  additive only, and none of `course`, `format`, `full_name`, `email`, `city`, `country`,
  `branch`, `amount`, `currency`, `payment_status`, `stripe_session_id` is dropped,
  renamed or retyped without a coordinated change in `Desktop/agbc`.
- **A branch leader cannot see an unlinked website registration at all.** That is the
  point of decision 4, and it has a cost: until an admin links or branches those rows,
  the leader running the course cannot see who paid for it on the website. With four
  rows today that is nothing; it becomes real friction if website registrations grow
  before the Phase C dashboard lands, and the answer then is to link them, not to loosen
  the policy. pgTAP asserts the leader sees nothing here, so a later loosening has to be
  a decision.
- **Somebody with a second email can fix it themselves the day the app surface ships**,
  without waiting for the Phase C dashboard and without an admin reading their payment
  record. The claim flow is the reason this decision does not leave a hole behind it.
- **There is now a second place a member's email lives** (`profile_emails`), which is
  more personal data to hold and to delete. It joins the account-deletion path in `20`
  along with everything else keyed to a profile, and it is worth the trade because the
  alternative is a proof that expires the moment it is used.
- **The claim flow sends mail to an address the caller names**, which is a small piece of
  abuse surface that did not exist before. It is bounded by `_shared/rateLimit.ts` per
  caller and per target, and it says nothing about an address before the code is entered.
- `donations` remains fenced. This decision covers exactly one table and sets no
  precedent for the other.

## Alternatives considered

**A separate `academy_registrations`.** The cheap, unblocked option, and the first
recommendation. Rejected because the cross-platform duplicate is not an edge case, it is
the feature: the same courses are offered on both surfaces, seeded from the website's own
content files. Deferring the merge makes it more expensive, not less, and leaves a
fee-bearing double booking open in the meantime.

**Migrating the website onto the app's terms first.** Rename its table, update
`Desktop/agbc`, give it a service-key-only policy set. Rejected for now: it touches a live
site, it needs P1 anyway, and it buys nothing the shared table does not already give.

**A union view for reads only.** Two write models, one read model. Rejected because it
still has to reference the fenced table, so it pays the same fence and gate cost while
leaving two dedupe stories and two places a registration can live.

**Making the website authenticate.** Rejected: requiring an account on a public course
form is a real conversion cost for no security gain, since the writer is already a trusted
server rather than a browser.

**Email matching alone, with no human step.** The original shape of this ADR. Rejected
once it was clear that it silently fails for anyone who used a different address at
checkout than in the app, which is ordinary rather than exotic, and that its failure mode
is the exact harm the whole decision exists to prevent: a second payment for a course
they already hold a place on.

**A leader link alone, with no email matching.** Rejected the other way: it makes a human
do work the database can do correctly and instantly for the common case, it delays every
member until somebody gets round to them, and it puts a leader in front of a stranger's
payment record far more often than necessary.

**Deferring the member self-claim to a later phase.** Briefly the plan, on the grounds
that it is a second OTP flow and the volume today is four registrations. Rejected once
the pieces turned out to already exist: `_shared/email.ts` and `_shared/rateLimit.ts` are
in the repo and used by three functions, so the cost is one edge function, one small
table and one app surface. Deferring it would have meant shipping a decision whose only
answer for the different-address case was "wait for Phase C and hope an admin notices",
which is the hole this ADR exists to close.

**Spending the claim on the matching rows instead of storing the address.** Less personal
data held, and genuinely tempting. Rejected because the Academy is a pathway of several
courses: the same member registers again, the proof is gone, and they are back to "not
registered" having already proved exactly this once.
