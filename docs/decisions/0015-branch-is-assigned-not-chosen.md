# 0015 · A branch is assigned, not chosen; and privileged actions get their own log

- Status: accepted
- Date: 2026-07-29
- Spec: `docs/spec/02-DATA-MODEL.md`, `16-FEATURE-Settings.md`, `17-ADMIN-DASHBOARD.md`, `20-PRIVACY-COMPLIANCE.md`, `25-BUILD-PROCESS.md`
- Plan: `docs/spec/plans/W2.7-people-roles-and-branch-moves.md`
- Code: PR #101 (the database half), migration `20260729200000_branch_is_assigned.sql`, pgTAP `018`

## Context

`profiles.branch_id` was in the member-writable allowlist, and `can_moderate_branch()`
derives moderation authority from that same column. Those two facts together were a
privilege-escalation hole. Measured on the local stack as a Berlin leader:

```
before: can_moderate_branch(glasgow) -> f   glasgow items in the queue -> 0
update public.profiles set branch_id = <glasgow> where id = <self>;   -- UPDATE 1
after:  can_moderate_branch(glasgow) -> t   glasgow items in the queue -> 1
```

The moderation rights were not the worst of it. Pending testimonies and prayer requests are
Art. 9 special-category data (`20`), so a leader could read another branch's unreviewed
disclosures. That is an unauthorised disclosure, not a permissions nicety.

**Why the test suite did not catch it.** `008`, `016` and `017` each prove a leader cannot
reach another branch. Each proves it by holding the leader still. None of them moved the
leader first, so the whole matrix passed green over an open door. The generalisable lesson,
recorded at the top of `018`: **when authority is derived from a column, the test matrix has
to include changing that column, not just acting from each side of it.**

Two related weaknesses surfaced while fixing it. `profiles_guard`'s privileged bypass tested
`is_admin()`, which reads the `user_role` JWT claim, in the function that decides who may
change `role`: a just-demoted admin kept the power until their token expired. And `015` test
11 ("even an allowlisted owner cannot write their own role") passed only because it acts with
a deliberately understated claim. A real admin with a correct token could always rewrite their
own role, so the property that test named was never actually true.

## Decision

**1. Nobody sets their own branch.** Chosen freely during onboarding, then immutable to its
owner. A change is proposed and someone else approves it.

**2. The branch being JOINED approves.** A member moving Glasgow to Berlin needs Berlin's
leader. Glasgow's leader sees it afterwards as read-only history and cannot block it. A
leader should not be able to refuse someone leaving; that is the wrong shape in a church, and
it is worst in exactly the situations where a person most needs to move. A LEADER's own move
is approved by an admin. An admin is the fallback approver: immediately when the destination
has no leader, and after 48 hours when it does, mirroring the moderation escalation already
in `17`.

**3. An approved move drops a leader to member**, unless the admin grants the new branch's
leadership in the same action. Leadership is authority over one branch's content and does not
travel with the person.

**4. The 48 hours is an expectation, not a hold.** The move lands on approval. Churn is
prevented by a 90-day cooldown after a *completed* move and by one open request at a time. A
rejection starts no cooldown, so a leader's mistake is fixable the same day rather than
becoming the member's problem for months.

**5. A rejection tells the member nothing beyond the outcome.** A private note is required for
the ministry record; the member sees a neutral, grace-framed message pointing at their branch
leader. The reasons most needing a record are the ones that must not be handed back.

**6. Authority checks read the live table, never a JWT claim.** `caller_is_admin_live()`, not
`is_admin()`, wherever a decision grants power.

**7. No self-service privilege change, admins included.** The row's owner cannot write their
own `role`. Admins remain exempt for `branch_id` only, which grants them nothing since they
already moderate every branch.

**8. Privileged actions get their own append-only log**, `privileged_actions`, written by an
`AFTER UPDATE` trigger rather than by each caller, so auditing is structural. Role and branch
changes first; moderation and broadcasts migrate on as those surfaces are touched. Retained 7
years, surviving erasure with the identity dropped and the governance record kept.

**9. The refusal note survives erasure; the identity around it does not** (decided 2026-07-30,
after the audit table landed). The note is free text a leader typed and may name the member, so
this was left open in `20260729220000_privileged_actions.sql`, whose trigger deliberately
permits either outcome. Wiping it would make closing an account a way to erase a safeguarding
record, which is the same failure decision 8 rejects for audit rows generally. It is retained
under Art. 17(3) (legal obligation, and the defence of legal claims) rather than the app's
ordinary basis, and `20`'s retention schedule carries the carve-out and the leader-facing
disclosure that goes with it. The landed migration's comment is left as written: it recorded the
question honestly and predicted that either answer needed no second migration, which is what
happened. No code changed.

## Consequences

- **The escalation is closed and proven closed.** `018` was run against the pre-fix function
  and goes red on 4 of 10 tests, so it catches the bug rather than passing vacuously.
- **`015` test 11 became true rather than accidental.** Relaxing it to match the new bypass
  would have been the wrong direction.
- **There is now no write path to another member's profile at all.** The only UPDATE policy on
  `profiles` is `members update their own profile`, so an admin updating someone else affects
  zero rows rather than being refused. Both halves of this feature need a `SECURITY DEFINER`
  function; W2.7 slice 3.5 was scoped as "a surface over an enforced rule" and that was wrong.
- **Until the approval flow ships, nobody can move an onboarded member, admins included.**
  Accepted knowingly: no app surface changes branch after onboarding today, so nothing
  regresses, and shipping the rule before the surface was the right call for a live hole.
- **The private note lives in the audit log, not on the request row.** Giving the source
  leader read-only history means giving them every column on that row, because RLS is
  row-level. The trade-off: the leader who wrote a note cannot re-read it, only admins can,
  which differs from content moderation.
- **A rejection changes no profile, so the audit trigger never fires for it.** The RPC writes
  that row itself. Easy to miss, and it is the case where the note matters most.
- **`16`'s profile-edit screen loses a field and gains four states**, and its mockup frames do
  not exist yet.
- **A second admin matters more than before.** The last-admin refusal, the 48-hour fallback
  and the erasure lockout all assume one eventually exists; today each has a single point of
  failure whose only recovery is a migration.
- **The last-admin refusal cannot fire, and that was decided knowingly** (measured while
  building `set_member_role`, 2026-07-30). The caller must be a live admin and cannot be the
  target, so any target holding `admin` implies two live admins exist and demoting one leaves
  one. What holds the invariant is the PAIR of refusals, not the count. The count stays as the
  backstop for the next caller and takes `FOR UPDATE` on the rows it counts, because
  count-then-act is a race the day a second admin does exist. pgTAP `020` states plainly that
  removing it turns nothing red, so the sequence test is not mistaken for coverage of it.
- **The fix for all three single points of failure is a break-glass admin, and it is not the
  same thing as oversight** (decided 2026-07-30). A dedicated non-daily admin identity on the
  church domain, seed and recovery codes held offline, added through the existing
  `bootstrap_admins` migration path, removes the erasure lockout and gives the 48-hour fallback
  two possible actors. It does NOT provide separation of duties: a second account held by the
  same person cannot review that person's actions. A second HUMAN admin remains a governance
  decision about who holds authority over other people's Art. 9 data, and is deliberately not
  treated as a technical task.

## Alternatives considered

- **Lock the column for staff only, leaving members self-serve.** Smallest possible fix and it
  closes the escalation, since members moderate nothing. Rejected because branch drives
  attendance, reminders and scoping, and Ayo's intent was explicitly that moves should not
  churn week to week for anyone.
- **A separate `moderates_branch_id`, decoupling home branch from moderation scope.**
  Conceptually cleanest, and closest to `17`'s "scope leaders to branches" wording: a leader
  could live in Berlin and moderate Emmen. Rejected as a larger schema change touching every
  `can_moderate_branch()` call site, for a flexibility the ministry does not need today.
- **Both branches must agree**, mirroring a real transfer letter. Most faithful to church
  practice and safest pastorally. Rejected: it doubles the wait and stalls completely whenever
  either branch has no leader, which is every branch right now.
- **An enforced 48-hour hold.** Makes the stated time always the true time. Rejected because
  it makes an approved member wait for nothing and needs a scheduled job to apply the move.
- **A narrow audit table for roles and branches only.** Faster to ship. Rejected because `17`
  requires the ministry-wide version, and building the narrow one first means writing it twice
  and migrating history later.
- **Letting erasure delete audit rows.** Simplest privacy story. Rejected: a member who was
  briefly a leader could then remove the record of who appointed them, which defeats the one
  job an audit log has.
