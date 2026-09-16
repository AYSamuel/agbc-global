# 0026 · A write that leaves the write queue takes its idempotency obligation with it

Date: 2026-09-16 · Status: accepted · Decider: Ayo (from the report "users are unable to have their message sent from contacts", which turned out to be two bugs, the second of which was this one)

## Context

`apps/mobile/src/lib/fetchWithTimeout.ts` aborts every supabase-js call at ten seconds, and
supabase-js reports that abort as a fetch-level failure with no error code, indistinguishable
from having no network. Several surfaces then told the member **the write did not happen**
and invited them to try again.

That claim was a guess, and on a timeout it was frequently wrong: the request had reached the
server, the server had done the work, and only the answer was lost. The member retried, and
the thing happened twice. Proven on 2026-09-16: one message typed once into CONTACT arrived at
the church inbox twice, one minute apart, both in Cloudflare's Email Routing activity log,
because the app had called the first attempt "You're offline" while Resend had already
accepted it.

An audit of every write in `apps/mobile` (W4.18 plan §1) found the shape in three places, and
found the app already solving it correctly in about twenty others. `lib/writeQueue` plus
`state/writeQueueHandlers.ts` make every queued handler idempotent, and `outcomeFor`
deliberately treats a code-less error as `retry` and sends again. That is only safe because
each handler sits behind a unique constraint. The queue's own comment says it: two concurrent
passes would send every write twice, and idempotency makes that survivable.

**The exposed writes were precisely the ones that had opted out of the queue without taking
the idempotency half with them.** Each opt-out was documented and each was right on its own
terms (`interest.ts`, `useAskToJoin.ts`, `notes.ts`, `markAnswered.ts`, `delete.tsx`). None
of them replaced what the queue had been providing.

| Surface | What a retry did | Found how |
|---|---|---|
| account deletion (`delete.tsx`) | no second erasure, but "Nothing has changed" shown for an account that was gone, member left signed in on it | audit; the worst of the three, GDPR path |
| testimony and prayer compose (`ComposeFlow.tsx`) | a second public post, through moderation twice; a linked testimony's retry raised 23505 and was told "please try again" for ever | audit; `composeUnits.test.ts:46` asserted the bug as expected |
| contact form and the registration sheet | a second email | the report |

## Decision

**Every write that does not go through the write queue must be idempotent by construction, and
its failure copy may claim only what is known.** Concretely, three rules, each already applied
once in W4.18 and to be applied to any new unqueued write:

1. **The client names the row, or the request, before it goes out.** A post is inserted with
   an `id` the phone minted and wrote into the draft first (`features/family/postId.ts`); a
   contact message carries an `Idempotency-Key` minted on the phone and kept by content
   (`lib/contactForm.ts`). A repeat is then a conflict the far side refuses, not a second
   thing. Where the far side already refuses a repeat on its own, as `erase_profile` does with
   `no_data_found`, that refusal is the confirmation and nothing new needs building.
2. **A failure with no error code is "unconfirmed", never "offline" and never "failed".**
   postgrest-js gives an aborted request an empty code, and a gateway error with a non-JSON
   body arrives as a bare message. The database never spoke, so the request may have run.
   "Nothing has changed" is shown only when the server proved it.
3. **A retry is safe, so the copy may invite one.** Once rule 1 holds, "tap again: if it
   already went through, it won't happen twice" is true, and it is what the member needs to
   hear.

The idempotency key for a message is tied to its **content**, not to the tap and not to the
screen. Tied to the tap, a retry mints afresh and duplicates as before. Tied to the screen, a
member who rephrases after a failure has the rewritten message discarded as a repeat of the
old one.

## Why

- **The busy flag was the trap.** Every exposed surface already disabled its button while in
  flight. That stops a double tap; it does nothing about the retry, because the retry was the
  behaviour the error copy asked for.
- **Speeding the server up does not close the window.** A network hiccup at the wrong moment
  reproduces the duplicate however fast the function is. The fix has to make the retry
  harmless, not rare.
- **The queue had already made the right call, in writing.** Extending its rule to the
  opt-outs is smaller and safer than pulling those writes back into the queue, which they left
  for stated reasons (an irreversible deletion must never replay days later; a post carries
  consent that must be captured at submit time).

## Consequences

- Three surfaces changed in W4.18 (#323, #324, #325). The pattern for each is the model for
  the next: a pure classifier beside the screen (`deleteOutcome.ts`, `mapComposeError`), the
  boundary the feature owns as the only thing mocked in its screen tests, and a mutation check
  on every new assertion before it counts.
- The database's part was already in place: INSERT on `testimonies` and `prayers` is a
  table-level grant, no policy or guard touches `id`, and the generated types already had
  `id?`. One thing the plan had not seen: the insert guard runs the daily quota **before** the
  conflict check, so a second attempt asks first whether the row exists
  (`reconcilePost.ts`), with the id still the net beneath the read.
- The `contact-form` function accepts the key as a token only and forwards it to Resend, which
  holds it for 24 hours. Stated deviation from `~/.claude/standards/backend.md`'s "replay the
  stored response": the function holds no store, Resend's key is the store, and a replay here
  would answer 200 for a send it never made. **The function must be dispatched to production
  before the app half reaches members**, or the copy promises a dedupe the live function does
  not perform.
- A per-call budget exists for the one write that needed more than ten seconds
  (`lib/fetchWithTimeout.ts` `budget()`). A budgeted signal is tagged, and only a tagged
  signal replaces the default timer: "a caller signal owns the budget" would have stripped the
  ten-second protection from every TanStack query, which is the whole reason the wrapper
  exists. A test holds that line.
- Three things this does NOT cover, recorded rather than lost: the sign-in code resend
  (`EmailStep.tsx`), pending verification of whether a resent code invalidates the previous
  one (GoTrue behaviour, not ours); photo uploads leaving an orphan object per retry
  (`photo.ts`, a fresh uuid each attempt); and the three on-device passes owed on each slice.

## Alternatives considered

- **Return the three writes to the write queue.** Rejected: each left it for a reason that
  still holds, and the queue's replay semantics are exactly wrong for an irreversible
  deletion.
- **A reconciliation read alone, without a client-minted id.** Rejected as the primary
  mechanism: it races, and a read that cannot be made says nothing about the row. It survives
  as the companion to the id, for the quota-edge case above.
- **Detect "offline" with a connectivity library and keep the old copy where the phone really
  is offline.** Rejected: a native module (a dev-client rebuild for both devices), and it would
  still be a guess in the case that matters, a request that left the phone and was never
  answered.
- **Raise the ten-second timeout everywhere.** Rejected: a feed frozen for thirty seconds is
  the field bug the timeout was written to fix. One write got a budget; reads keep the ten.
