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

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| EVERY screen empty | Stale IP in `apps/mobile/.env` | Step 3, then Metro with `--clear` |
| Only Watch empty | Bare `supabase db reset` skipped the sermon sync | `pnpm db:reset` |
| Screens empty only on phone, fine in Studio | Phone on a different network / firewall | Same Wi-Fi; step 3c curl proves reachability |
| New native module crashes a route on device | Dev client predates the module (see project CLAUDE.md fence) | Guard the import; EAS dev build with Ayo's go-ahead |
