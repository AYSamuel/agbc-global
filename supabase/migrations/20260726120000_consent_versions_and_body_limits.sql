-- W2.3 · Compose slice, part 1: real Art. 9 consent evidence + a ceiling on body text.
--
-- Until now `testimonies.consent_version` and `prayers.consent_version` were free text
-- with no default and nothing checking them, so the row recorded whatever string the
-- client chose to send. That makes the GDPR Art. 9(2)(a) record (docs/spec/20 §Consent
-- mechanics) only as trustworthy as the app that wrote it, and unusable at the moment it
-- actually matters: a subject access request, or a regulator asking WHICH wording a
-- member agreed to. This migration turns the column into a real reference.
--
-- Rollback plan: drop the two FK constraints and the assert, then drop the table. The
-- body-length CHECKs revert by restoring the not-blank constraints.

-- ---------------------------------------------------------------------------
-- consent_versions
-- ---------------------------------------------------------------------------

create table public.consent_versions (
  version text primary key,
  published_at timestamptz not null default now(),
  -- Retired versions stay referenceable forever: the rows already carrying them ARE
  -- the retained evidence (docs/spec/20 retention table, "kept on the anonymized row").
  -- active=false only stops NEW consent being recorded against superseded wording.
  active boolean not null default true,
  notes text
);

comment on table public.consent_versions is
  'The consent wordings a member can agree to when sharing (docs/spec/20 Art. 9). The wording text itself lives in the app i18n bundle in four languages, pinned to these keys by a hash test in apps/mobile; changing any locale''s consent copy without minting a new version fails CI. Retire a version with active=false, never a delete: existing rows reference it as evidence.';
comment on column public.consent_versions.active is
  'Only an active version may be recorded on a NEW post. Retiring a version breaks any app build still shipping it, so retire only after app_config.minimum_supported_version has moved past those builds (docs/spec/21 §8 forced update).';

alter table public.consent_versions enable row level security;
alter table public.consent_versions force row level security;

-- Readable by everyone (a guest reads the wording on the way into the gate); writable
-- by nobody through the API. New versions ship as migrations, reviewed like code.
create policy "consent versions are publicly readable"
  on public.consent_versions for select
  using (true);

revoke all on public.consent_versions from anon, authenticated;
grant select on public.consent_versions to anon, authenticated;
grant all on public.consent_versions to service_role;

-- The first wording (W2.3). This row lives in the MIGRATION and not in
-- supabase/seeds/00-common.sql on purpose: `supabase db push` carries migrations to dev
-- and prod but never the seed files (docs/spec/23 §1), and without an active version the
-- entire compose write path is dead. Categories can live in seeds because a category is
-- optional; consent is not.
insert into public.consent_versions (version, notes)
values (
  'content-share-v1',
  'Initial compose consent wording (W2.3): shared publicly with the family, reviewed by a branch leader first, editable and deletable by the author, plus the photo-permission reminder from docs/spec/20.'
)
on conflict (version) do nothing;

-- Any version already sitting on a row predates this table (dev/preview data seeded
-- before W2.3). Adopt it as inactive rather than letting the FK fail the deploy: the
-- historical evidence is what it is, and marking it inactive stops it being reused.
insert into public.consent_versions (version, active, notes)
select distinct existing.consent_version, false,
       'Backfilled by the W2.3 migration from a pre-existing row; the wording shown was not recorded.'
from (
  select consent_version from public.testimonies
  union
  select consent_version from public.prayers
) as existing
on conflict (version) do nothing;

alter table public.testimonies
  add constraint testimonies_consent_version_fkey
  foreign key (consent_version) references public.consent_versions (version);

alter table public.prayers
  add constraint prayers_consent_version_fkey
  foreign key (consent_version) references public.consent_versions (version);

create index testimonies_consent_version_idx on public.testimonies (consent_version);
create index prayers_consent_version_idx on public.prayers (consent_version);

-- The FK proves the version EXISTS; this proves it is the one currently on offer. It
-- lives in the insert guards rather than a CHECK because a CHECK would also re-validate
-- old rows on every update and retroactively invalidate retained evidence.
create function public.assert_consent_version_active(target text)
returns void
language plpgsql
stable
as $$
begin
  if not exists (
    select 1 from public.consent_versions v
    where v.version = target and v.active
  ) then
    raise exception 'consent wording % is not the current version', target
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Body ceilings (docs/spec/09, synced in this PR)
-- ---------------------------------------------------------------------------
-- Unbounded UGC text is both an abuse vector and a feed-card problem: one paste makes a
-- card unreadable and there is no server-side ceiling on what a member can store. The
-- numbers are mirrored in packages/shared/src/contracts/family.ts.

alter table public.testimonies drop constraint testimonies_body_not_blank;
alter table public.testimonies
  add constraint testimonies_body_length
  check (length(btrim(body)) between 1 and 2000);

alter table public.prayers drop constraint prayers_body_not_blank;
alter table public.prayers
  add constraint prayers_body_length
  check (length(btrim(body)) between 1 and 1000);

-- ---------------------------------------------------------------------------
-- Guards: consent must be current on the way in.
-- ---------------------------------------------------------------------------
-- Both bodies are the W0.10/W1.5 originals with one added assert; re-emitted in full
-- because `create or replace function` takes no patches.

create or replace function public.testimonies_insert_guard()
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
  perform public.assert_consent_version_active(new.consent_version);

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

create or replace function public.prayers_insert_guard()
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
  perform public.assert_consent_version_active(new.consent_version);

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
