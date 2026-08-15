# 0021 · The app does not carry LIVE

Date: 2026-08-15 · Status: accepted · Decider: Ayo

## Context

`25`'s Phase 3 carried **W3.2 · LIVE slice**: a real-time screen with a server-side
watching-now aggregator broadcasting a count every 10-15s, live-detection hardening, a
scheduled-but-absent state machine, and attendance credited on opening the screen
(`source='live_watch'`, counting toward rhythm). Part of it already shipped in W1.3: the
`sermons.is_live` / `live_checked_at` columns, the 15-minute staleness bound
(`features/watch/live.ts`), the live banner on Watch and the `live-detection` edge
function.

None of it was ever exercised, because the premise was never checked with Ayo. It came
into the spec as an assumption about what a church app does rather than as a decision about
what THIS church wants its app to do.

## Decision

**Members do not join a live stream from inside the app.** The whole real-time layer is
removed, not merely the screen: no live flag on a sermon, no staleness bound protecting
that flag, no detection job setting it, no watching-now count, and no attendance credited
for watching one.

This is a product decision, not a technical one. There is nothing wrong with the design
that was specced; it builds a thing the church does not want.

## What is explicitly NOT removed

Two names are close enough to invite a careless sweep, and both must survive.

1. **`sermons.kind = 'live_replay'` and Watch's "Recent live streams" rail.** That value is
   the channel TAB a row was synced from (the UULV playlist), not a live state. Those rows
   are recorded messages and a large part of the catalogue; the rail is one of Watch's two
   sections. Removing it would delete content, which is the opposite of this change.
   Watching a replay is not joining live.
2. **`public.caller_profile_is_live()`.** Unrelated: it asks whether a PROFILE is still
   active rather than deleted, and it gates devices, notification preferences and blocks. A
   grep for `is_live` hits it, and dropping it would break sign-in surfaces.

## Consequences

- Phase 3 becomes W3.1 (done) and W3.3 (push). `25`, `18`, `04`, `08`, `02` and `21` §10
  are corrected in the same change, and the three `LIVE` frames leave `entry-flow.html`.
- `attendance_source.live_watch` is **retired in place, not dropped**. Postgres has no
  `ALTER TYPE ... DROP VALUE`; removing it means a new enum, a rewrite of every column
  using it and an ACCESS EXCLUSIVE lock on `attendance`, to delete a label that nothing has
  ever written (the credit-on-open write was W3.2's to build). The value keeps a comment
  saying it is retired; the app-side branches that rendered it are deleted, which is the
  half that matters, because a UI branch for an impossible state is a lie about the product.
- `08`'s rot handling loses its stale-live bound along with the flag it protected. Nothing
  advertises a live service any more, so there is no dead air to guard against.
- The `live-detection` edge function is deleted rather than left unscheduled. `21` recorded
  it as "unscheduled by choice, a one-line migration away"; that one line will never be
  written, and a function nobody can schedule is a maintenance cost with no destination.
- **YouTube quota goes down, not up.** Live detection was the only caller that would have
  polled outside the nightly window.

## Alternatives considered

**Defer W3.2 to Phase 4.** Rejected: deferring keeps the columns, the banner, the detection
function and the frames alive as things a future session would reasonably try to finish.
The premise is wrong, not the timing, and leaving wrong scaffolding standing is how it gets
built anyway.

**Keep the live banner, drop only the screen.** Rejected: the banner exists to send someone
into a live stream. Without a destination it is an announcement with nowhere to go.
