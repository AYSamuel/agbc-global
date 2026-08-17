-- Track P: `public.donations`, the one table the website has that our history never
-- created (docs/spec/plans/track-p-fresh-prod-project.md, ADR 0023).
--
-- Production becomes a NEW Supabase project rather than the shared one that serves
-- agbcglobal.com, and the website moves onto it. That move is not optional: ADR 0017
-- made `course_registrations` a single table shared by the app and the website, so
-- wherever that table lives, both live. `course_registrations` is already created by
-- our own history (20260809202000). `donations` is not in our schema at all, so a
-- fresh project would come up without it and the website's Stripe webhook would fail
-- on its first gift. This migration is that table, and it is the whole of what the
-- move costs on our side.
--
-- SHAPE COMES FROM THE WEBSITE'S OWN GENERATED TYPES
-- (`Desktop/agbc/src/lib/server/database.types.ts`), because those are what its code
-- expects, and not from the old project's DDL, which we are leaving behind. Nineteen
-- columns, in the order that file lists them so a human can diff the two side by side.
--
-- What the website actually does with this table, read in its code on 2026-08-17 and
-- not assumed (`src/lib/services/donations.ts`, `src/lib/services/donation-map.ts`,
-- `src/pages/api/webhooks/stripe.ts`):
--
--   * It only ever INSERTs. Nothing in the repo reads a donation row, including the
--     post-checkout thank-you page.
--   * It connects with the SERVICE-ROLE key (`src/lib/server/supabase.ts`), which
--     holds BYPASSRLS, so RLS is never in its path.
--   * It never sets `user_id`, `donor_address`, `gift_aid_eligible` or
--     `stripe_payment_intent_id`. See the note on those four below.
--
-- WHY THERE ARE NO VALUE CHECK CONSTRAINTS HERE, deliberately, and against this repo's
-- own habit of constraining hard (`notifications.type` is a CHECK a few migrations
-- back). The writer of every row is a DIFFERENT REPOSITORY that ships on its own
-- schedule, and the failure is asymmetric to the point of being one-sided. A refused
-- INSERT is not a validation error anyone sees: `insertDonation` treats only 23505 as
-- benign and throws on anything else, the webhook answers 5xx, Stripe retries into the
-- same constraint, and the end state is a donor who has been CHARGED with no record of
-- the gift, no thank-you email, and nothing but a webhook log to find it in. A row
-- carrying an unexpected `frequency` string, by contrast, is a row we can read and fix.
-- So the constraints on this table are exactly: nullability, the primary key, the
-- foreign key, and the three unique keys the website's idempotency actually depends on.
-- `amount >= 0` is the one arithmetic guard, and it is here only because it cannot
-- refuse anything Stripe can produce (both mappers fall back to 0, never lower).
--
-- FOUR COLUMNS ARE WRITTEN BY NOTHING TODAY: `gift_aid_eligible`, `donor_address`,
-- `user_id` and `stripe_payment_intent_id`. The giving form collects none of them
-- (`src/lib/schemas/forms.ts`), so they are inheritance from an earlier era of the
-- site. They are created anyway: the first two are the Gift Aid claim's own data and a
-- UK church will want them back, and dropping a column is a coordinated change with
-- another repo while leaving one costs nothing. Read them as empty by design rather
-- than as a bug, and note that `donations_stripe_payment_intent_id_key` is therefore an
-- inert guard waiting for a PaymentIntents-shaped writer.
--
-- LOCKDOWN. `FORCE ROW LEVEL SECURITY` with ZERO policies and nothing granted to `anon`
-- or `authenticated`. The website needs no policy (service-role bypasses RLS) and no
-- app surface reads this table (giving links out, ADR 0004), so every client role can
-- be given nothing at all. This is where issue #96's fragility dies by construction:
-- on the old project `anon` and `authenticated` held SELECT/INSERT/UPDATE/DELETE/
-- TRUNCATE over donor names, addresses and email, with only the ABSENCE of a policy
-- standing between the anon key and that data. One careless permissive policy would
-- have been enough. Here there is no grant to widen.
--
-- `user_id` references `auth.users` ON DELETE SET NULL, which is the fix for the trap
-- documented in prod-audit-2026-07-30.md: the old FK had no ON DELETE and four of its
-- twelve rows pointed at live auth users, so deleting those accounts was refused by the
-- database and the only way through looked like CASCADE, which would have destroyed
-- giving records. A payment record must survive the account that made it, so the
-- reference nulls and the row stays, which is also what `course_registrations.profile_id`
-- does for the same reason (ADR 0017). docs/spec/20's retention schedule gains a row for
-- both tables in this change: it had none, and the erasure position was being asserted in
-- two migrations without ever being written down where the DPIA would find it.
--
-- No `updated_at`: rows are append-only. Nothing in either repo updates a donation.
--
-- Rollback (roll forward, per the database standard): a compensating migration drops
-- the table. Nothing else in this schema references it.

begin;

set local lock_timeout = '3s';

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Nullable: Stripe metadata carries a name only when the donor typed one, and the
  -- mapper writes `m.name || null`. The thank-you email falls back to "friend".
  donor_name text,
  email text not null,
  -- Stripe MINOR units (pence/cents), never majors: the website renders it as
  -- `amount / 100`. Integer for the same reason the rest of this schema uses
  -- `fee_minor` / `price_minor` (docs/spec/02): money is counted, not measured.
  amount integer not null constraint donations_amount_not_negative check (amount >= 0),
  -- Lowercase ISO as Stripe returns it ('gbp'), defaulted by the mapper, never a symbol.
  currency text not null,
  -- 'one_time' or 'monthly' today. Not a CHECK: see the header.
  frequency text not null,
  -- The branch's DISPLAY NAME, resolved from the website's own content collection
  -- before the insert, and deliberately NOT a reference to `public.branches`. The two
  -- repos maintain separate branch lists, and an FK here would turn a new branch on the
  -- website into a failed donation insert. Never used for scoping, exactly as
  -- `course_registrations.branch` is not (ADR 0017).
  branch text,
  -- The idempotency trio. Each shape of gift fills a different one, which is why all
  -- three are nullable and why plain UNIQUE (nulls distinct) is the right key: a
  -- one-time gift is unique by session, a recurring charge by invoice. The website
  -- reads 23505 off these and treats it as "already recorded", so a retried Stripe
  -- event is a no-op and the thank-you email fires exactly once per new gift.
  stripe_session_id text unique,
  -- NOT unique: one subscription produces one invoice a month, all carrying this id.
  stripe_subscription_id text,
  stripe_invoice_id text unique,
  -- NOT NULL with a default because the website's generated types mark it optional on
  -- insert while non-null on read. 'pending' rather than 'paid' so a row that somehow
  -- arrives without a status can never read as money received.
  payment_status text not null default 'pending',
  gift_aid_eligible boolean,
  donor_address text,
  -- Nulls rather than cascades: the gift outlives the account (see the header).
  user_id uuid references auth.users (id) on delete set null,
  -- Designation ('General', a fund name). Mapper defaults it to 'General'.
  giving_type text,
  -- Free text the donor may attach to the gift.
  reference text,
  stripe_payment_intent_id text unique,
  -- 'web' from the website. An in-app writer would say so here, if one ever exists.
  source text
);

comment on table public.donations is
  'Giving records written by the LIVE church website''s Stripe webhook (Desktop/agbc), which INSERTs only and connects with the service-role key. Created here because production is a project of our own now and the website moves onto it (ADR 0023, ADR 0017). Holds donor PII: name, address, email. FORCE RLS with zero policies and no grant to anon or authenticated; the shape is a cross-repo contract asserted in supabase/tests/039.';
comment on column public.donations.amount is
  'Stripe minor units (pence/cents), as elsewhere in this schema. The website renders amount / 100.';
comment on column public.donations.branch is
  'The branch DISPLAY NAME from the website''s content collection. Deliberately not an FK to public.branches: the two repos keep separate lists. Never used for scoping.';
comment on column public.donations.stripe_session_id is
  'One-time gifts. Unique: the website''s idempotency reads 23505 off this key so a retried checkout.session.completed is a no-op.';
comment on column public.donations.stripe_invoice_id is
  'Recurring gifts, one row per paid invoice. Unique for the same reason as stripe_session_id.';
comment on column public.donations.stripe_payment_intent_id is
  'Inert today: nothing writes it. Kept as the idempotency key a PaymentIntents-shaped writer would need.';
comment on column public.donations.payment_status is
  'Defaults to ''pending'' so a status-less row can never read as money received. The website always writes ''paid''.';
comment on column public.donations.user_id is
  'ON DELETE SET NULL: a payment record outlives the account that made it (docs/spec/20). Written by nothing today.';
comment on column public.donations.gift_aid_eligible is
  'Gift Aid claim data. Empty by design: the current giving form does not collect it.';
comment on column public.donations.donor_address is
  'Gift Aid claim data, and the most sensitive column here. Empty by design: the current giving form does not collect it.';

-- The FK's own index, per this schema's convention that every FK column gets one
-- (docs/spec/02). It is not speculation about a future admin read: ON DELETE SET NULL
-- makes Postgres scan this table on every auth.users deletion, and account erasure is
-- a real path in this app (docs/spec/20).
create index donations_user_id_idx on public.donations (user_id);

alter table public.donations enable row level security;
alter table public.donations force row level security;

-- Revoked by name: Supabase's bootstrap grants ALL on a new table to anon and
-- authenticated directly, so revoking from PUBLIC alone would look like a fence and be
-- none (issue #96). Nothing is granted back.
revoke all on public.donations from anon, authenticated;

-- No policy of any kind, on purpose. The only writer holds BYPASSRLS; the only reader
-- that will ever exist (an admin giving report) is a later, deliberate decision and
-- will read through `public.profiles`, never the retired app's `public.users`.
grant all on public.donations to service_role;

commit;
