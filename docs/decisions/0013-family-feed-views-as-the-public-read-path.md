# 0013 · Family feed views are the only public read path

- Status: accepted
- Date: 2026-07-20 (W1.5)
- Spec: `docs/spec/02-DATA-MODEL.md` (write-path invariants, realtime), `docs/spec/09-FEATURE-Family.md`, `docs/spec/20-PRIVACY.md`

## Context

A prayer request can be posted anonymously. `09` and `02` both require that anonymity be server-enforced: "the UI hiding the name is presentation, not the mechanism", and W1.5's Done criterion is that an anonymous prayer shows "A member" **with no `author_id` anywhere in the payload, verified against the network trace, not the UI**.

Row-level security cannot deliver that. RLS filters ROWS; it has no conditional column facility. If `prayers` carries a public SELECT policy for approved rows, then any client holding the anon key can `select author_id from prayers` and read the author of every anonymous request. Column-level `REVOKE` does not rescue it either: branch leaders legitimately need the author for safeguarding (`17`), and they read through the same table and the same `authenticated` role.

The same problem appears on the realtime path. `02` already rules out `postgres_changes` because it streams raw base-table rows (views do not apply, DELETE events skip RLS).

## Decision

Public reads of Family content go through two views, `public.testimony_feed` and `public.prayer_feed`, and through nothing else.

- Both are declared `with (security_invoker = false)`. They run as their owner (`postgres`, which holds `BYPASSRLS`), so the view's own `WHERE` clause is the public-visibility boundary: approved, not soft-deleted, and not blocked in either direction.
- `prayer_feed` projects `case when is_anonymous then null else author_id end` (and the same for name and avatar), so the anonymous author never leaves the database.
- The base tables `testimonies` and `prayers` grant `anon` **nothing**. The explicit `REVOKE` is load-bearing: Supabase's default privileges would otherwise hand `anon` SELECT on every new table. `authenticated` keeps base-table access, where RLS scopes it to own rows plus (for leaders) the branch queue.
- Realtime broadcasts are built by a `SECURITY DEFINER` trigger that assembles a sanitized payload and calls `realtime.send()` on private channels, applying the same nulling rule.

## Consequences

- The security boundary for public reads is one `WHERE` clause per feed, written once and asserted directly in `supabase/tests/010-family-anonymity-blocks-counters.sql`, including against the row `realtime.send()` actually wrote.
- Supabase's advisor will flag both views as `security_definer_view`. That is the intent, not a finding; it is recorded here so nobody "fixes" it later.
- Every public read path must be added to a view rather than to a base-table policy. New public Family columns are a view change, and forgetting one shows up as a missing column, never as a leak.
- **The two-way block filter is inlined into each view, not factored into a helper function, and it must stay that way.** The filter has to see both directions of a block, which the caller cannot read (a member sees only the blocks they made; "X blocked you" is never disclosed). A `SECURITY DEFINER` helper sees both, but Postgres grants EXECUTE on it to PUBLIC, so any member could call it directly and ask "did X block me?" - the exact disclosure the policy refuses. Revoking that EXECUTE is not the escape hatch: a security-definer view calling a function the invoking role cannot execute **segfaults the Postgres backend** (signal 11, reproduced on the local stack 2026-07-20, crash recovery each time). Inlining sidesteps both problems, because `blocked_users` is then a plain table reference and `security_invoker = false` covers it. `supabase/tests/010` asserts no such helper exists.
- Feed queries pay a per-row block-filter subquery. Acceptable at v1 scale (blocked pairs are indexed in both directions); revisit if a feed page ever costs more than the budget in `21`.
- Two client-visible shapes exist per entity (feed view for browsing, base table for MY-POSTS and moderation). W1.5's FE work and W2.6 must pick the right one deliberately; the base table is the wrong default.
