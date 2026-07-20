-- Family: the wedge domain (docs/spec/09, docs/spec/02 "Family"). This migration is
-- the app's trust anchor: everything that makes "nothing publishes without approval"
-- and "an anonymous prayer is anonymous" true lives here, in triggers and RLS, never
-- in the client. Read alongside supabase/tests/008-010.
--
-- Two shapes to know before reading on:
--
-- 1. PUBLIC READS GO THROUGH VIEWS, NOT THE BASE TABLES. `testimonies` and `prayers`
--    grant no anon SELECT at all; the `testimony_feed` / `prayer_feed` views are the
--    only public read path. Row-level security cannot hide a COLUMN, and an anonymous
--    prayer must never ship `author_id` to any client (docs/spec/02 write-path
--    invariants, docs/spec/20 Art. 9). The views are security-definer on purpose:
--    their WHERE clause IS the boundary, so it is written once, here, and tested.
-- 2. THE MODERATION PLANE RE-READS `profiles.role`, never the JWT claim. A demoted
--    leader keeps stale claims until token refresh (docs/spec/02); public.is_admin()
--    (claim-based) is therefore NOT used for anything in this file.

create type public.content_status as enum ('pending', 'approved', 'rejected', 'removed');
create type public.intercession_state as enum ('committed', 'prayed');
create type public.report_status as enum ('open', 'actioned', 'dismissed');

-- ---------------------------------------------------------------------------
-- Blocking (docs/spec/02 "Block mechanism"): store-required UGC control, two-way.
-- ---------------------------------------------------------------------------

create table public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

comment on table public.blocked_users is
  'Two-way content hide (docs/spec/02): neither party sees the other. Only the blocker can read their own rows; "who blocked me" is never disclosed.';

-- The PK indexes (blocker_id, blocked_id); the reverse direction needs its own.
create index blocked_users_blocked_id_idx on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;
alter table public.blocked_users force row level security;

create policy "members read their own block list"
  on public.blocked_users for select
  using (blocker_id = (select auth.uid()));

create policy "members block others"
  on public.blocked_users for insert
  with check (blocker_id = (select auth.uid()) and public.caller_profile_is_live());

create policy "members unblock"
  on public.blocked_users for delete
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Caller helpers. All of these read the profiles TABLE (not JWT claims) so that a
-- demoted leader or a deleted account loses authority immediately, and all of them
-- are stable so the planner calls them once per statement where it can.
-- ---------------------------------------------------------------------------

-- "Deleted accounts cannot write" + "writes require onboarded_at" (docs/spec/02,
-- docs/spec/03): the single gate every content/reaction INSERT policy hangs on.
create function public.caller_is_onboarded()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.deleted_at is null
      and p.onboarded_at is not null
  );
$$;

-- Table-checked admin (contrast public.is_admin(), which trusts the JWT claim and is
-- only safe for non-moderation reads).
create function public.caller_is_admin_live()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.deleted_at is null
      and p.role = 'admin'
  );
$$;

-- Leaders moderate their own branch; admins moderate everywhere (docs/spec/02 matrix).
create function public.can_moderate_branch(target_branch uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.deleted_at is null
      and (
        p.role = 'admin'
        or (p.role = 'leader' and p.branch_id = target_branch)
      )
  );
$$;

-- Note on block filtering: there is deliberately NO is_blocked_with() helper here.
-- The filter needs to see BOTH directions of a block, which the caller cannot read
-- (RLS shows a member only the blocks they made; "X blocked you" is never
-- disclosed). A SECURITY DEFINER helper would see both, but Postgres then grants
-- EXECUTE to PUBLIC, and any member could call it to ask "did X block me?", which is
-- the exact disclosure the policy refuses. Revoking that EXECUTE is not the fix
-- either: a security-definer view calling a function the invoking role cannot
-- execute segfaults the backend (signal 11, reproduced locally 2026-07-20).
-- So the predicate is inlined into the feed views instead. blocked_users is a TABLE
-- referenced by those views, so security_invoker = false covers it properly, and no
-- client-callable surface exists to probe.

-- Counter triggers below must UPDATE testimonies/prayers rows the caller has no
-- policy for, and must not trip the "counters are server-maintained" guard. They
-- raise this transaction-local flag around their write; the content guards read it
-- and step aside. Explicit beats inferring intent from pg_trigger_depth().
create function public.in_counter_write()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('agbc.counter_write', true), 'off') = 'on';
$$;

-- ---------------------------------------------------------------------------
-- testimony_categories: lookup, not an enum (product-facing and translatable;
-- the i18n label lives in the app bundle keyed by `key`, docs/spec/02).
-- ---------------------------------------------------------------------------

create table public.testimony_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.testimony_categories is
  'Translatable testimony categories (docs/spec/02); labels resolve from the app i18n bundle by key. Retire a category with active=false, never a delete: existing testimonies reference it.';

create index testimony_categories_active_sort_idx
  on public.testimony_categories (sort)
  where active;

alter table public.testimony_categories enable row level security;
alter table public.testimony_categories force row level security;

create policy "categories are publicly readable"
  on public.testimony_categories for select
  using (true);

create policy "admins manage categories"
  on public.testimony_categories for all
  using (public.caller_is_admin_live())
  with check (public.caller_is_admin_live());

create trigger testimony_categories_set_updated_at
  before update on public.testimony_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- prayers (created before testimonies: testimonies.from_prayer_id points here)
-- ---------------------------------------------------------------------------

create table public.prayers (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  -- The author's branch at post time; scopes the "My branch" feed and never
  -- re-buckets when they later move branch (docs/spec/02).
  branch_id uuid not null references public.branches (id),
  body text not null constraint prayers_body_not_blank check (length(btrim(body)) > 0),
  -- Declared at compose or detected server-side; drives the Everywhere-feed
  -- language label and moderation escalation. Not restricted to the four UI
  -- locales: members post in Yoruba too (docs/spec/02, 09).
  language text not null default 'en'
    constraint prayers_language_format check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  is_anonymous boolean not null default false,
  status public.content_status not null default 'pending',
  rejection_reason text,
  -- Art. 9 evidence (docs/spec/20): which consent wording the author agreed to.
  consent_version text not null,
  consented_at timestamptz not null default now(),
  answered_at timestamptz,
  praying_count integer not null default 0
    constraint prayers_praying_count_non_negative check (praying_count >= 0),
  prayed_count integer not null default 0
    constraint prayers_prayed_count_non_negative check (prayed_count >= 0),
  moderated_by uuid references public.profiles (id),
  moderated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.prayers is
  'Prayer requests (docs/spec/09). Born pending; public reads go through public.prayer_feed ONLY, which strips author identity when is_anonymous.';
comment on column public.prayers.praying_count is
  'Intercessors still committed. Trigger-maintained (docs/spec/02); no client may write it.';
comment on column public.prayers.prayed_count is
  'Intercessors who marked "I prayed". Trigger-maintained (docs/spec/02); no client may write it.';

-- Feed index leads with the scoping column or RLS gets slow (docs/spec/02).
create index prayers_branch_feed_idx
  on public.prayers (branch_id, status, created_at desc);
-- The Everywhere feed drops the branch filter.
create index prayers_public_feed_idx
  on public.prayers (created_at desc)
  where status = 'approved' and deleted_at is null;
create index prayers_author_id_idx on public.prayers (author_id);
create index prayers_moderated_by_idx on public.prayers (moderated_by);

alter table public.prayers enable row level security;
alter table public.prayers force row level security;

-- ---------------------------------------------------------------------------
-- testimonies
-- ---------------------------------------------------------------------------

create table public.testimonies (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  branch_id uuid not null references public.branches (id),
  body text not null constraint testimonies_body_not_blank check (length(btrim(body)) > 0),
  language text not null default 'en'
    constraint testimonies_language_format check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  category_id uuid references public.testimony_categories (id),
  -- Private bucket; signed URLs minted for approved rows only (docs/spec/02 Storage).
  image_url text,
  -- The single source of truth for the answered-prayer loop; the reverse link is a
  -- join, never a second FK to drift (docs/spec/02). UNIQUE stops double-claiming.
  from_prayer_id uuid unique references public.prayers (id) on delete set null,
  status public.content_status not null default 'pending',
  rejection_reason text,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  moderated_by uuid references public.profiles (id),
  moderated_at timestamptz,
  glory_count integer not null default 0
    constraint testimonies_glory_count_non_negative check (glory_count >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.testimonies is
  'Testimonies (docs/spec/09). Born pending; public reads go through public.testimony_feed ONLY.';
comment on column public.testimonies.glory_count is
  'Trigger-maintained (docs/spec/02); no client may write it. Nightly reconciliation fixes drift.';

create index testimonies_branch_feed_idx
  on public.testimonies (branch_id, status, created_at desc);
create index testimonies_public_feed_idx
  on public.testimonies (created_at desc)
  where status = 'approved' and deleted_at is null;
create index testimonies_author_id_idx on public.testimonies (author_id);
create index testimonies_category_id_idx on public.testimonies (category_id);
create index testimonies_moderated_by_idx on public.testimonies (moderated_by);

alter table public.testimonies enable row level security;
alter table public.testimonies force row level security;

-- ---------------------------------------------------------------------------
-- glory_reactions ("Glory to God" = the app's like)
-- ---------------------------------------------------------------------------

create table public.glory_reactions (
  id uuid primary key default gen_random_uuid(),
  testimony_id uuid not null references public.testimonies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (testimony_id, profile_id)
);

comment on table public.glory_reactions is
  'One reaction per member per testimony (docs/spec/09). Clients insert with ON CONFLICT DO NOTHING so offline replays of tap-untap-tap stay count-correct.';

create index glory_reactions_profile_id_idx on public.glory_reactions (profile_id);

alter table public.glory_reactions enable row level security;
alter table public.glory_reactions force row level security;

create policy "members read their own reactions"
  on public.glory_reactions for select
  using (profile_id = (select auth.uid()));

create policy "members react"
  on public.glory_reactions for insert
  with check (profile_id = (select auth.uid()) and public.caller_is_onboarded());

create policy "members take back their own reaction"
  on public.glory_reactions for delete
  using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- prayer_intercessions (two-step commitment: "I will pray" then "I prayed")
-- ---------------------------------------------------------------------------

create table public.prayer_intercessions (
  id uuid primary key default gen_random_uuid(),
  prayer_id uuid not null references public.prayers (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  state public.intercession_state not null default 'committed',
  committed_at timestamptz not null default now(),
  prayed_at timestamptz,
  -- Scheduled by the reminder job (W3.4, docs/spec/15); NULL means "not enrolled",
  -- which is where every row starts until that job lands. Never client-writable:
  -- otherwise a member could silence or spam reminders.
  next_reminder_at timestamptz,
  reminder_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prayer_id, profile_id),
  constraint prayer_intercessions_prayed_has_timestamp
    check ((state = 'prayed') = (prayed_at is not null))
);

comment on table public.prayer_intercessions is
  'The two-step commitment (docs/spec/09): "I will pray" inserts committed, "I prayed" transitions to prayed. One-way, trigger-enforced.';

create index prayer_intercessions_profile_id_idx
  on public.prayer_intercessions (profile_id);
-- The reminder job's read path (W3.4): due nudges, oldest first.
create index prayer_intercessions_due_idx
  on public.prayer_intercessions (next_reminder_at)
  where state = 'committed' and next_reminder_at is not null;

alter table public.prayer_intercessions enable row level security;
alter table public.prayer_intercessions force row level security;

create policy "members read their own commitments"
  on public.prayer_intercessions for select
  using (profile_id = (select auth.uid()));

create policy "members commit to pray"
  on public.prayer_intercessions for insert
  with check (profile_id = (select auth.uid()) and public.caller_is_onboarded());

create policy "members fulfil their own commitment"
  on public.prayer_intercessions for update
  using (profile_id = (select auth.uid()) and public.caller_is_onboarded())
  with check (profile_id = (select auth.uid()));

create policy "members withdraw their own commitment"
  on public.prayer_intercessions for delete
  using (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reports (moderation queue input)
--
-- Deviation from docs/spec/02, agreed 2026-07-20 and synced there in this change:
-- 02 specced a polymorphic (target_type, target_id) pair. Two real FKs + a CHECK
-- give the database actual referential integrity and ON DELETE CASCADE, so a report
-- can never outlive its target and the account-deletion job has no orphans to chase.
-- Cost: a third reportable type would need a migration. Worth it.
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  testimony_id uuid references public.testimonies (id) on delete cascade,
  prayer_id uuid references public.prayers (id) on delete cascade,
  -- Nullable and `set null`, not `cascade`: docs/spec/20 keeps reports for 24 months
  -- but ANONYMIZES the reporter when their account goes. Cascading would destroy the
  -- safeguarding record along with the account, which is the opposite of the rule.
  reporter_id uuid references public.profiles (id) on delete set null,
  reason text not null constraint reports_reason_not_blank check (length(btrim(reason)) > 0),
  status public.report_status not null default 'open',
  -- Removal does not end a safeguarding duty: flagged reports stay open even when
  -- the non-moderation auto-resolve sweeps the rest (docs/spec/02, 17, 20).
  is_safeguarding boolean not null default false,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_exactly_one_target check (num_nonnulls(testimony_id, prayer_id) = 1)
);

comment on table public.reports is
  'Report queue input (docs/spec/09, 17). Re-reporting the same item is a no-op for the reporter, enforced by the partial uniques below.';

create unique index reports_reporter_testimony_key
  on public.reports (reporter_id, testimony_id)
  where testimony_id is not null;
create unique index reports_reporter_prayer_key
  on public.reports (reporter_id, prayer_id)
  where prayer_id is not null;
create index reports_open_testimony_idx
  on public.reports (testimony_id)
  where status = 'open' and testimony_id is not null;
create index reports_open_prayer_idx
  on public.reports (prayer_id)
  where status = 'open' and prayer_id is not null;
create index reports_reporter_id_idx on public.reports (reporter_id);

alter table public.reports enable row level security;
alter table public.reports force row level security;

create policy "reporters read their own reports"
  on public.reports for select
  using (reporter_id = (select auth.uid()));

create policy "members report content"
  on public.reports for insert
  with check (reporter_id = (select auth.uid()) and public.caller_is_onboarded());

-- An anonymized report (reporter_id null after account deletion) belongs to nobody:
-- the reporter policies above match no caller, and only the branch moderators below
-- can still see it. That is the intended end state, not an accident.

-- Moderators see and action reports about content in their branch. The subqueries
-- resolve under the caller's own RLS on the content tables, which already scopes
-- them to their branch.
create policy "moderators read reports in their branch"
  on public.reports for select
  using (
    exists (
      select 1 from public.testimonies t
      where t.id = reports.testimony_id and public.can_moderate_branch(t.branch_id)
    )
    or exists (
      select 1 from public.prayers p
      where p.id = reports.prayer_id and public.can_moderate_branch(p.branch_id)
    )
  );

create policy "moderators action reports in their branch"
  on public.reports for update
  using (
    exists (
      select 1 from public.testimonies t
      where t.id = reports.testimony_id and public.can_moderate_branch(t.branch_id)
    )
    or exists (
      select 1 from public.prayers p
      where p.id = reports.prayer_id and public.can_moderate_branch(p.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.testimonies t
      where t.id = reports.testimony_id and public.can_moderate_branch(t.branch_id)
    )
    or exists (
      select 1 from public.prayers p
      where p.id = reports.prayer_id and public.can_moderate_branch(p.branch_id)
    )
  );

-- ===========================================================================
-- Write-path invariants (docs/spec/02). Each of these has a bypass attempt in
-- supabase/tests/009-family-invariants.sql that asserts failure.
-- ===========================================================================

-- "Is this thing published?", asked by the reaction guards. SECURITY DEFINER
-- because the asker is precisely someone who CANNOT read the row: a member's RLS on
-- testimonies covers their own rows and (as a leader) their branch's queue, so
-- checking under the caller's privileges would make every reaction to another
-- member's post look like a reaction to something that does not exist. Elevating one
-- boolean is the least privilege that works; elevating the whole guard is not.
-- (Declared here, after the tables: a SQL function body is validated at creation.)
create function public.testimony_is_published(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.testimonies t
    where t.id = target and t.status = 'approved' and t.deleted_at is null
  );
$$;

create function public.prayer_is_published(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.prayers p
    where p.id = target and p.status = 'approved' and p.deleted_at is null
  );
$$;

-- Same reason: an author undoing "answered" must be blocked by ANY live linked
-- testimony, including one an admin created from their request.
create function public.prayer_has_live_testimony(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.testimonies t
    where t.from_prayer_id = target and t.deleted_at is null
  );
$$;

-- Abuse ceiling from docs/spec/09: 5 testimonies + prayers combined per account per
-- rolling 24h (rolling, not calendar: a midnight-straddling burst is the same abuse).
create function public.assert_content_quota()
returns void
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
  recent integer;
begin
  if actor is null then
    return;
  end if;
  select
    (select count(*) from public.testimonies t
      where t.author_id = actor and t.created_at > now() - interval '24 hours')
    + (select count(*) from public.prayers p
      where p.author_id = actor and p.created_at > now() - interval '24 hours')
  into recent;
  if recent >= 5 then
    raise exception 'daily sharing limit reached'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- "The prayer-testimony link cannot be stolen" (docs/spec/02). Without this, anyone
-- could fabricate an "Answered prayer" ribbon on a stranger's prayer and, thanks to
-- the UNIQUE constraint, squat the link permanently.
create function public.assert_prayer_link_allowed(target_prayer uuid)
returns void
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
  prayer_author uuid;
  prayer_state public.content_status;
begin
  if target_prayer is null then
    return;
  end if;
  select p.author_id, p.status into prayer_author, prayer_state
  from public.prayers p
  where p.id = target_prayer;

  if prayer_state = 'removed' then
    raise exception 'a removed prayer cannot be linked to a testimony'
      using errcode = 'check_violation';
  end if;
  if actor is null or public.caller_is_admin_live() then
    return;
  end if;
  -- Null when the prayer exists but the caller cannot see it: same refusal, and it
  -- discloses nothing about whether the id is real.
  if prayer_author is distinct from actor then
    raise exception 'only the prayer''s author may link a testimony to it'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- --- testimonies -----------------------------------------------------------

create function public.testimonies_insert_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- No user context = service role, the deletion/sync jobs, seeds, or a direct
  -- connection. Those are already trusted; a real member request always has a uid.
  if actor is null then
    return new;
  end if;

  perform public.assert_content_quota();

  -- Authorship cannot be forged, and the branch comes from the profile, not the
  -- client (docs/spec/02). A missing profile row fails the NOT NULL: correct.
  new.author_id := actor;
  select p.branch_id into new.branch_id
  from public.profiles p
  where p.id = actor;

  -- Content is born pending, whatever the client sent.
  new.status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.rejection_reason := null;
  new.deleted_at := null;
  new.glory_count := 0;
  new.consented_at := coalesce(new.consented_at, now());

  perform public.assert_prayer_link_allowed(new.from_prayer_id);
  return new;
end;
$$;

create function public.testimonies_update_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
  is_author boolean;
  content_changed boolean;
  moderation_changed boolean;
begin
  -- The counter triggers update glory_count on rows the reacting member has no
  -- policy for; let that write through untouched (updated_at deliberately stays
  -- put, so a Glory tap never invalidates a leader's in-flight review token).
  if public.in_counter_write() then
    return new;
  end if;

  if actor is null then
    new.updated_at := now();
    return new;
  end if;

  if new.id is distinct from old.id
     or new.author_id is distinct from old.author_id
     or new.branch_id is distinct from old.branch_id
     or new.created_at is distinct from old.created_at
     or new.consent_version is distinct from old.consent_version
     or new.consented_at is distinct from old.consented_at then
    raise exception 'authorship, branch, and consent evidence are immutable'
      using errcode = 'check_violation';
  end if;
  if new.glory_count is distinct from old.glory_count then
    raise exception 'glory_count is maintained by triggers, not by clients'
      using errcode = 'check_violation';
  end if;

  is_author := old.author_id = actor;
  content_changed :=
    new.body is distinct from old.body
    or new.image_url is distinct from old.image_url
    or new.category_id is distinct from old.category_id
    or new.language is distinct from old.language
    or new.from_prayer_id is distinct from old.from_prayer_id;
  moderation_changed :=
    new.status is distinct from old.status
    or new.moderated_by is distinct from old.moderated_by
    or new.moderated_at is distinct from old.moderated_at
    or new.rejection_reason is distinct from old.rejection_reason;

  if content_changed then
    if not is_author then
      raise exception 'only the author may edit this testimony'
        using errcode = 'insufficient_privilege';
    end if;
    -- "removed is terminal for authors": edits refused, delete stays allowed.
    if old.status = 'removed' then
      raise exception 'removed content cannot be edited; only an admin may restore it'
        using errcode = 'insufficient_privilege';
    end if;
    perform public.assert_prayer_link_allowed(new.from_prayer_id);
    -- Any author edit re-enters moderation and leaves the public feed until it is
    -- re-approved (docs/spec/02, 09). Reactions are retained.
    new.status := 'pending';
    new.moderated_by := null;
    new.moderated_at := null;
    new.rejection_reason := null;
  elsif moderation_changed then
    if not public.can_moderate_branch(old.branch_id) then
      raise exception 'moderation is a leader or admin action'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'removed' and not public.caller_is_admin_live() then
      raise exception 'only an admin may restore removed content'
        using errcode = 'insufficient_privilege';
    end if;
    -- Compare-and-set (docs/spec/02): the moderator carries the updated_at of the
    -- version they reviewed. If the author edited in between, OLD has moved on.
    if new.updated_at is distinct from old.updated_at then
      raise exception 'content changed since review'
        using errcode = 'serialization_failure';
    end if;
    new.moderated_by := actor;
    new.moderated_at := now();
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and not is_author
     and not public.can_moderate_branch(old.branch_id) then
    raise exception 'only the author may delete this testimony'
      using errcode = 'insufficient_privilege';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Named so it sorts before any other BEFORE trigger on the table; the guard owns
-- updated_at itself rather than depending on a separate set_updated_at firing after.
create trigger testimonies_guard
  before insert on public.testimonies
  for each row execute function public.testimonies_insert_guard();

create trigger testimonies_update_guard
  before update on public.testimonies
  for each row execute function public.testimonies_update_guard();

-- --- prayers ---------------------------------------------------------------

create function public.prayers_insert_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    return new;
  end if;

  perform public.assert_content_quota();

  new.author_id := actor;
  select p.branch_id into new.branch_id
  from public.profiles p
  where p.id = actor;

  new.status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.rejection_reason := null;
  new.deleted_at := null;
  new.answered_at := null;
  new.praying_count := 0;
  new.prayed_count := 0;
  new.consented_at := coalesce(new.consented_at, now());
  return new;
end;
$$;

create function public.prayers_update_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
  is_author boolean;
  content_changed boolean;
  moderation_changed boolean;
begin
  if public.in_counter_write() then
    return new;
  end if;

  if actor is null then
    new.updated_at := now();
    return new;
  end if;

  if new.id is distinct from old.id
     or new.author_id is distinct from old.author_id
     or new.branch_id is distinct from old.branch_id
     or new.created_at is distinct from old.created_at
     or new.consent_version is distinct from old.consent_version
     or new.consented_at is distinct from old.consented_at then
    raise exception 'authorship, branch, and consent evidence are immutable'
      using errcode = 'check_violation';
  end if;
  if new.praying_count is distinct from old.praying_count
     or new.prayed_count is distinct from old.prayed_count then
    raise exception 'prayer counts are maintained by triggers, not by clients'
      using errcode = 'check_violation';
  end if;

  is_author := old.author_id = actor;
  -- is_anonymous is deliberately NOT here: flipping your own identity on an approved
  -- request does not re-enter moderation (docs/spec/02). It still broadcasts, so
  -- live clients re-render, and the app requires a confirm sheet going anonymous ->
  -- named. Everything else an author can edit re-pends the row.
  content_changed :=
    new.body is distinct from old.body
    or new.language is distinct from old.language;
  moderation_changed :=
    new.status is distinct from old.status
    or new.moderated_by is distinct from old.moderated_by
    or new.moderated_at is distinct from old.moderated_at
    or new.rejection_reason is distinct from old.rejection_reason;

  if new.is_anonymous is distinct from old.is_anonymous and not is_author then
    raise exception 'only the author may change the anonymity of a request'
      using errcode = 'insufficient_privilege';
  end if;

  -- Mark answered / not answered, with the preconditions checked server-side
  -- (docs/spec/02, 09): the UI offering the action is not the mechanism.
  if new.answered_at is distinct from old.answered_at then
    if not is_author then
      raise exception 'only the author may mark a request answered'
        using errcode = 'insufficient_privilege';
    end if;
    if new.answered_at is not null then
      if old.status <> 'approved' or old.deleted_at is not null then
        raise exception 'only an approved, live request can be marked answered'
          using errcode = 'check_violation';
      end if;
    elsif public.prayer_has_live_testimony(old.id) then
      raise exception 'delete the linked testimony before marking this request unanswered'
        using errcode = 'check_violation';
    end if;
  end if;

  if content_changed then
    if not is_author then
      raise exception 'only the author may edit this request'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'removed' then
      raise exception 'removed content cannot be edited; only an admin may restore it'
        using errcode = 'insufficient_privilege';
    end if;
    new.status := 'pending';
    new.moderated_by := null;
    new.moderated_at := null;
    new.rejection_reason := null;
  elsif moderation_changed then
    if not public.can_moderate_branch(old.branch_id) then
      raise exception 'moderation is a leader or admin action'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'removed' and not public.caller_is_admin_live() then
      raise exception 'only an admin may restore removed content'
        using errcode = 'insufficient_privilege';
    end if;
    if new.updated_at is distinct from old.updated_at then
      raise exception 'content changed since review'
        using errcode = 'serialization_failure';
    end if;
    new.moderated_by := actor;
    new.moderated_at := now();
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and not is_author
     and not public.can_moderate_branch(old.branch_id) then
    raise exception 'only the author may delete this request'
      using errcode = 'insufficient_privilege';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger prayers_guard
  before insert on public.prayers
  for each row execute function public.prayers_insert_guard();

create trigger prayers_update_guard
  before update on public.prayers
  for each row execute function public.prayers_update_guard();

-- --- prayers: RLS (base table is author + moderator only; see the header note) ---

create policy "authors read their own requests"
  on public.prayers for select
  using (author_id = (select auth.uid()));

create policy "moderators read requests in their branch"
  on public.prayers for select
  using (public.can_moderate_branch(branch_id));

create policy "members share a request"
  on public.prayers for insert
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and public.caller_is_onboarded()
  );

create policy "authors update their own requests"
  on public.prayers for update
  using (author_id = (select auth.uid()) and public.caller_is_onboarded())
  with check (author_id = (select auth.uid()));

create policy "moderators update requests in their branch"
  on public.prayers for update
  using (public.can_moderate_branch(branch_id))
  with check (public.can_moderate_branch(branch_id));

create policy "authors delete their own requests"
  on public.prayers for delete
  using (author_id = (select auth.uid()));

-- --- testimonies: RLS ------------------------------------------------------

create policy "authors read their own testimonies"
  on public.testimonies for select
  using (author_id = (select auth.uid()));

create policy "moderators read testimonies in their branch"
  on public.testimonies for select
  using (public.can_moderate_branch(branch_id));

create policy "members share a testimony"
  on public.testimonies for insert
  with check (
    author_id = (select auth.uid())
    and status = 'pending'
    and public.caller_is_onboarded()
  );

create policy "authors update their own testimonies"
  on public.testimonies for update
  using (author_id = (select auth.uid()) and public.caller_is_onboarded())
  with check (author_id = (select auth.uid()));

create policy "moderators update testimonies in their branch"
  on public.testimonies for update
  using (public.can_moderate_branch(branch_id))
  with check (public.can_moderate_branch(branch_id));

create policy "authors delete their own testimonies"
  on public.testimonies for delete
  using (author_id = (select auth.uid()));

-- --- glory_reactions: forgery guard + counter ------------------------------

create function public.glory_reactions_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  new.profile_id := (select auth.uid());
  if not public.testimony_is_published(new.testimony_id) then
    raise exception 'you can only respond to a published testimony'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger glory_reactions_guard
  before insert on public.glory_reactions
  for each row execute function public.glory_reactions_insert_guard();

-- SECURITY DEFINER: the reacting member has no UPDATE policy on someone else's
-- testimony, and must not get one. The transaction-local flag lets the content
-- guard distinguish this write from a client trying to inflate its own count.
create function public.glory_reactions_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('agbc.counter_write', 'on', true);
  if tg_op = 'INSERT' then
    update public.testimonies
      set glory_count = glory_count + 1
      where id = new.testimony_id;
  else
    update public.testimonies
      set glory_count = greatest(glory_count - 1, 0)
      where id = old.testimony_id;
  end if;
  perform set_config('agbc.counter_write', 'off', true);
  return null;
end;
$$;

create trigger glory_reactions_count
  after insert or delete on public.glory_reactions
  for each row execute function public.glory_reactions_count();

-- --- prayer_intercessions: state machine + counters ------------------------

create function public.prayer_intercessions_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  new.profile_id := (select auth.uid());
  -- Every commitment starts at committed; the schedule is the server's to set.
  new.state := 'committed';
  new.committed_at := now();
  new.prayed_at := null;
  new.reminder_count := 0;
  new.next_reminder_at := null;
  if not public.prayer_is_published(new.prayer_id) then
    raise exception 'you can only commit to pray for a published request'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function public.prayer_intercessions_update_guard()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is null then
    new.updated_at := now();
    return new;
  end if;

  if new.prayer_id is distinct from old.prayer_id
     or new.profile_id is distinct from old.profile_id
     or new.committed_at is distinct from old.committed_at then
    raise exception 'a commitment cannot be reassigned or backdated'
      using errcode = 'check_violation';
  end if;
  -- The reminder schedule is the server's: a client that could write these could
  -- silence its own nudges or, worse, reschedule them.
  if new.next_reminder_at is distinct from old.next_reminder_at
     or new.reminder_count is distinct from old.reminder_count then
    raise exception 'the reminder schedule is server-controlled'
      using errcode = 'check_violation';
  end if;
  if old.state = 'prayed' then
    raise exception 'this commitment is already fulfilled'
      using errcode = 'check_violation';
  end if;
  if new.state is not distinct from old.state then
    raise exception 'the only allowed change is committed to prayed'
      using errcode = 'check_violation';
  end if;

  new.state := 'prayed';
  new.prayed_at := now();
  -- Fulfilment stops the reminders (docs/spec/09).
  new.next_reminder_at := null;
  new.updated_at := now();
  return new;
end;
$$;

create trigger prayer_intercessions_guard
  before insert on public.prayer_intercessions
  for each row execute function public.prayer_intercessions_insert_guard();

create trigger prayer_intercessions_update_guard
  before update on public.prayer_intercessions
  for each row execute function public.prayer_intercessions_update_guard();

create function public.prayer_intercessions_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('agbc.counter_write', 'on', true);
  if tg_op = 'INSERT' then
    -- A client always inserts 'committed' (the insert guard forces it); seeds and
    -- the deletion/backfill jobs may insert an already-fulfilled row directly.
    if new.state = 'committed' then
      update public.prayers
        set praying_count = praying_count + 1
        where id = new.prayer_id;
    else
      update public.prayers
        set prayed_count = prayed_count + 1
        where id = new.prayer_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.state = 'committed' then
      update public.prayers
        set praying_count = greatest(praying_count - 1, 0)
        where id = old.prayer_id;
    else
      update public.prayers
        set prayed_count = greatest(prayed_count - 1, 0)
        where id = old.prayer_id;
    end if;
  elsif old.state = 'committed' and new.state = 'prayed' then
    -- The "I prayed" tap moves the member from praying into prayed (docs/spec/02).
    update public.prayers
      set praying_count = greatest(praying_count - 1, 0),
          prayed_count = prayed_count + 1
      where id = new.prayer_id;
  end if;
  perform set_config('agbc.counter_write', 'off', true);
  return null;
end;
$$;

create trigger prayer_intercessions_count
  after insert or update or delete on public.prayer_intercessions
  for each row execute function public.prayer_intercessions_count();

-- --- blocked_users / reports: forgery guards -------------------------------

create function public.blocked_users_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  new.blocker_id := (select auth.uid());
  return new;
end;
$$;

create trigger blocked_users_guard
  before insert on public.blocked_users
  for each row execute function public.blocked_users_insert_guard();

create function public.reports_insert_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
  recent integer;
begin
  if actor is null then
    return new;
  end if;
  -- Blunts queue-flooding (docs/spec/09): 20 reports per reporter per rolling 24h.
  select count(*) into recent
  from public.reports r
  where r.reporter_id = actor and r.created_at > now() - interval '24 hours';
  if recent >= 20 then
    raise exception 'daily report limit reached'
      using errcode = 'check_violation';
  end if;

  new.reporter_id := actor;
  new.status := 'open';
  new.resolution_note := null;
  -- Safeguarding is a leader's classification, not the reporter's claim.
  new.is_safeguarding := false;
  return new;
end;
$$;

create function public.reports_update_guard()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is null then
    new.updated_at := now();
    return new;
  end if;
  if new.reporter_id is distinct from old.reporter_id
     or new.testimony_id is distinct from old.testimony_id
     or new.prayer_id is distinct from old.prayer_id
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at then
    raise exception 'a report''s subject and author are immutable'
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger reports_guard
  before insert on public.reports
  for each row execute function public.reports_insert_guard();

create trigger reports_update_guard
  before update on public.reports
  for each row execute function public.reports_update_guard();

-- ===========================================================================
-- Public read path: the feed views.
--
-- security_invoker = false ON PURPOSE. These views run as their owner and bypass
-- the base tables' RLS, so the WHERE clauses below ARE the public-visibility
-- boundary: approved, not deleted, not blocked in either direction. That is what
-- lets prayer_feed hand back a row whose author_id is NULL when is_anonymous, which
-- row-level security alone cannot do (it filters rows, never columns). The base
-- tables grant anon nothing at all, so this is the only door.
-- ===========================================================================

create view public.testimony_feed
with (security_invoker = false) as
select
  t.id,
  t.branch_id,
  t.body,
  t.language,
  t.category_id,
  c.key as category_key,
  t.image_url,
  t.from_prayer_id,
  t.glory_count,
  t.created_at,
  t.updated_at,
  t.author_id,
  a.display_name as author_name,
  a.avatar_url as author_avatar_url,
  -- The ribbon is a LINK only while the origin prayer is itself publicly visible;
  -- otherwise the app degrades it to a static label (docs/spec/09).
  (
    select p.id from public.prayers p
    where p.id = t.from_prayer_id
      and p.status = 'approved'
      and p.deleted_at is null
  ) as origin_prayer_id
from public.testimonies t
join public.profiles a on a.id = t.author_id
left join public.testimony_categories c on c.id = t.category_id
where t.status = 'approved'
  and t.deleted_at is null
  -- Two-way block filter, inlined (see the note above the counter helpers). A guest
  -- has no auth.uid(), so blocks nobody and is blocked by nobody.
  and not exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = t.author_id)
       or (b.blocked_id = (select auth.uid()) and b.blocker_id = t.author_id)
  );

comment on view public.testimony_feed is
  'The ONLY public read path for testimonies (docs/spec/09). Security-definer by design: this WHERE clause is the public-visibility boundary.';

create view public.prayer_feed
with (security_invoker = false) as
select
  p.id,
  p.branch_id,
  p.body,
  p.language,
  p.is_anonymous,
  p.answered_at,
  p.praying_count,
  p.prayed_count,
  p.created_at,
  p.updated_at,
  -- Anonymity is enforced HERE, server-side. The UI showing "A member" is
  -- presentation; this is the mechanism (docs/spec/02, 09, 20).
  case when p.is_anonymous then null else p.author_id end as author_id,
  case when p.is_anonymous then null else a.display_name end as author_name,
  case when p.is_anonymous then null else a.avatar_url end as author_avatar_url,
  (
    select t.id from public.testimonies t
    where t.from_prayer_id = p.id
      and t.status = 'approved'
      and t.deleted_at is null
  ) as answer_testimony_id
from public.prayers p
join public.profiles a on a.id = p.author_id
where p.status = 'approved'
  and p.deleted_at is null
  and not exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id)
       or (b.blocked_id = (select auth.uid()) and b.blocker_id = p.author_id)
  );

comment on view public.prayer_feed is
  'The ONLY public read path for prayers (docs/spec/09). Strips author identity when is_anonymous: author_id never leaves the database for an anonymous request.';

-- ===========================================================================
-- Explicit privileges. RLS is the row boundary; GRANTs are the table boundary.
-- The REVOKEs are load-bearing: Supabase's default privileges would otherwise hand
-- anon SELECT on every new table, which is exactly what the views exist to prevent.
-- ===========================================================================

revoke all on
  public.testimonies, public.prayers, public.glory_reactions,
  public.prayer_intercessions, public.reports, public.blocked_users,
  public.testimony_categories
  from anon, authenticated;

-- Guests read the feeds and the category lookup, and nothing else.
grant select on public.testimony_feed, public.prayer_feed to anon, authenticated;
grant select on public.testimony_categories to anon, authenticated;

-- Members reach the base tables for their own rows and (as leaders) their branch's
-- queue; RLS decides which rows that actually is.
grant select, insert, update, delete on public.testimonies, public.prayers
  to authenticated;
grant select, insert, delete on public.glory_reactions to authenticated;
grant select, insert, update, delete on public.prayer_intercessions to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select, insert, delete on public.blocked_users to authenticated;

grant all on
  public.testimonies, public.prayers, public.glory_reactions,
  public.prayer_intercessions, public.reports, public.blocked_users,
  public.testimony_categories
  to service_role;
grant select on public.testimony_feed, public.prayer_feed to service_role;

-- The SECURITY DEFINER helpers above keep their default EXECUTE deliberately: they
-- are called from BEFORE INSERT/UPDATE trigger functions, which run as the CALLER,
-- so the caller needs it. What they disclose (is this content published, does this
-- request already have an answer) is on the public feed anyway.
