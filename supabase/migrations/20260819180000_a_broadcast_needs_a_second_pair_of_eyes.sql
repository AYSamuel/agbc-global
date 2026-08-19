-- W3.5 slice 1: the broadcast domain, and the rule that no one reaches everyone alone
-- (docs/spec/17 §2, `02` §broadcasts, `15` fan-out, ADR 0014, ADR 0015).
--
-- THE STATE MACHINE IS NOT THE ONE `02` SPECIFIES, and the change is the point of this
-- migration rather than a detail of it. `02` gave branch scope no approval state at all
-- (`draft` -> `sending`, "author sends from the confirmation screen") and reserved four-eyes
-- for ministry scope, pairing it with `17` §2's "per-account daily send caps" as the
-- blast-radius control for everything else.
--
-- Decided with Ayo 2026-08-19: **there is no cap, and EVERY broadcast is approved by an
-- admin who is not its author.** Both scopes now run
--
--     draft -> pending_approval -> sending -> sent
--                     |  \-------> rejected
--                     \----------- (an author edit returns it to draft)
--
-- The cap was reaching for the right thing and holding the wrong end of it. A cap bounds how
-- OFTEN one account can reach everyone and says nothing about WHAT it says; an approval gate
-- bounds the content, which is the thing that cannot be taken back once it is on a lock
-- screen. It also deletes a whole mechanism (counting sends per account per day, deciding
-- what happens at the boundary, unblocking someone mid-Sunday) in favour of one that already
-- had to exist for ministry scope.
--
-- WHAT IT COSTS, recorded because it is a real operational risk and was chosen with open
-- eyes: production has exactly two admin accounts. Either of them being unreachable stops
-- ALL broadcasting, and a single-admin period stops it entirely. Ayo declined a break-glass
-- self-approval rule on the grounds that a rule with an exception is a rule people
-- misremember. Revisit if it ever bites; `17` §2 carries the same note.
--
-- THE APPROVER BEING AN ADMIN IS NOT A CHECK, and cannot be: the role lives on `profiles`
-- and a CHECK cannot query another table. It is enforced in `approve_broadcast()` through
-- `caller_is_admin_live()`, which is ADR 0015's rule (read authority from the live table,
-- never from a JWT claim, because a claim is as old as the token holding it). What the
-- CHECK *can* say is that the approver is not the author, and it does, on every row.
--
-- NO `privileged_actions` ROW FOR AN APPROVAL, deliberately. That ledger is profile-oriented
-- (`actor_id` and `target_id` both reference `profiles`) and a broadcast approval has no
-- profile target. The broadcast row IS its own audit record: `author_id`, `approved_by`,
-- `sent_at`, `review_note`, and content columns frozen from `sending` onward, so "who
-- approved what wording" is answerable from the row. ADR 0015's actual requirement, that the
-- record cannot be forgotten by a caller, is met by the trigger rather than by the caller.
--
-- BLOCKS DO NOT APPLY TO A BROADCAST, which is worth stating because W3.4's jobs all honour
-- them. `15`'s rule is that fan-out suppresses ACTIVITY notifications across a block, and
-- activity is one member's action reaching another. A broadcast is the church speaking to
-- its own members; blocking someone does not opt you out of your branch's announcements.
-- Prefs DO apply: `ministry_announcements` for ministry scope, `branch_updates` for branch.
--
-- Rollback (roll forward): a compensating migration drops both tables, the four action
-- functions, the two read functions and the FK added to `notifications`. No data moves.

begin;

set local lock_timeout = '3s';

create type public.broadcast_scope as enum ('branch', 'ministry');

create type public.broadcast_status as enum (
  'draft', 'pending_approval', 'rejected', 'sending', 'sent', 'halted', 'failed'
);

-- Both kept extensible per ADR 0014: push is the only automated channel today, and the
-- decision that removed WhatsApp was explicit that a second channel returning must not need
-- a schema redesign.
create type public.delivery_channel as enum ('push', 'in_app');
create type public.delivery_status as enum ('pending', 'sent', 'failed');

-- --- 1. the broadcast --------------------------------------------------------------

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  scope public.broadcast_scope not null,
  -- Set for branch scope, null for ministry. The CHECK below makes the pair honest rather
  -- than leaving "ministry with a branch_id" to be interpreted by whoever reads it next.
  branch_id uuid references public.branches (id),
  title text not null constraint broadcasts_title_not_blank check (length(btrim(title)) > 0),
  body text not null constraint broadcasts_body_not_blank check (length(btrim(body)) > 0),
  -- Optional per-locale bodies; the fan-out falls back to `body` (docs/spec/22 §4).
  body_de text,
  body_nl text,
  body_fr text,
  -- Allowlisted at compose time (docs/spec/17 §2): an expo-router path or an agbcglobal.com
  -- URL, nothing else. The allowlist is the dashboard's (slice 3) because it is a composition
  -- rule with a message to show, not a storage rule; what the database guarantees is the
  -- shape below, so a row can never hold a scheme-relative or traversing link even if the
  -- route is bypassed.
  link text constraint broadcasts_link_shape check (
    link is null
    or link ~ '^/[A-Za-z0-9/_.-]*$'
    or link ~ '^https://([a-z0-9-]+\.)*agbcglobal\.com(/[A-Za-z0-9/_.~%-]*)?$'
  ),
  channels text[] not null default array['push', 'in_app'],
  status public.broadcast_status not null default 'draft',
  review_note text,
  recipient_count integer,
  approved_by uuid references public.profiles (id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint broadcasts_branch_matches_scope check (
    (scope = 'branch' and branch_id is not null)
    or (scope = 'ministry' and branch_id is null)
  ),
  -- Four-eyes, on EVERY row rather than only ministry ones (see the header). Self-approval
  -- is impossible at the data layer, not merely refused by a route.
  constraint broadcasts_no_self_approval check (
    approved_by is distinct from author_id
  ),
  -- A row that has gone out names its approver. Before approval there is nobody to name.
  constraint broadcasts_sent_rows_are_approved check (
    status in ('draft', 'pending_approval', 'rejected') = (approved_by is null)
  )
);

comment on table public.broadcasts is
  'Leader and admin messages to many (docs/spec/17 §2, `02`). EVERY broadcast, both scopes, is approved by an admin who is not its author (decided 2026-08-19, replacing `02`''s branch-scope direct send and `17`''s daily send caps). Service-role written: no client policies of any kind.';
comment on column public.broadcasts.approved_by is
  'The admin who approved it, never the author (CHECK). Set by approve_broadcast(), which reads the role from the live table per ADR 0015; a CHECK cannot express "is an admin" because the role lives on profiles.';
comment on column public.broadcasts.link is
  'An expo-router path or an agbcglobal.com URL (docs/spec/17 §2, decided 2026-08-19). The CHECK is the shape floor; the composer holds the allowlist and the message that explains a refusal.';
comment on column public.broadcasts.recipient_count is
  'What the confirmation screen showed. Computed by broadcast_recipient_count(), the SAME function the fan-out derives its audience from, so the number a leader approved and the number that receives cannot drift.';

create index broadcasts_status_idx on public.broadcasts (status, created_at desc);
create index broadcasts_author_id_idx on public.broadcasts (author_id);
create index broadcasts_branch_id_idx on public.broadcasts (branch_id);
create index broadcasts_approved_by_idx on public.broadcasts (approved_by);

alter table public.broadcasts enable row level security;
alter table public.broadcasts force row level security;

-- Revoked by name: Supabase's bootstrap grants ALL on a new table to anon and authenticated
-- directly, so revoking from PUBLIC alone would look like a fence and be none (issue #96).
revoke all on public.broadcasts from anon, authenticated;
grant all on public.broadcasts to service_role;

-- ZERO client policies, per `02`'s matrix row: leaders act through dashboard service-role
-- routes, and nothing in the app reads this table.

-- --- 2. the delivery ledger --------------------------------------------------------

create table public.broadcast_deliveries (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Set for push rows, null for the in-app row. A member with three devices has three push
  -- rows and one in_app row.
  device_id uuid references public.devices (id) on delete cascade,
  channel public.delivery_channel not null,
  status public.delivery_status not null default 'pending',
  ticket_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broadcast_deliveries_push_has_device check (
    (channel = 'push') or (device_id is null)
  )
);

comment on table public.broadcast_deliveries is
  'Per-recipient delivery tracking (docs/spec/02): the cursor a chunked fan-out resumes from, the ticket the receipts sweep answers, and the denominator of the failure-rate alert. Purged 30 days after send by W3.4''s retention job, which gains this table in W3.5.';

-- TWO partial uniques rather than one UNIQUE NULLS NOT DISTINCT, though this database is
-- Postgres 17 and could do the latter. The two row shapes are genuinely different, and
-- writing them separately says so: an in-app row is one per member, a push row is one per
-- device. A single index over a nullable column would enforce both rules while looking like
-- one, and NULLs being distinct by default is exactly the trap that would let a resumed
-- fan-out write a second in_app row per member.
create unique index broadcast_deliveries_in_app_once
  on public.broadcast_deliveries (broadcast_id, profile_id, channel)
  where device_id is null;
create unique index broadcast_deliveries_push_once
  on public.broadcast_deliveries (broadcast_id, profile_id, channel, device_id)
  where device_id is not null;

-- The fan-out's cursor: what is still pending for this broadcast, oldest first.
create index broadcast_deliveries_pending_idx
  on public.broadcast_deliveries (broadcast_id, created_at)
  where status = 'pending';
create index broadcast_deliveries_profile_id_idx
  on public.broadcast_deliveries (profile_id);
create index broadcast_deliveries_device_id_idx
  on public.broadcast_deliveries (device_id);

alter table public.broadcast_deliveries enable row level security;
alter table public.broadcast_deliveries force row level security;

revoke all on public.broadcast_deliveries from anon, authenticated;
grant all on public.broadcast_deliveries to service_role;

-- --- 3. the FK W3.3 promised -------------------------------------------------------

-- `20260816120000` shipped `notifications.broadcast_id` and its unique index without this
-- reference, because `broadcasts` did not exist and proving one dedupe rule while promising
-- the other would have been a weaker claim than that slice meant to make. Its header names
-- this line as the whole of W3.5's change to that table.
alter table public.notifications
  add constraint notifications_broadcast_id_fkey
  foreign key (broadcast_id) references public.broadcasts (id) on delete cascade;

comment on column public.notifications.broadcast_id is
  'W3.5''s broadcasts.id, with its foreign key since 20260819180000. The unique index on (profile_id, broadcast_id) is the fan-out re-run guard (ADR 0022).';

commit;
