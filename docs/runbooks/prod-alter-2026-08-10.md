# Prod ALTER: course_registrations gains the app's columns

**Date:** 2026-08-10 · **Project:** `fotfplvqsnmbzjjhqlwp` (the SHARED prod project) · **Approved:** Ayo, in-session, after script review · **Gate:** Track P P1 (nightly off-provider dump + verified restore), landed the same day; the freshest successful backup run preceded the ALTER by ~4.5h.

The reviewed prod step ADR 0017 decision 11 deferred: prod's `course_registrations`
(shared with the LIVE website) gains the app's additive second block, so the table
matches the merged shape the migrations folder has carried since W2.9 slice 2
(`20260809202000`) and agbc-website#42's regenerated types tell the truth.

## What ran

Applied via the Supabase connector's migration mechanism, so prod's own
`supabase_migrations.schema_migrations` records it (version `..._course_registrations_app_columns`;
the eventual `19` step-6 baseline must reckon with this entry alongside the 35
retired-app migrations).

```sql
create type public.course_registration_status as enum
  ('pending', 'confirmed', 'cancelled');
create type public.course_registration_source as enum
  ('app', 'website', 'import');
create type public.course_registration_link_method as enum
  ('handoff', 'email_auto', 'self', 'leader');

alter table public.course_registrations
  add column profile_id uuid,
  add column status public.course_registration_status not null default 'pending',
  add column notes text,
  add column source public.course_registration_source not null default 'website',
  add column course_id uuid,
  add column branch_id uuid,
  add column linked_by uuid,
  add column linked_at timestamptz,
  add column link_method public.course_registration_link_method;

comment on column public.course_registrations.profile_id is
  'The member this registration belongs to. Server-written only (ADR 0015/0017). FK to profiles arrives with the 19 cutover.';

create index course_registrations_profile_idx on public.course_registrations (profile_id);
create index course_registrations_course_id_idx on public.course_registrations (course_id);
create index course_registrations_branch_id_idx on public.course_registrations (branch_id);
create index course_registrations_linked_by_idx on public.course_registrations (linked_by);
create index course_registrations_email_idx on public.course_registrations (lower(trim(email)));

create unique index course_registrations_active_enrolment_uniq
  on public.course_registrations (course_id, profile_id)
  where status <> 'cancelled';
```

## What deliberately did NOT run (arrives with the full `19` cutover)

- **No foreign keys**: `profiles`, `courses`, `branches` do not exist on prod yet, and
  FK-ing the new columns to the retired app's tables would be wrong.
- **No triggers, guards, audit, policies, or grant changes**: they reference functions
  and tables from the app schema. The table stays RLS-on with ZERO policies; the
  website's service key remains the only writer, exactly as the 2026-07-30 audit
  recorded. The issue #96 grant fragility is neither widened nor fixed here.
- **No `redeem_course_handoff`, no `course_handoff_tokens`**: the website's flag
  (`COURSE_HANDOFF_ENABLED`) therefore stays OFF. Flipping it early is harmless
  (agbc-website#42 resolves every handoff failure to an unlinked registration) but
  pointless: tokens are minted in the app's database, which is not prod until the
  cutover points app builds at prod.

## Pre-flight evidence (read-only, same session)

- Prod table had exactly the website's 13 columns; no `course_registration_*` enum
  name existed (retired-app enums are `meeting_status`, `user_role`, ...).
- 4 rows: 3 `grace-reset` + 1 `grace-masterclass`, all `payment_status='paid'`,
  created 2026-06-25.
- `backup.yml` had a successful run at 11:09 UTC the same day.

## Post-apply verification (same session)

| Check | Result |
|---|---|
| Column count | 22 (13 + 9) |
| Rows | 4, all backfilled `status='pending'`, `source='website'`, `profile_id` null |
| Indexes | 8 (`_pkey`, `stripe_session_id` unique, + the 6 new) |
| RLS | on, 0 policies (unchanged) |

Backfill decision (Ayo, 2026-08-10): the 4 paid June rows stay `pending`; the church
confirms enrolments via the Phase C dashboard (or a later reviewed step).

## What this unblocks

- **agbc-website#42 can merge now, flag off** (its regenerated `database.types.ts`
  now tells the truth about prod).
- The `COURSE_HANDOFF_ENABLED` flip waits for the `19` cutover (app schema + RPC on
  prod + app builds pointed at prod).
- The claim/link machinery (`email_claims`, `profile_emails`, the linking pass) also
  arrives with the cutover; until then the 4 rows stay unlinked, which is fine: they
  are invisible to every API caller (no policies) and the app is not on prod.
