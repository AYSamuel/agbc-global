# Production audit: the shared Supabase project (`19` steps 1-2)

**Date:** 2026-07-30 · **Project:** `agbc-app` / `fotfplvqsnmbzjjhqlwp` · eu-central-1 · Postgres 17.6 · Free plan
**Method:** read-only. Listed and queried via the Supabase connector; nothing was written, altered, dropped or unscheduled.
**Keep decision:** Ayo, 2026-07-30. Keep `donations` and `course_registrations`; keep app-version tracking and daily verses as capabilities; rebuild everything else on the new app's terms.

This closes `19` steps 1 (audit) and 2 (fence). The fenced list lives in the project `CLAUDE.md`; this file is the evidence behind it and the ordered plan for step 4 onward.

## What this project actually is

`19` describes "a shared project where the website uses roughly 3 tables and everything else belongs to Grace Portal". The audit corrects that in three ways:

1. **The website uses exactly 2 tables**, `donations` and `course_registrations`, verified by grepping the website repo (`Desktop/agbc`) rather than from memory as `19` step 1 requires. Six files touch Supabase; no storage, no RPC. Its client lives under `src/lib/server/`, so it reads and writes with the service key, which is why `course_registrations` works with RLS on and zero policies.
2. **The project is already migration-managed.** 35 migrations dated 2026-01-30 to 2026-02-05 are recorded in `supabase_migrations.schema_migrations`. The baseline strategy in `19` step 6 has to reckon with an existing history, not an unmanaged database.
3. **`19` never mentions cron, and there are 6 active jobs**, one firing every minute, with 5,533 rows of run history. They are the retired app's notification machinery and they are the main sequencing hazard in the cleanup.

## Inventory

### Tables (`public`)

| Table | Rows | Disposition |
|---|---|---|
| `donations` | 12 | **FENCE** (website) |
| `course_registrations` | 4 | **FENCE** (website) |
| `daily_verses` | 57 | **DROP after carrying content** (see below) |
| `users` | 8 | DROP. Referenced by a fenced policy, see trap 1 |
| `user_devices` | 11 | DROP |
| `app_versions` | 2 | DROP. Capability replaced, see below |
| `meetings` | 2 | DROP |
| `notifications` | 1 | DROP |
| `audit_logs` | 1 | DROP |
| `church_branches` | 0 | DROP (replaced by `branches`) |
| `tasks`, `task_comments`, `meeting_responses`, `notification_receipts`, `scheduled_notifications` | 0 | DROP |

Also: 48 functions, 21 triggers, 42 policies, 1 view, 8 auth users, the `avatars` bucket (public, 7 objects), extensions `http`, `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp`, and Vault secrets (a migration named `update_vault_secret_name` implies at least one).

### Cron jobs (all active, all succeeding)

| Job | Schedule | Calls |
|---|---|---|
| `process-scheduled-notifications-v2` | every minute | `public.invoke_process_scheduled_notifications_v2()` |
| `expire-scheduled-notifications` | every 5 min | `public.expire_scheduled_notifications()` |
| `process-upcoming-notifications` | every 10 min | `public.process_all_upcoming_notifications()` |
| `purge-system-logs` | hourly | `public.purge_system_logs()` |
| `cleanup_old_notifications` | daily 03:00 | `public.cleanup_old_notifications()` |
| `maintain-recurring-meetings` | weekly Sun 02:00 | `public.maintain_recurring_meetings()` |

All six belong to the retired app. Every one calls a `public.*` function on the drop list.

## Security findings on the live project

Surfaced because they are live now, independent of the migration.

| Severity | Finding |
|---|---|
| ERROR | **`public.notification_receipts` has RLS disabled.** The anon key is public and shipped in the retired app, so anyone holding it can read and write this table. 0 rows, so nothing is exposed today. Remediation is `ALTER TABLE public.notification_receipts ENABLE ROW LEVEL SECURITY;`, which blocks all access until policies exist. Ayo's call; not applied |
| WARN | **`scheduled_notifications` has an always-true INSERT policy**, and a cron job processes that queue every minute. Anyone with the anon key could queue a push. 0 rows |
| WARN | **45 SECURITY DEFINER functions are executable by `anon`** (and 45 by `authenticated`). This is Supabase's own linter independently confirming issue #96, which was found the same day on the local stack. 45 live instances, not a curiosity |
| WARN | `avatars` bucket is public and allows listing |
| WARN | Leaked-password protection is off. Low relevance: the new app is email-OTP only and has no passwords |
| INFO | `course_registrations` has RLS enabled with no policies. Intentional in effect, since the website uses the service key |

Four `always_true` policies also exist on retired-app tables (`app_versions`, `church_branches`, `daily_verses`, `scheduled_notifications`); they leave with those tables.

## The one schema collision

`19` step 3 exists so collisions are not discovered live. There is exactly one, and it would fail the migration apply:

**`public.daily_verses` exists in both, with incompatible shapes.**

| | Columns |
|---|---|
| Prod (retired app) | `date`, `verse_text`, `reference`, `translation_id`, `created_at` |
| New app | `id`, `date`, `reference`, `text`, `translation`, `language`, `created_at`, `updated_at`, `unique (date, language)` |

Everything else diverged safely: `church_branches` vs `branches`, `users` vs `profiles`, `user_devices` vs `devices`, `app_versions` vs `app_config`.

## Capabilities Ayo asked to preserve

### App version tracking: already exists, and is narrower than the old one

The new app tracks it as `app_config` key `minimum_supported_version` (currently `"0.0.0"`, i.e. nothing gated), read on every launch and persisted by `apps/mobile/src/features/update-gate/store.ts`. So the capability is not lost and no new table is needed.

The retired `app_versions` was richer, and the gap is worth a decision before the gate is first used in anger:

| Old column | New equivalent |
|---|---|
| `platform` | **none.** One global floor for both stores |
| `min_version` | `app_config.minimum_supported_version` |
| `latest_version` | none (no nudge-vs-force distinction) |
| `store_url` | none (the client knows its own store) |
| `force_update` | implicit: the floor always forces |

**The per-platform gap is the one that matters operationally.** iOS and Android review on independent timelines, so a single global floor can lock out the platform whose build has not shipped yet. Recommended fix, when wanted: widen the existing `app_config` value to per-platform JSON (`{"ios": "1.2.0", "android": "1.1.0"}`) rather than adding a table, keeping one mechanism. Not urgent while the floor is `0.0.0`; decide before the first forced update. The 2 rows in the old table describe retired-app versions and are not worth carrying.

### Daily verses: DROP them, and do not carry the content

The capability exists (`public.daily_verses`, read by `apps/mobile/src/features/home/queries.ts`). The table is seeded only by `10-dev-only.sql`, so a fresh prod starts empty; the Home query selects `lte(date)` newest-first, so a missing day falls back to the most recent past verse rather than blanking the card.

**Reversal, 2026-07-30.** This section first recommended exporting the retired app's 57 verses into `seeds/00-common.sql`, on the assumption they were hand-curated. Reading the actual rows says otherwise, and the recommendation was wrong on three counts:

1. **They are not curated.** They read as randomly sampled KJV verses, many of them mid-narrative fragments with no devotional use: "Then the disciples looked one on another, doubting of whom he spake", "The children of thy elect sister greet thee. Amen.", "But is under tutors and governors until the time appointed of the father." There is also a straight duplicate (`Hebrews 12:12` on both 2026-07-05 and 2026-07-07).
2. **Several are shame-framed**, which the project convention explicitly forbids ("Grace-framed copy: encourage, never shame"). Worse, because the fallback query shows the most recent past verse, seeding these would make **the day-one verse for every user** `1 Thessalonians 4:8`, "He therefore that despiseth, despiseth not man, but God" (the latest row, 2026-07-22). A warning about despising is not the first thing the app should say to the family.
3. **Wrong translation.** `22` specifies **WEB** (free to use); these are KJV.

And the "nobody owns future verses" claim in the first draft was simply false. `22` already owns this completely: a comms/admin volunteer, quarterly batches of 90 days via dashboard verse CRUD with spreadsheet import, a 2-week lead time, a stated failure mode, and a cron alert when fewer than 14 future days are queued (`21` §5). The launch checklist already gates on "90 daily verses queued (WEB translation)".

So: **drop `public.daily_verses` with the rest of the retired app.** No carry-over, no new seed. The content path is a launch-checklist item with a named owner, not a schema gap. Verse selection is a pastoral decision and belongs to that programme, not to a migration.

## Ordered cleanup plan (`19` steps 3-6)

Nothing below runs until Track P's **P1** exists: the nightly off-provider dump pipeline plus **one verified restore**. That gate is not about app users, of whom there are none. It is about the live website sharing this project, and about being able to undo a mistake.

1. **P1.** Dump pipeline live, one restore verified.
2. **Rewrite the fenced policy first.** Recreate `donations`' `admins read all donations` against `public.profiles` instead of `public.users` / `user_role`. Doing this before any drop is what stops CASCADE from silently deleting it.
3. **Resolve `donations_user_id_fkey`.** 4 of 12 rows point at auth users due for deletion, and the FK has no ON DELETE, so those deletions will be refused. Decide: null the column for retired accounts, or keep those auth users. Never CASCADE.
4. **Unschedule all 6 cron jobs** (`cron.unschedule`). This comes BEFORE dropping functions: drop the functions first and the jobs fail every minute, one of them 1,440 times a day.
5. **Drop `public.daily_verses`** so the new migration's `create table` succeeds. No content carry-over (see above); launch verses come from `22`'s checklist item.
6. **P3 rehearsal** on a scratch project restored from the dump: full retired-app drop plus new schema apply, end to end.
7. **Drop** the retired app's tables, functions, triggers, policies, view, and the `avatars` bucket. Clean the stale auth users, subject to step 3.
8. **Baseline** per `19` step 6: `db pull` including the two fenced tables, `migration repair` against the existing 35-migration history, fence-guard green.
9. **Seed** prod from `00-common.sql` (branches and the carried verses); `10-dev-only.sql` never runs there.
10. Mirror the hosted auth config. `supabase config push` exists in the pinned CLI (2.100.1), so this need not be hand-entered as `19` currently assumes, but review which keys are per-environment (site URL, redirect URLs, SMTP) before pushing.

## Still to check before step 7

Not blocking the plan, but unresolved by this pass:

- **Vault secrets.** At least one exists. Identify what reads it before dropping the functions that might.
- **`purge_system_logs()` succeeds hourly but no `system_logs` table appeared in `public`.** Harmless, but it means the function tolerates a missing target or the table lives elsewhere.
- **`maintain-recurring-meetings` has no run history**, unlike the other five. Weekly schedule plus run-detail retention may explain it.
- The 48 functions were counted, not individually labelled. They are all retired-app by elimination, but the drop step should enumerate them from `pg_proc` at the time rather than trusting this count.
