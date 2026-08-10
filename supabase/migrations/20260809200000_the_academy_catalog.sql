-- The Academy catalog (W2.9 slice 2; docs/spec/13, docs/spec/02 §Academy, ADR 0017).
--
-- Three tables, none of them shared with the website: the course catalog itself, the
-- regional fee overrides, and "notify me" interest. The shared table
-- (course_registrations) has its own migration, because it carries the fence decision
-- and deserves to be read on its own.
--
-- Content localization: the website's course content is ALREADY translated into all
-- four languages (Desktop/agbc src/content/courses/*.json stores prose as
-- {en, de, nl, fr} objects), so the columns that carry prose here are jsonb keyed by
-- locale rather than the `text` that `02` sketched. Throwing away three existing
-- translations to satisfy a column type would make W4.6 (the localization pass) a
-- schema change instead of a copy review; `02` is corrected in this PR. Names, level
-- ordinals, step lines and outline titles stay plain strings, deliberately matching
-- the website's own "deliberately plain" list (proper nouns and scripture references
-- are not translated).

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  -- The website's content slug ('grace-reset'); course_registrations.course stores
  -- exactly this value, so it is the join key between the two worlds.
  slug text not null unique,
  name text not null,
  -- Display ordinal from the academy JSON: '01', '02', '+' for the upcoming tail.
  level text not null,
  level_name text not null,
  step text not null default '',
  -- Localized {en, de, nl, fr} prose: the COURSE detail summary.
  summary jsonb not null,
  -- The ACADEMY pathway card's own blurb (the academy/*.json summary), written for the
  -- level list rather than the detail screen. Falls back to `summary` when null.
  pathway_summary jsonb,
  -- [{title, body: {en,...}, scripture?, special?}]; titles and scripture stay plain.
  outline jsonb not null default '[]'::jsonb,
  -- [{en, de, nl, fr}, ...]
  gains jsonb not null default '[]'::jsonb,
  -- {intensive: {en,...}, part_time: {en,...}} localized durations for the meta row
  -- (docs/spec/13 COURSE). Null for upcoming levels that have no course file yet.
  formats jsonb,
  prereq_slug text references public.courses (slug),
  -- Money in minor units + explicit ISO 4217 code, never symbol-in-jsonb (`02`).
  -- Null for upcoming levels: fee unknown until the course opens.
  fee_minor integer,
  fee_currency char(3),
  -- Localized {en, de, nl, fr}: "workbook included".
  fee_note jsonb,
  upcoming boolean not null default false,
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courses_fee_pair check ((fee_minor is null) = (fee_currency is null)),
  constraint courses_fee_positive check (fee_minor is null or fee_minor > 0)
);

comment on table public.courses is
  'The Grace Academy catalog (docs/spec/13). Seeded from the website''s content files by scripts/convert-course-seeds.mjs; the app and the website describe the same courses because they are generated from the same source.';
comment on column public.courses.slug is
  'The website''s content slug. course_registrations.course (text, written by the website) carries this same value; the resolve trigger there uses it to fill course_id.';

create index courses_prereq_slug_idx on public.courses (prereq_slug);

create table public.course_fees_regional (
  course_id uuid not null references public.courses (id) on delete cascade,
  -- ISO 3166-1 alpha-2, uppercase ('NG').
  country_code char(2) not null,
  fee_minor integer not null,
  currency char(3) not null,
  created_at timestamptz not null default now(),
  primary key (course_id, country_code),
  constraint course_fees_regional_fee_positive check (fee_minor > 0)
);

comment on table public.course_fees_regional is
  'Regional fee overrides (docs/spec/02): the NG rows from the website''s fee.regions. Display only in the app; the website recomputes its own price server-side at checkout.';

create table public.course_interest (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- "Notify me" is a fact, not a counter (docs/spec/13): once per member per course.
  constraint course_interest_unique unique (course_id, profile_id)
);

comment on table public.course_interest is
  '"Notify me when this opens" (docs/spec/13). The ONE member write in the Academy domain (ADR 0017 decision 6): free, and with no website equivalent. Consumed by the dashboard''s notify action (docs/spec/17 §4).';

-- course_id leads the unique constraint; the other FK gets its own index (`02`).
create index course_interest_profile_idx on public.course_interest (profile_id);

/**
 * Identity cannot be forged (docs/spec/02 invariants), same shape as rsvps_insert_guard:
 * no user context means a seed, a test or a job, which are already trusted.
 */
create function public.course_interest_insert_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    return new;
  end if;
  new.profile_id := actor;
  return new;
end;
$$;

create trigger course_interest_guard
  before insert on public.course_interest
  for each row execute function public.course_interest_insert_guard();

-- --- who may read and write what -------------------------------------------------------

alter table public.courses enable row level security;
alter table public.courses force row level security;
alter table public.course_fees_regional enable row level security;
alter table public.course_fees_regional force row level security;
alter table public.course_interest enable row level security;
alter table public.course_interest force row level security;

-- Browsing never requires auth (docs/spec/02 matrix rows 57/60): the catalog and its
-- fees are public reads.
create policy "courses are publicly readable"
  on public.courses for select
  using (true);

create policy "regional fees are publicly readable"
  on public.course_fees_regional for select
  using (true);

-- No client write policy on the catalog: content arrives via the seed script now and
-- the Phase C dashboard (service-role routes) later.

create policy "members read their own interest"
  on public.course_interest for select
  using (profile_id = (select auth.uid()));

create policy "members register interest"
  on public.course_interest for insert
  with check (profile_id = (select auth.uid()) and public.caller_is_onboarded());

-- Changing your mind is a DELETE, not a status: interest is a fact with no history
-- worth keeping (docs/spec/13).
create policy "members withdraw their own interest"
  on public.course_interest for delete
  using (profile_id = (select auth.uid()));

-- Leaders see interest from their own branch's members (docs/spec/02 matrix row 59).
-- The profiles subquery runs under the LEADER's own RLS, which grants in-branch reads,
-- so an out-of-branch member's interest is simply invisible rather than specially denied.
create policy "moderators read interest in their branch"
  on public.course_interest for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = profile_id
        and public.can_moderate_branch(p.branch_id)
    )
  );

create policy "admins read all interest"
  on public.course_interest for select
  using (public.caller_is_admin_live());

-- Start from zero, then hand back exactly the verbs each role needs (issue #96: the
-- project bootstrap grants ALL on new tables to anon and authenticated).
revoke all on public.courses, public.course_fees_regional, public.course_interest
  from anon, authenticated;

grant select on public.courses, public.course_fees_regional to anon, authenticated;
grant select, insert, delete on public.course_interest to authenticated;
