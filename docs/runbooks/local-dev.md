# Runbook · Local dev loop (device testing)

How to bring the whole local environment up for testing on the physical phones,
verify every surface has data, and recover when screens come up empty. Written
2026-07-24 after a session lost to a stale Wi-Fi IP (step 3).

## 1. Start the local Supabase stack

```powershell
supabase start
```

Ports are remapped to 553xx (see `supabase/config.toml`). Studio:
http://127.0.0.1:55323, API: http://127.0.0.1:55321.

## 2. Load / refresh the data

```powershell
pnpm db:reset
```

ALWAYS `pnpm db:reset`, never bare `supabase db reset`. The pnpm script resets
the database (migrations + seeds) AND re-runs the YouTube sermon sync; a bare
reset leaves Watch empty and the app half-featured on device.

You only need this after changing migrations/seeds or when data looks stale.
The stack keeps its data across `supabase stop` / `start`.

### Verify everything is loaded

```powershell
docker exec supabase_db_agbc-global psql -U postgres -d postgres -c "
select 'branches' as surface, count(*) from public.branches
union all select 'branch_services', count(*) from public.branch_services
union all select 'events', count(*) from public.events
union all select 'sermons', count(*) from public.sermons
union all select 'daily_verses', count(*) from public.daily_verses
union all select 'testimonies', count(*) from public.testimonies
union all select 'prayers', count(*) from public.prayers
union all select 'giving_config', count(*) from public.giving_config
union all select 'app_config', count(*) from public.app_config;"
```

Expected after a fresh `pnpm db:reset` (as of W1.7):

| surface         | count | feeds                                  |
| --------------- | ----- | -------------------------------------- |
| branches        | 4     | Branches, Branch info, map, onboarding |
| branch_services | 8     | Home next-service card, Branch info    |
| events          | 6     | Events list + detail (incl. one ministry-wide, one cancelled, one past) |
| sermons         | ~95   | Watch (synced from YouTube, count grows) |
| daily_verses    | 90    | Home verse card                        |
| testimonies     | 4     | Family feed, Home highlight, map pins  |
| prayers         | 4     | Family prayer feed (3 approved + 1 pending) |
| giving_config   | 1     | Give tab + bank details                |
| app_config      | 1     | Forced-update gate                     |

Zero anywhere (except sermons right after a network hiccup): re-run
`pnpm db:reset` and read its output; the sermon sync prints a summary line.

## 3. Point the app at the PC (the empty-screens trap)

The phone reaches Supabase over the LAN, so `apps/mobile/.env` must carry the
PC's CURRENT Wi-Fi IP. It changes when the network changes, and the value is
baked into the JS bundle, so it only takes effect after a Metro restart.

**Symptom of a stale IP: every screen is empty at once** (Watch, Give, Home
hero/verse, Family). The data is fine; the phone just can't reach the API.

```powershell
# 3a. Current Wi-Fi IP
(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias WiFi).IPAddress

# 3b. Put it in apps/mobile/.env
#     EXPO_PUBLIC_SUPABASE_URL=http://<that-ip>:55321

# 3c. Prove the API answers on that IP (uses the publishable key from .env)
curl.exe -s "http://<that-ip>:55321/rest/v1/branches?select=slug&limit=1" -H "apikey: <EXPO_PUBLIC_SUPABASE_KEY value>"
# expect: [{"slug":"glasgow"}]
```

USB alternative for the Android phone (IP-proof): set the URL to
`http://127.0.0.1:55321` and run `adb reverse tcp:55321 tcp:55321` after every
cable reconnect. Never use `localhost` on Android (resolves to IPv6 first and
hangs).

## 4. Start Metro

```powershell
pnpm --filter mobile start
```

After changing `.env`, start it with a cleared cache instead so the new URL
re-inlines:

```powershell
pnpm --filter mobile exec expo start --clear
```

Then open the dev client on the phone (same Wi-Fi network as the PC) and
reload the app.

## 5. Shutting down

- Metro: Ctrl+C in its terminal. If a stray Metro survives, find and kill it:
  `netstat -ano | findstr :8081` then `taskkill /F /PID <pid>`.
- Supabase: `supabase stop` (data survives; a later `supabase start` resumes).

## Scheduled jobs on the local stack (W2.7 slice 5)

`pnpm db:reset` also runs `scripts/arm-local-jobs.mjs`, which writes `project_url`
and `secret_key` (the local `sb_secret_` key; ADR 0024, since 2026-08-19) into the
local vault. Without them the schedules exist and do nothing (by design, ADR 0016).
Re-arm alone with `pnpm jobs:arm-local`.

`project_url` is `http://kong:8000`, not `127.0.0.1:55321`: pg_net runs inside the
postgres container, where the API gateway answers on that name.

```powershell
# What is scheduled, and what the last runs did
docker exec supabase_db_agbc-global psql -U postgres -d postgres -c "select jobname, schedule from cron.job;"
docker exec supabase_db_agbc-global psql -U postgres -d postgres -c "select id, status_code, content from net._http_response order by id desc limit 5;"

# Run one now, exactly as cron would (no need to wait for the tick)
docker exec supabase_db_agbc-global psql -U postgres -d postgres -c "select jobs.invoke_edge_function('moderation-alerts');"
```

**New functions need a stack restart, not a container restart:** the edge runtime is
given its function list at `supabase start`, so a newly added function answers 404
until `supabase stop && supabase start`.

### Watching the alert emails without a Resend key

There is no Resend key locally, so the jobs answer `503 email not configured`. To
see the real mail, point them at a catcher:

1. Run any local HTTP server that answers 200 on `POST /emails` (a ten-line
   `node:http` script does it) on port 5599.
2. Add to `supabase/functions/.env` (gitignored), then restart the stack:

   ```
   RESEND_API_KEY=local-no-key
   RESEND_API_URL=http://host.docker.internal:5599/emails
   ALERTS_FROM_EMAIL=AGBC <alerts@example.test>
   DASHBOARD_URL=http://localhost:3000
   ```

3. Give the jobs something to say. A fresh reset has no admin, so escalation has
   nobody to reach:

   ```sql
   update public.profiles set role = 'admin' where email = 'dev.tobi@example.test';
   update public.prayers set created_at = now() - interval '3 days' where status = 'pending';
   ```

Remove the `RESEND_*` lines afterwards. Re-running a job sends nothing the second
time: that is `job_alerts` doing its job, so `delete from public.job_alerts;` to
replay.

## Guest smoke journey (Maestro)

The W1.8 exit smoke test walks a guest through Home > Watch > Family > Give bank
details with no account. Run it locally against a running dev build (device or
emulator), with Metro up (step 4):

```powershell
# One-time: install Maestro (https://maestro.mobile.dev), then
maestro test apps/mobile/maestro/guest-smoke.yaml
```

In CI it lives in `.github/workflows/nightly.yml` as a `workflow_dispatch`-only
job (no cron: Actions minutes are a shared pool, project CLAUDE.md CI budget). To
run it there, dispatch the workflow with an `app_binary_url` pointing at an
Android `.apk` (e.g. an EAS build artifact); the cron cadence is decided once an
APK-build source is wired into CI.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| EVERY screen empty | Stale IP in `apps/mobile/.env` | Step 3, then Metro with `--clear` |
| Only Watch empty | Bare `supabase db reset` skipped the sermon sync | `pnpm db:reset` |
| Screens empty only on phone, fine in Studio | Phone on a different network / firewall | Same Wi-Fi; step 3c curl proves reachability |
| New native module crashes a route on device | Dev client predates the module (see project CLAUDE.md fence) | Guard the import; EAS dev build with Ayo's go-ahead |
