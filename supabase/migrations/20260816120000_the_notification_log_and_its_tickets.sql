-- W3.3 slice 2: the notification log and its delivery ledger (docs/spec/15, `02`).
--
-- Two tables, and one decision that had been waiting since 2026-08-06.
--
-- 1. `notifications` IS NOT PARTITIONED (ADR 0022). `02` specified monthly partitions so
--    the 12-month purge would be a partition drop, and W2.7 slice 5 found that this
--    cannot coexist with the table's two dedupe rules: Postgres requires every unique
--    constraint on a partitioned table to include the partition key, and neither
--    `(profile_id, broadcast_id)` nor the partial `(profile_id, dedupe_key)` does.
--    Enforced per partition, both lapse exactly at a month boundary, so a fan-out
--    retried across midnight on the 1st would notify everyone twice. The full argument
--    is in the ADR; the short version is that the failure modes are asymmetric. A
--    retention job that fails leaves stale rows. A partition-maintenance job that fails
--    stops INSERTs on a date known in advance, which for THIS table means reminders
--    silently stop, the canonical failure `21` §5 names at the top of its own job table.
--    `02`'s open-conflict note and `21` §5's retention row are corrected in this PR.
--
-- 2. NOBODY INSERTS THEIR OWN NOTIFICATIONS. Every row here is written by the service
--    role (the sender in slice 3, the jobs in W3.4, the fan-out in W3.5). So this table
--    takes the strictest posture yet in this repo: no client INSERT policy AND no client
--    INSERT grant, no DELETE of either kind, and the only thing a member may write is
--    `read_at`, granted per column. That last part matters and is the `20260803140000`
--    lesson applied on the write side: RLS chooses ROWS and never columns, so a
--    table-level UPDATE grant on a row the member may already read would hand them
--    `deep_link`, `type`, `params` and `dedupe_key` to rewrite at will. A member who
--    forged `dedupe_key` could silently suppress a future reminder to themselves.
--
-- 3. `broadcast_id` arrives WITHOUT its foreign key, deliberately. `broadcasts` is
--    W3.5's table and does not exist yet. The column and its unique index are here
--    anyway because the whole point of ADR 0022 is that BOTH dedupe rules work, and
--    proving one while promising the other is a weaker claim than this slice is meant to
--    make. W3.5 adds `references public.broadcasts (id) on delete cascade` and nothing
--    else. Until then the column is service-role-written and unreferenced.
--
-- Retention (`20`: 12 months) ships as a function here and is SCHEDULED BY W3.4 with the
-- other purges, per ADR 0016. Shipped now so the ADR's "retention becomes a batched
-- delete" is executable and testable rather than a promise made in prose.
--
-- Rollback (roll forward, per the database standard): a compensating migration drops
-- both tables and the purge function. Nothing else references them yet.

begin;

set local lock_timeout = '3s';

-- --- the log ----------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- `02`'s two families. The pref-gated ones are suppressed by `notification_prefs`
  -- before a send; the transactional ones answer an action the member took and are
  -- always delivered (docs/spec/15, the `transactional` Android channel has no pref
  -- key). A CHECK rather than an enum, and rather than a lookup table. Not an enum
  -- because this list grows with features and a value added by `ALTER TYPE ... ADD
  -- VALUE` cannot be USED in the same transaction that adds it, which makes a
  -- migration that both widens the set and backfills with it a two-step dance.
  -- Not a lookup table (which the database standard prefers for a growing set)
  -- because these values are not product-facing content: nothing renders them,
  -- nothing translates them, nothing orders them. They are an internal routing key
  -- choosing an Android channel and a pref gate, so the standard's other branch,
  -- a stable internal state machine, is the one that fits.
  type text not null constraint notifications_type_known check (
    type in (
      -- pref-gated
      'prayer', 'testimony_glory', 'event', 'ministry', 'branch', 'service_reminder',
      -- always-on (transactional)
      'moderation', 'rsvp_reminder', 'registration', 'purchase'
    )
  ),
  -- Automated rows: a template key + params, rendered per recipient language at send
  -- time and again at display time (docs/spec/15's localization rule). NEVER a baked
  -- English string: the lock screen is the most visible localized surface in the app.
  template_key text,
  -- Template parameters only. Never special-category content: push payloads stay
  -- generic and the body is fetched in-app after auth (`15`/`20`).
  params jsonb,
  -- Manual broadcast rows only, pre-rendered per recipient language at fan-out (W3.5).
  title text,
  body text,
  -- FK arrives with `broadcasts` in W3.5; see the header.
  broadcast_id uuid,
  -- Deterministic key so a re-run never double-sends. Keys for time-bound sends embed
  -- the occurrence they announce (`service_reminder:<branch_id>:<service_date>`), so a
  -- rescheduled event mints a new key and its reminder is NOT swallowed by the old one
  -- (`02`, `21` §5).
  dedupe_key text,
  -- An expo-router path (`/family/prayer/[id]`), never a URL. Deep links NAVIGATE and
  -- never carry or trigger a write (`15`, and `03`'s gate-return security rule), so the
  -- app resolves this against an allowlist rather than trusting it.
  deep_link text not null constraint notifications_deep_link_is_a_path check (
    deep_link like '/%'
  ),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  -- Exactly one of the two shapes above. A row with neither renders as nothing; a row
  -- with both is two sources for one line of text, and the renderer would have to pick.
  constraint notifications_one_shape check (
    (template_key is not null and title is null and body is null)
    or (template_key is null and title is not null and body is not null)
  )
);

comment on table public.notifications is
  'The in-app notification centre and the durable log behind push (docs/spec/15). Deliberately NOT partitioned (ADR 0022): monthly partitions cannot carry either dedupe key, and a partition-maintenance failure would stop INSERTs, which for this table means reminders silently stop. Service-role written; a member may write only read_at. Retention: 12 months (docs/spec/20) via purge_old_notifications(), scheduled by W3.4.';
comment on column public.notifications.template_key is
  'Automated rows: rendered per recipient profiles.language at send time and at display time (docs/spec/15). Never a baked English string.';
comment on column public.notifications.params is
  'Template parameters. Never special-category content: push payloads stay generic and the body is fetched in-app (docs/spec/15/20).';
comment on column public.notifications.broadcast_id is
  'W3.5''s broadcasts.id. The FK lands with that table (20260816120000 header); the unique index below is already the fan-out re-run guard.';
comment on column public.notifications.dedupe_key is
  'Deterministic per occurrence, so a re-run never double-sends (docs/spec/21 §5). Time-bound keys embed the occurrence: service_reminder:<branch_id>:<service_date>.';
comment on column public.notifications.deep_link is
  'An expo-router path. Navigates only, never writes (docs/spec/15, docs/spec/03 gate-return rule); the app resolves it against an allowlist.';

-- The two guarantees ADR 0022 exists to keep. Both are global rather than per-month,
-- which is the whole decision in two lines of DDL.
create unique index notifications_broadcast_once
  on public.notifications (profile_id, broadcast_id)
  where broadcast_id is not null;
create unique index notifications_dedupe_once
  on public.notifications (profile_id, dedupe_key)
  where dedupe_key is not null;

comment on index public.notifications_broadcast_once is
  'A fan-out re-run never double-writes (docs/spec/02). Global, not per-partition: ADR 0022.';
comment on index public.notifications_dedupe_once is
  'An automated job re-run never double-sends (docs/spec/21 §5). Global, not per-partition: ADR 0022.';

-- NC's read path: newest first, cursor-paginated ~30 a page (docs/spec/15). Leads with
-- the scoping column so RLS narrows before it sorts.
create index notifications_profile_created_idx
  on public.notifications (profile_id, created_at desc, id desc);

-- The unread dot on Home and the badge count. Partial, because read rows are the
-- overwhelming majority of a healthy table and none of them can answer this question.
create index notifications_unread_idx
  on public.notifications (profile_id)
  where read_at is null;

-- The retention purge below, and nothing else, scans by age alone.
create index notifications_created_at_idx on public.notifications (created_at);

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- Revoked by name: Supabase's bootstrap grants ALL on a new table to anon and
-- authenticated directly, so revoking from PUBLIC alone would look like a fence and be
-- none (issue #96).
revoke all on public.notifications from anon, authenticated;

-- Own rows only, for every role that has any access at all. There is deliberately NO
-- admin SELECT policy, following the precedent this same `02` matrix row already set at
-- W0.10 for `devices` and `notification_prefs` (20260719200023): the matrix's "admin:
-- all" is satisfied by the service role, and nothing in the app or the dashboard reads
-- another member's notifications. These rows name the content someone prayed about;
-- a broad admin read would be a privacy surface built before it has a caller (`20`).
create policy "members read their own notifications"
  on public.notifications for select
  using (profile_id = (select auth.uid()));

-- Marking read is the ONE write a member has. The row filter is here; the column
-- filter is the grant below, because RLS cannot express "only this column".
create policy "members mark their own notifications read"
  on public.notifications for update
  using (profile_id = (select auth.uid()) and public.caller_profile_is_live())
  with check (profile_id = (select auth.uid()));

-- No INSERT or DELETE policy of any kind, on purpose: every row is the server's, and a
-- member who could delete one could hide a moderation decision from their own log.

grant select on public.notifications to authenticated;
-- Column-scoped, and the reason is the `20260803140000` lesson on the write side: a
-- table-level UPDATE grant would let a member rewrite `dedupe_key` on their own row and
-- silently suppress a future reminder to themselves.
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- --- the ticket ledger ------------------------------------------------------------

-- Delivery truth for AUTOMATED pushes, which are otherwise fire-and-forget (`02`).
-- Expo push is two-phase: a send returns tickets, and the real outcome arrives as a
-- receipt ~15-30 minutes later. The sweep in slice 3 reads every unprocessed row here,
-- not the tickets of one fan-out, and deletes `devices` rows on DeviceNotRegistered.
create table public.push_tickets (
  -- Expo's own id, so it is the natural key and a re-recorded ticket is a no-op.
  ticket_id text primary key,
  device_id uuid not null references public.devices (id) on delete cascade,
  sent_at timestamptz not null default now(),
  -- Set when the receipt has been fetched and acted on. NULL is the sweep's work queue.
  processed_at timestamptz
);

comment on table public.push_tickets is
  'Expo push tickets awaiting their receipts (docs/spec/02, `21` §5). Ignoring receipts gets senders throttled, and DeviceNotRegistered arrives here rather than at send time. Purged after 7 days by W3.4''s retention job; Expo keeps receipts only ~24h, so anything older is unanswerable anyway.';

-- The sweep's only query. Partial, so it stays the size of the backlog rather than the
-- size of the table.
create index push_tickets_unprocessed_idx
  on public.push_tickets (sent_at)
  where processed_at is null;

create index push_tickets_device_id_idx on public.push_tickets (device_id);

alter table public.push_tickets enable row level security;
alter table public.push_tickets force row level security;

revoke all on public.push_tickets from anon, authenticated;

-- ZERO client policies, like `broadcast_deliveries` in the `02` matrix: this is machine
-- bookkeeping, no human surface reads it, and a member learning which of their devices
-- a push failed on is not a feature anyone asked for.
grant all on public.push_tickets to service_role;

-- --- retention --------------------------------------------------------------------

/**
 * Delete notifications past their retention window, in batches.
 *
 * This function is the second half of ADR 0022: partitioning was buying a cheap purge,
 * and dropping it is only honest if the replacement is real. Batched so it never holds
 * a long lock even if it has been missed for months, and it returns how many rows it
 * removed so the job that calls it (W3.4) can log and alert on it.
 *
 * SECURITY DEFINER because the caller is the service role reaching in through
 * PostgREST, and FORCE ROW LEVEL SECURITY applies to the table owner too; without it
 * the DELETE would silently match zero rows. `search_path` is pinned per the security
 * standard.
 */
create function public.purge_old_notifications(
  older_than interval default '12 months',
  batch_size integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := now() - older_than;
  removed integer := 0;
  batch integer;
begin
  loop
    with doomed as (
      select id from public.notifications
      where created_at < cutoff
      order by created_at
      limit batch_size
      for update skip locked
    )
    delete from public.notifications n using doomed d where n.id = d.id;

    get diagnostics batch = row_count;
    removed := removed + batch;
    exit when batch < batch_size;
  end loop;

  return removed;
end;
$$;

revoke all on function public.purge_old_notifications(interval, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_old_notifications(interval, integer) to service_role;

comment on function public.purge_old_notifications is
  'Batched 12-month retention purge for notifications (docs/spec/20, ADR 0022). Returns the number of rows removed. Scheduled by W3.4 with the other retention purges; running it by hand is safe and idempotent.';

commit;
