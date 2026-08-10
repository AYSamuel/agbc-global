-- One course_registrations table, shared by the app and the LIVE website (W2.9 slice 2;
-- ADR 0017, docs/spec/02 §Academy, docs/spec/13).
--
-- READ ADR 0017 BEFORE TOUCHING THIS TABLE. The short version:
--
-- * The website (Desktop/agbc) writes rows here with the SERVICE KEY when a Stripe
--   Checkout session completes. Guest checkout and member registration are one entity,
--   so the app shares the table instead of building a second one and paying to merge it.
-- * The first block of columns is the website's, exactly as its supabase/schema.sql
--   defines them today. None of them may be dropped, renamed or retyped without a
--   coordinated change in Desktop/agbc; the fence was lowered for this ONE table by
--   ADR 0017, and for nothing else on the fenced list.
-- * Locally and on dev this CREATE builds the merged shape from scratch. PROD is
--   knowingly behind: its copy of this table gains the second block via an ALTER in
--   docs/spec/19, gated behind Track P P1. No app build points at prod meanwhile.
-- * The app NEVER writes a registration (no member INSERT): courses are paid and
--   delivered off-platform, so registration and payment happen on the website. The one
--   member write is the cancel transition. Invariants therefore live in constraints
--   and triggers, never in policies alone: the service key bypasses RLS but not these.
--
-- Rollback (roll forward): a compensating migration drops the table, its triggers and
-- functions, and the three enums. On prod (post-19) the compensating step is instead
-- an ALTER dropping only the second block, because the first block belongs to the
-- website.

create type public.course_registration_status as enum
  ('pending', 'confirmed', 'cancelled');
create type public.course_registration_source as enum
  ('app', 'website', 'import');
create type public.course_registration_link_method as enum
  ('handoff', 'email_auto', 'self', 'leader');

comment on type public.course_registration_status is
  'Enrolment state (ADR 0017): status is an enrolment decision ("you have a place"), the link trio is an identity one ("this row is yours"). cancelled is terminal; re-registering is a new row.';

create table public.course_registrations (
  -- ── The website's columns (Desktop/agbc supabase/schema.sql, verified 2026-08-09).
  -- A registration made with no knowledge of the app lands exactly as it does today.
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Content slug ('grace-reset'); the resolve trigger fills course_id from it.
  course text not null,
  -- Free text as the website's form posts it ('Intensive (2 weeks)'); English by design
  -- on the website so Stripe receipts read consistently across locales.
  format text not null,
  full_name text not null,
  email text not null,
  city text not null,
  country text not null,
  -- The website stores a branch DISPLAY NAME here ('Lighthouse Berlin'), free text.
  -- Deliberately NEVER used for scoping (ADR 0017 decision 5): it is not trustworthy
  -- enough to gate access to somebody's payment record. branch_id below is.
  branch text,
  -- Stripe minor units and lowercase ISO code, straight from the Checkout session.
  amount integer not null,
  currency text not null default 'gbp',
  payment_status text not null default 'pending',
  stripe_session_id text unique,

  -- ── The app's additions (ADR 0017 decision 1): all nullable or defaulted.
  profile_id uuid references public.profiles (id) on delete set null,
  status public.course_registration_status not null default 'pending',
  notes text,
  -- The website's inserts predate this column, so its default states the truth.
  source public.course_registration_source not null default 'website',
  course_id uuid references public.courses (id),
  branch_id uuid references public.branches (id),
  -- The link trio: who attached this row to a member, when, and by what proof.
  linked_by uuid references public.profiles (id) on delete set null,
  linked_at timestamptz,
  link_method public.course_registration_link_method
);

comment on table public.course_registrations is
  'One registration per paid course sign-up, shared with the LIVE website (ADR 0017). The website writes rows with the service key; the app reads them and may only cancel. profile_id and the link trio are server-written (ADR 0015: a column a policy reads must not be writable by its subject). Payment records: profile deletion sets profile_id null rather than erasing the row (docs/spec/20 keeps financial records under their own basis).';
comment on column public.course_registrations.profile_id is
  'The member this registration belongs to. Server-written only: the SELECT policy reads it, so a member who could write it could claim a stranger''s registration and read their name, email, city, country and what they paid.';
comment on column public.course_registrations.branch is
  'Website free text (a branch display name). Never used for scoping (ADR 0017 decision 5); branch_id is the scoping column.';

-- Every FK indexed (`02` conventions); email normalized for the claim flow's linking
-- pass and the admin's lookup.
create index course_registrations_profile_idx
  on public.course_registrations (profile_id);
create index course_registrations_course_id_idx
  on public.course_registrations (course_id);
create index course_registrations_branch_id_idx
  on public.course_registrations (branch_id);
create index course_registrations_linked_by_idx
  on public.course_registrations (linked_by);
create index course_registrations_email_idx
  on public.course_registrations (lower(trim(email)));

-- The double-booking wall (ADR 0017 decision 9): one live registration per member per
-- course, for EVERY writer. Partial so cancelled rows free the slot (re-registering is
-- a new row), and null course_id/profile_id rows (unlinked website guests) never
-- collide. This is a constraint rather than a policy because the website's service key
-- bypasses policies.
create unique index course_registrations_active_enrolment_uniq
  on public.course_registrations (course_id, profile_id)
  where status <> 'cancelled';

-- --- write-path invariants (docs/spec/02) ----------------------------------------------

/**
 * Births. Two jobs:
 *
 * 1. The app never writes a registration (ADR 0017 decision 6). No client role holds
 *    INSERT either; this raise is the wall behind the missing grant.
 * 2. Resolve course_id from the website's course slug, so the app has ONE column to
 *    query and the double-booking unique actually bites for handoff-born rows. Website
 *    rows carrying a slug the catalog does not know keep course_id null rather than
 *    failing: the website's write path must never break on the app's catalog.
 */
create function public.course_registrations_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is not null then
    raise exception 'registrations are written by the website, never from the app'
      using errcode = 'insufficient_privilege';
  end if;

  if new.course_id is null and new.course <> '' then
    select c.id into new.course_id
    from public.courses c
    where c.slug = new.course;
  end if;

  return new;
end;
$$;

/**
 * Edits. The rules, in trust order:
 *
 * - cancelled is terminal for EVERYONE, the service key included: there is no un-cancel,
 *   a new registration is a new row (docs/spec/13, ADR 0017 decision 9).
 * - Trusted writers (no user context: the website's service key, the claim RPC's linking
 *   pass, seeds, jobs) may otherwise write freely; constraints still apply.
 * - Admins act through their own policies and, for the link, the Phase C SECURITY
 *   DEFINER routine; auth.uid() survives definer calls, so they pass here by role.
 * - Everyone else is a member cancelling their own registration: status is the only
 *   column that may move, and only to 'cancelled'. The column grant below already
 *   refuses the rest; this is the wall behind the grant (defense in depth).
 */
create function public.course_registrations_update_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
begin
  if old.status = 'cancelled' and new.status is distinct from old.status then
    raise exception 'a cancelled registration stays cancelled; register again instead'
      using errcode = 'check_violation';
  end if;

  if actor is null or public.caller_is_admin_live() then
    return new;
  end if;

  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'only the status of a registration can be changed from the app'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'members may only cancel a registration'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger course_registrations_guard
  before insert on public.course_registrations
  for each row execute function public.course_registrations_insert_guard();

create trigger course_registrations_update_guard
  before update on public.course_registrations
  for each row execute function public.course_registrations_update_guard();

-- --- the audit trail --------------------------------------------------------------------

-- Linking a payment record to an identity is a privileged act, whoever performs it.
alter type public.privileged_action add value 'registration_linked';

/**
 * Every change of a registration's owner writes privileged_actions, on EVERY path
 * (ADR 0015/0017): the claim RPC, the Phase C admin link, a migration, an incident
 * fix. A caller that has to remember to write its own audit row will forget. Births
 * are deliberately silent, matching profiles_audit's branch-on-insert reasoning: a
 * handoff row born linked is the member's own act, and auditing every website insert
 * would bury the grants this log exists to surface.
 */
create function public.course_registrations_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is distinct from old.profile_id then
    insert into public.privileged_actions (actor_id, target_id, action, before, after)
    values (
      (select auth.uid()),
      coalesce(new.profile_id, old.profile_id),
      'registration_linked',
      jsonb_build_object(
        'registration_id', old.id,
        'profile_id', old.profile_id,
        'link_method', old.link_method
      ),
      jsonb_build_object(
        'registration_id', new.id,
        'profile_id', new.profile_id,
        'link_method', new.link_method
      )
    );
  end if;
  return null;
end;
$$;

create trigger course_registrations_audit
  after update on public.course_registrations
  for each row execute function public.course_registrations_audit();

-- --- who may read and write what --------------------------------------------------------

alter table public.course_registrations enable row level security;
alter table public.course_registrations force row level security;

-- A member sees a registration when it is linked to them OR when its email is one of
-- their proven addresses (ADR 0017 decision 2): sign-in is email OTP, so controlling
-- the mailbox is proven, not claimed.
create policy "members read their own registrations"
  on public.course_registrations for select
  using (
    profile_id = (select auth.uid())
    or public.email_belongs_to_caller(email)
  );

-- Once linked to a member or given a branch, a row falls under the normal in-branch
-- rule; the linked member's home branch answers when the row itself has none. The
-- profiles subquery runs under the LEADER's own RLS, which reads in-branch rows.
create policy "moderators read registrations in their branch"
  on public.course_registrations for select
  using (
    (branch_id is not null and public.can_moderate_branch(branch_id))
    or (
      branch_id is null
      and profile_id is not null
      and exists (
        select 1
        from public.profiles p
        where p.id = profile_id
          and public.can_moderate_branch(p.branch_id)
      )
    )
  );

-- An UNLINKED website registration is a stranger's purchase record and is visible to
-- ADMINS ONLY, never branch leaders (ADR 0017 decision 5, Ayo 2026-08-09). pgTAP
-- asserts the leader sees nothing here, so a later loosening has to be a decision.
create policy "admins read every registration"
  on public.course_registrations for select
  using (public.caller_is_admin_live());

create policy "members cancel their own registration"
  on public.course_registrations for update
  using (
    (profile_id = (select auth.uid()) or public.email_belongs_to_caller(email))
    and public.caller_is_onboarded()
  )
  with check (
    profile_id = (select auth.uid()) or public.email_belongs_to_caller(email)
  );

create policy "admins update registrations"
  on public.course_registrations for update
  using (public.caller_is_admin_live());

-- Grants: RLS chooses ROWS and never columns (the 2026-08-03 lesson), so the column
-- boundary lives here. Start from zero (issue #96: the bootstrap grants ALL to anon
-- and authenticated on every new table), then:
--
-- * SELECT per column, with `linked_by` deliberately absent: which staff member linked
--   a row is an internal fact, same reasoning as moderated_by. Every human client is
--   the same `authenticated` role, so it is withheld from leaders too; Phase C gets a
--   definer read path if the dashboard needs it. The app must therefore SELECT named
--   columns, never `*` (the moderation_note precedent).
-- * UPDATE on `status` alone: the cancel transition is the app's one write, and
--   profile_id + the link trio become UNWRITABLE from any client before the triggers
--   even speak (ADR 0015: the subject of an authorization column must not write it).
-- * No INSERT and no DELETE for any client role: the website inserts with the service
--   key; nothing deletes a payment record.
revoke all on public.course_registrations from anon, authenticated;

grant select (
    id, created_at, course, format, full_name, email, city, country, branch,
    amount, currency, payment_status, stripe_session_id,
    profile_id, status, notes, source, course_id, branch_id, linked_at, link_method
  )
  on public.course_registrations to authenticated;

grant update (status) on public.course_registrations to authenticated;
