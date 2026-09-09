# Restore from backup

For the moment something has gone badly wrong with the prod Supabase project. Read this top to bottom before typing anything; the fastest restore is the one you only run once. Written at Track P P1 (2026-08-10); drill evidence at the bottom.

> **Which project is production changed on 2026-08-17 (ADR 0023).** Production is now
> **`agbc-production`, ref `mqvojrkotwwvwzsewybx`**, eu-central-1. Every `fotfplvqsnmbzjjhqlwp`
> below refers to the OLD shared project, paused on 2026-08-17 and **DELETED on 2026-09-09
> (Track P Phase 5)**. Its archive is the platform's own pause-time export, downloaded from the
> paused project's overview and verified before deletion: `db_cluster-17-08-2026@13-52-24.backup.gz`
> and `fotfplvqsnmbzjjhqlwp.storage.zip`, kept with the age key outside every repo. The database
> file is a plain-SQL cluster dump (roles, schema and data in one file, `COPY` blocks), so it
> restores with `psql` rather than as this pipeline's trio. The B2 nightly
> `agbc-prod-2026-08-17.tar.zst.age` was NOT the archive: everything under `nightly/` ages out
> under the 30-day rule, and this file said otherwise for three weeks.
>
> **Path B assumes prod is reachable for a read-only managed-schema dump**, which is true of
> `agbc-production`.

## What exists

- **Nightly encrypted backup** in Backblaze B2, bucket `agbc-prod-backup` (EU Central, Amsterdam, endpoint `s3.eu-central-003.backblazeb2.com`), path `nightly/agbc-prod-YYYY-MM-DD.tar.zst.age`, taken 02:41 UTC by `.github/workflows/backup.yml`. Retention 30 days (bucket lifecycle rule: hide at 30 days, delete a day later). Expect roughly 1 MB while prod is pre-launch.
- Inside each tarball: `db/roles.sql`, `db/schema.sql`, `db/data.sql` (the `supabase db dump` trio; data includes `auth` and `storage` rows) and `storage/<bucket>/...` (every storage object, full copy).
- **RPO is up to 24h** (accepted, `21` §7): anything written after the last 02:41 UTC dump is gone unless the project itself can still serve it.
- The dead-man check `prod-backup` on healthchecks.io alerts when a night goes silent. If you are here because of that alert, the problem is the PIPELINE, not necessarily the data; check the workflow run log first.

## What you need

1. **The age identity (decryption key):** password manager entry `AGBC prod backup age key`. There is NO other copy (decided 2026-08-10, ADR 0018). Without it the backups are unreadable; stop and recover vault access first.
2. **B2 access:** sign in at backblaze.com (credentials in the password manager) and download via the web UI, or use an application key with the S3 API.
3. Locally: the `supabase` CLI, Docker, `age`, `zstd`, `psql` (the repo dev machine has all of these).

## Get and open the latest backup

Work somewhere disposable and OUTSIDE the repo (nothing here may be committed):

```powershell
mkdir C:\restore-drill; cd C:\restore-drill
# Download the newest nightly/agbc-prod-*.tar.zst.age from the B2 web UI into this folder.
# Save the age identity from the password manager as key.txt in this folder (delete it at the end).
age -d -i key.txt -o backup.tar.zst agbc-prod-YYYY-MM-DD.tar.zst.age
zstd -d backup.tar.zst -o backup.tar
tar -xf backup.tar
# You now have db\roles.sql, db\schema.sql, db\data.sql, storage\...
```

Sanity before restoring anywhere: `db/data.sql` contains `COPY public.donations ` and `COPY public.course_registrations ` lines, and is not suspiciously small.

## Path A · The prod project is lost (restore into a NEW Supabase project)

This is the account-level-incident path. It follows Supabase's own backup/restore recipe (docs: "Migrating within Supabase / backup and restore"; re-check it before running, their tooling moves).

1. Create a new Supabase project, **EU region (eu-central-1)**, on the org. Note its ref and set a strong DB password.
2. Get its **session pooler** connection string (Connect button on the project dashboard).
3. Restore, in one command so it is all-or-nothing:

   ```bash
   psql \
     --single-transaction \
     --variable ON_ERROR_STOP=1 \
     --file db/roles.sql \
     --file db/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file db/data.sql \
     --dbname "$NEW_DB_URL"
   ```

   Expected noise: `role ... already exists` style errors from roles.sql are harmless on a fresh Supabase project. Anything failing inside data.sql stops the transaction; read the first error, not the last.
4. **Storage:** recreate each bucket you see under `storage/` (same names, public/private per the dump's `storage.buckets` rows), then upload the files (dashboard drag-and-drop is fine at current sizes, or `aws s3 sync` against the new project's S3 endpoint).
5. **Verify before pointing anything at it** (the drill checklist below, same queries).
   Three dump limitations, measured 2026-08-10, so a diff against expectations does not read as corruption:
   - `auth.schema_migrations` and `storage.migrations` restore empty. They are the auth/storage services' own version ledgers; the target project's services maintain their own. Expected, not data loss.
   - **App triggers ON `auth.users` are NOT in the dump** (they are managed-schema objects; the trio skips that DDL). The retired app had two; anything OUR migrations put on `auth.users` later must be reapplied from `supabase/migrations/`, which is the schema of record anyway.
   - **`supabase_migrations.schema_migrations` (the migration history) is not in the dump.** After a Path A restore, rebuild it with `supabase migration repair` against the migrations folder.
   - **Storage policies and cron schedules are not in the dump either** (measured 2026-09-09: `schema.sql` carries zero statements `ON "storage"."objects"` and zero `cron.schedule` calls). The six buckets' RLS (who may read `sermon-audio`, who may write `event-images`, and so on) and every job's schedule live in `cron.job` and on `storage.objects`, both managed-schema territory the trio skips. After Path A, re-run the migrations that create them, or the buckets are unreadable and no job ever ticks while `cron.job_run_details` stays silent.
   - **The target's managed schemas must be at least as new as the source's.** The dump names every column, and production's auth and storage services move ahead of whatever restores it: on 2026-09-09 five columns in the dump (`auth.custom_oauth_providers.custom_claims_allowlist`, `storage.buckets.versioning_status`, `storage.objects.archived_at`, `.is_delete_marker`, `.is_versioned`) did not exist on the CLI's local stack. A fresh hosted project is newer than production by construction, so Path A proper does not hit this; the local variant below does, and drops those columns from `data.sql` before loading.
6. **Repoint the WEBSITE** (this is the live casualty): in Vercel (`Desktop/agbc` project), update `SUPABASE_URL` / service key env vars to the new project, redeploy, and test a donation read + a course registration read. The app (dev-pointed at P1 time) follows later.
7. Auth config, SMTP, and edge-function secrets are NOT in the dump; re-mirror per `docs/runbooks/credentials.md` ("Arming the scheduled jobs") and `23` §1's `config push` caveat.

## Path A on the local stack · the drill target while the org is on Free

**Why this exists (2026-09-09):** `21` §7 says "restore into a scratch project", and the Free plan does not allow one. Two ACTIVE projects are the cap across every org Ayo owns, `agbc-production` holds one and the other company's project holds the other, and a paused project cannot take a restore. So the drill target is `supabase start`: a full stack (Postgres, auth, PostgREST, storage, Mailpit) whose managed schemas are current, which is exactly what a fresh hosted project would give, minus the platform's own quirks. Everything the drill is meant to prove (the key opens the file, the trio loads in one transaction, the counts and checksums match, the dashboard boots and an admin signs in with their restored MFA factor) is proven here. It costs the local dev data, which `pnpm db:reset` puts back afterwards.

```bash
# From C:estore-drill with db/ extracted (Git Bash). The stack is already running.
# 1. Adapt: drop the columns the local managed schemas do not have yet (see step 5 above),
#    writing db/data.local.sql; the script also writes a per-table row-count manifest.
# 2. Prep the target: drop what the dump recreates, truncate the managed rows it carries.
cat > db/prep.sql <<'EOF'
set storage.allow_delete_query = 'true';
drop schema if exists jobs cascade;
drop schema public cascade;
create schema public;
alter schema public owner to pg_database_owner;
truncate auth.audit_log_entries, auth.custom_oauth_providers, auth.flow_state, auth.users, auth.identities,
  auth.instances, auth.oauth_clients, auth.sessions, auth.mfa_amr_claims, auth.mfa_factors, auth.mfa_challenges,
  auth.oauth_authorizations, auth.oauth_client_states, auth.oauth_consents, auth.one_time_tokens,
  auth.refresh_tokens, auth.sso_providers, auth.saml_providers, auth.saml_relay_states, auth.sso_domains,
  auth.webauthn_challenges, auth.webauthn_credentials,
  storage.objects, storage.buckets, storage.buckets_analytics cascade;
EOF
docker cp db supabase_db_agbc-global:/tmp/db
MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD=postgres supabase_db_agbc-global psql -U supabase_admin -d postgres \
  --single-transaction --variable ON_ERROR_STOP=1 --file /tmp/db/prep.sql
# 3. The official recipe, as supabase_admin (session_replication_role needs a superuser here).
MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD=postgres supabase_db_agbc-global psql -U supabase_admin -d postgres \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file /tmp/db/roles.sql --file /tmp/db/schema.sql \
  --command 'SET session_replication_role = replica' --file /tmp/db/data.local.sql
# 4. Make the API see the new schema, then verify (checklist below) before booting the dashboard.
docker exec -e PGPASSWORD=postgres supabase_db_agbc-global psql -U supabase_admin -d postgres -Atc "notify pgrst, 'reload schema';"
docker restart supabase_rest_agbc-global supabase_auth_agbc-global
```

The dashboard then runs with `next start` and the local URL and publishable key (the existing `.next` build bakes `127.0.0.1:55321`, so no rebuild). Sign in with the admin's real address: the code lands in Mailpit (`127.0.0.1:55324`), and the authenticator app works unchanged because `auth.mfa_factors` came with the dump. `config.toml` already wires the custom access token hook, which the dump's `schema.sql` recreates in `public`.

## Path B · Prod is alive but something was damaged (inspect, then surgically fix)

Do NOT restore over prod. Restore into a disposable local container and extract what you need. This exact procedure was executed and verified on 2026-08-10; follow it as written, the non-obvious steps exist because the naive restore fails.

**Why the extra steps:** the `supabase db dump` trio deliberately excludes the managed `auth`/`storage` schema DDL (a real Supabase project already has them), but a raw container's baked-in auth baseline is ancient (5 tables vs prod's 22). So the container first needs prod's actual managed DDL, which the nightly backup does NOT contain; if prod is reachable, dump it read-only (below); if prod is gone, you are in Path A, where the new project brings current managed schemas itself.

```bash
# From the folder holding db/roles.sql, db/schema.sql, db/data.sql (Git Bash):
docker run -d --name restore-drill -e POSTGRES_PASSWORD=postgres \
  public.ecr.aws/supabase/postgres:17.6.1.106
sleep 25

# Managed-schema DDL (read-only against prod; skip if using a dump-era copy):
MSYS_NO_PATHCONV=1 docker run --rm public.ecr.aws/supabase/postgres:17.6.1.106 \
  pg_dump "$PROD_DB_URL" --schema-only --schema=auth --schema=storage > db/managed-schema.sql

# Prod's auth schema carries app triggers that call public.* functions, which do
# not exist until schema.sql runs: pull them out and apply them LAST. In the
# 2026-08-10 drill these were exactly two (on_auth_user_created,
# on_auth_user_email_verified, both the retired app's).
grep 'EXECUTE FUNCTION public\.' db/managed-schema.sql > db/managed-pass3.sql
grep -v 'EXECUTE FUNCTION public\.' db/managed-schema.sql > db/managed-pass1.sql

docker cp db restore-drill:/tmp/db

# schema.sql alters the realtime publication, which a raw container lacks:
docker exec -e PGPASSWORD=postgres restore-drill psql -U supabase_admin -d postgres \
  -c "DO \$\$ BEGIN IF NOT EXISTS (select 1 from pg_publication where pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF; END \$\$;"

# Pass 1: managed DDL minus the cross-schema triggers.
MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD=postgres restore-drill psql -U supabase_admin -d postgres \
  --single-transaction --variable ON_ERROR_STOP=1 --file /tmp/db/managed-pass1.sql
# Pass 2: the official trio, all-or-nothing.
MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD=postgres restore-drill psql -U supabase_admin -d postgres \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file /tmp/db/roles.sql --file /tmp/db/schema.sql \
  --command 'SET session_replication_role = replica' --file /tmp/db/data.sql
# Pass 3: the held-back triggers.
MSYS_NO_PATHCONV=1 docker exec -e PGPASSWORD=postgres restore-drill psql -U supabase_admin -d postgres \
  --single-transaction --variable ON_ERROR_STOP=1 --file /tmp/db/managed-pass3.sql
```

Then `SELECT` the damaged rows out (`docker exec -e PGPASSWORD=postgres restore-drill psql -U supabase_admin -d postgres`) and reapply them to prod via a reviewed, explicit statement (never a blind restore). Kill the evidence when done:

```powershell
docker rm -f restore-drill
Remove-Item -Recurse -Force C:\restore-drill   # includes key.txt: this is not optional
```

## Verification checklist ("it imported without errors" is NOT verified)

Compare the restored copy against the source (or against this file's drill record if the source is gone):

1. Row count per table, `public` schema plus `auth.users` and `storage.objects`.
2. Spot checksums on the website's tables (the reason this pipeline exists):

   ```sql
   select md5(string_agg(t::text, '|' order by id)) from public.donations t;
   select md5(string_agg(t::text, '|' order by id)) from public.course_registrations t;
   ```

3. One human read: open a couple of `donations` rows and confirm the donor names/amounts look like real data, not empty columns.

## Drill record

| Date | Dump | Target | Result |
|---|---|---|---|
| 2026-09-09 | `nightly/agbc-prod-2026-09-09.tar.zst.age` from B2 (92.7 MB: two 46 MB MP3s in `sermon-audio`, see below), decrypted with the vault's identity | The LOCAL stack, per "Path A on the local stack" above, because the Free plan has no room for a scratch project | **VERIFIED, and the first drill to use a real nightly, the real key, and the dashboard.** Download ~30 s; decrypt + unpack 1 s; prep + restore **2 s** in one transaction with zero errors; **73 of 73 tables identical** to the dump's own row counts (330 rows); `donations` and `course_registrations` md5 **identical to production**, read from the SQL editor the same minute (`421d35af…`, `5b4da09e…`). Dashboard booted with `next start`, admin signed in through Mailpit OTP + the restored TOTP factor, moderation queue, People and the sermon shelf (102 messages, the same day's sync) rendered from restored rows. **Findings:** (1) the key's password-manager entry took two attempts to copy correctly, and a wrong field silently produced a 59-byte file: an age identity is a 74-character line starting `AGE-SECRET-KEY-1`, check that before anything else; (2) five dump columns had no home on the local stack (step 5 above), adapted rather than hidden; (3) storage policies and `cron.job` are not in the dump (step 5); (4) `sermon-audio` on production holds a second 46 MB object (`0186563c…`, uploaded 2026-09-06 11:56 UTC) that no sermon row references, so the traffic fence's "one MP3" is two on disk and every nightly since carries 92 MB; delete the orphan from the dashboard. Storage objects were not copied into the target, deliberately: the drill is about the database and the dashboard, and the tarball's file listing already proves the bytes arrived. Whole drill, first download (14:38) to teardown (15:23): **45 minutes** wall clock, most of it the key handoff and the sign-in; the restore itself is seconds |
| 2026-08-10 | Live trio taken with the pipeline's exact commands (roles 297 B, schema 147 KB, data 1.1 MB, 42 tables) | Disposable `public.ecr.aws/supabase/postgres:17.6.1.106` container, Path B procedure | **VERIFIED.** Row counts identical on 40/42 tables; the 2 diffs are the expected service ledgers (`auth.schema_migrations`, `storage.migrations`, see Path A notes). Full-row md5 checksums identical (UTC/ISO-normalized) on `public.donations` (12), `public.course_registrations` (4), `public.users` (8), `public.daily_verses` (58); id-level checksums identical on `auth.users` (8) and `storage.objects` (7). All 7 storage objects fetched; byte sizes matched restored metadata exactly. All 12 donations rows carry donor name + email (columns populated, checked without printing PII). Whole drill ran on the dev machine at zero cost |

Quarterly drill required per `21` §7. **Next one due by 2026-12-09.** Before it, check whether the org is on Pro yet: if so, the target goes back to a real scratch project (Path A proper) and this file's local variant becomes the fallback.
