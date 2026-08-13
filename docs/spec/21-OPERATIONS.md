# 21 · Operations: Repo, CI/CD, Testing, Jobs, Observability, Releases, Cost

The operational spec the product docs assume. Everything here is a launch requirement unless marked otherwise. Facts about vendor tiers/pricing were verified 2026-07-12; re-check at build kickoff.

---

## 1. Repository structure (monorepo, pnpm workspaces)

```
agbc-global/
  apps/mobile/          Expo app (SDK 56+, TypeScript strict)
  apps/dashboard/       Next.js leader/admin dashboard
  packages/shared/      zod contracts (per edge function: request + response), generated database.types.ts, constants
  supabase/             config.toml (committed; env() for secrets)  migrations/  functions/  tests/  seeds/ (globbed via [db.seed]: common + dev-only; prod seeded via reviewed step)
  docs/spec/            this docs folder moves here
  docs/decisions/       ADRs (NNNN-title.md, minimal MADR)
  docs/runbooks/        deploy, rollback, restore, rotate-secret, incident, credentials inventory
  .github/workflows/    pr.yml, supabase-deploy.yml, release.yml, nightly.yml
```

ADRs to backfill on day one: reuse-shared-supabase-as-prod; replace-grace-portal-listings; whatsapp-first-otp; link-out-giving; expo-audio-for-playback; maestro-for-e2e; posthog-for-analytics; paid-devotional-plans; svg-family-map; full-tablet-layouts.

## 2. Environments

| Env | App | Backend | Notes |
|-----|-----|---------|-------|
| local | Expo dev build + `npx expo start` | `supabase start` (Docker) | THE daily dev loop; migrations and RLS tests run here first |
| dev (hosted) | EAS `preview` builds, Update channel `preview` | fresh free-tier Supabase project | integration/preview only. Free projects pause after ~7 days idle: a weekly Supabase Cron keep-alive query lives in the project itself. Parity by `supabase/seed.sql`, not by hand |
| production | store builds, Update channel `production` | the existing shared Supabase project, **Pro plan** | shared with the agbc website; fenced objects list in project CLAUDE.md |

**Staging:** not a permanent third environment. One short-lived rehearsal project is created before the Grace Portal cleanup (see `19`): restore a prod dump into it, rehearse the entire drop + migrate end to end, then delete it.

**Vercel (dashboard):** env vars scoped per environment. Preview deployments get DEV Supabase URL/keys only; `SUPABASE_SERVICE_ROLE_KEY` exists in the Production scope only, used exclusively in server routes. Production deploys from `main`; previews per PR.

## 3. CI/CD

- **pr.yml** (path-filtered, cancel superseded runs):
  - mobile: typecheck, ESLint, Jest + React Native Testing Library, `expo-doctor` (advisory / `continue-on-error`, not a hard gate: its version-match check fails whenever Expo ships a release, which would red-block PRs on the calendar rather than their diff; Renovate owns version freshness on its cooldown, decided 2026-07-23)
  - dashboard: typecheck, ESLint, Vitest, build
  - supabase: `supabase start` on the runner, apply full migration history, `supabase test db` (pgTAP), `deno test` for functions, types-drift check (`supabase gen types typescript --local` diffed against the committed file), fence-guard grep (no migration references the website's fenced objects). CI time budget: cache the Supabase Docker images in Actions and run pgTAP files in parallel; the supabase job exceeding 10 minutes is treated as a regression
- **supabase-deploy.yml:** merge to `main` auto-applies migrations + functions to DEV. Prod deploy is a **manually triggered `workflow_dispatch` job** (the solo-dev equivalent of an approval gate; reviewer-gated environments need a paid tier on private repos, deferred per `23`/`24`); the prod `SUPABASE_ACCESS_TOKEN` + db password live ONLY in the `production` environment's secrets, consumed exclusively by that workflow. If GitHub Team is ever adopted, upgrade this to a required-reviewer environment gate.
- **release.yml:** version tag triggers `eas build --profile production` + `eas submit`.
- **nightly.yml:** Maestro E2E on Android emulator profiles (small phone + tablet), full migration history against a fresh DB, pseudo-localization run.
- **backup.yml** (landed at Track P P1, 2026-08-10; originally planned inside nightly.yml, split out so the critical nightly backup never shares a file, a schedule, or a failure signal with an expensive emulator job): nightly 02:41 UTC prod `db dump` + storage copy, age-encrypted on the runner, uploaded off-provider (see §7; ADR 0018). The one sanctioned Actions cron under the CI-budget rule: pg_cron cannot run pg_dump. No PR triggers, 15-min timeout, no-overlap concurrency, dead-man ping.
- **EAS profiles** (`eas.json`): `development` (dev client, internal, dev Supabase), `preview` (internal distribution, channel `preview`, dev Supabase), `production` (store, channel `production`, prod Supabase). `cli.appVersionSource: "remote"` + `autoIncrement`. Client config (Supabase URL, anon key) via EAS environment variables read in `app.config.ts`; never in the repo.
- **Secrets map:** GitHub repo secrets: `EXPO_TOKEN`, dev Supabase token. GitHub `production` environment only: prod Supabase token + db password. EAS env: public client config only. Supabase function secrets: `TWILIO_*`, `WHATSAPP_TOKEN`, `YOUTUBE_API_KEY`, `PAYHIP_API_KEY`, `RESEND_API_KEY`/SMTP creds. EAS credentials (not env vars): the Android upload keystore, the **FCM V1 service account key** (required for Expo Push on Android even with no Firebase SDK in the app), and the APNs .p8 key. The Sentry auth token (sourcemap upload) lives in **EAS env as a secret variable** for the app and belongs in **Vercel env** for the dashboard; **not** in GitHub secrets, corrected 2026-08-13 when it was actually placed, because nothing in CI uploads sourcemaps and an unused copy is only extra surface. Add one wherever an uploader is later added. The DSNs themselves are public-by-design and live in EAS/Vercel env and a Supabase function secret. Vercel: per-environment as above. Nothing secret ships in the app bundle (the anon key is public by design; RLS is the boundary); a build-time scan asserts no service key/vendor token appears in the JS bundle.
- **Protection:** on the free plan, enforced branch protection is unavailable on private repos, so branch discipline (PRs + green checks before merge) is by convention until GitHub Team; required status checks are still configured so the upgrade is a toggle. Renovate: security updates fast-laned, routine bumps on a cooldown (no day-zero installs), lockfile committed.

## 4. Testing strategy (the merge gate)

| Layer | Tool | Covers |
|-------|------|--------|
| Unit | Jest (`jest-expo`); Vitest (dashboard) | streak/ISO-week math incl. DST + branch-timezone matrix, service_date derivation, gate-return state machine, offline queue reducer, currency/fee selection, i18n plurals (DE/NL/FR) |
| Component | React Native Testing Library | the four data states per feed screen, GateSheet trigger + return, compose + consent flow, forced-update gate, MY-POSTS states |
| RLS / authz | pgTAP via `supabase test db` (+ basejump `supabase_test_helpers`) | every table has RLS forced; guest sees only approved; anonymous prayers never expose `author_id`; **each Write-path invariant bypass attempt fails** (insert approved, self-set role, edit approved without re-pend, member INSERT into `entitlements`, backdated `attendance`, foreign-author `from_prayer_id`); blocked-author rows invisible both ways; leader branch-scope; foreign-id IDOR probes on dashboard routes; ministry broadcast refused without a distinct approver; mark-answered on a non-approved prayer fails; author edit of a `removed` row fails; RSVP against a cancelled/started event fails; broadcast edit during `pending_approval` clears `approved_by`; writes from a deleted profile fail; writes without `onboarded_at` fail; `attendance.client_taken_at` clamps (72h/future) |
| Edge functions | `deno test` unit + `supabase functions serve` integration | Payhip: same signed fixture replayed twice = one entitlement, unknown event = 200; fan-out chunking; OTP funnel logging |
| Contracts | zod schemas in `packages/shared` + types-drift CI job | app and edge functions cannot disagree silently; consumers tolerate unknown fields (old app versions outlive the backend) |
| E2E | **Maestro** (2026 Expo consensus; runs on dev/release builds) | journeys only: guest browse Home > Watch > Give bank details; OTP sign-in with the review email (bypass flag is always on in dev/preview, `03`); post testimony > pending; Glory gate-return; RSVP; block a member > their content disappears; devotional day complete |
| Edge integration extras | `supabase functions serve` | email verify then restore-purchase grants exactly once; a forged refund event does not revoke |
| Manual matrix | per release | one low-end real Android on the minimum OS + current iPhone, at small phone / large phone / tablet widths, 2x text scale, VoiceOver + TalkBack pass |

Cadence: per PR = everything except E2E; nightly = Maestro + migration-history + pseudo-loc; pre-release = Maestro both platforms + the manual matrix.

## 5. Background jobs (scheduler: Supabase Cron = pg_cron + pg_net; it schedules but does NOT retry skipped runs or alert, so every job below ends by pinging its healthchecks.io dead-man check; a missed ping alerts)

| Job | Schedule | Idempotency | Failure blast radius |
|-----|----------|-------------|----------------------|
| YouTube sync | nightly 03:00 UTC | upsert on `youtube_id`; uses uploads-playlist `playlistItems.list` (1 quota unit), never `search.list` (100) | Watch goes stale silently |
| Live detection | every 5 min around `branch_services` windows (edge function) | sets/clears `sermons.is_live` | live banner wrong |
| Streak recompute | on-write trigger (primary) + weekly cron safety net Mondays 03:40 UTC, lease-locked (W2.8) | pure function of `attendance`, safe to re-run; asserted by recomputing every stored streak twice in `030` | streaks stale |
| Service reminders | every 15 min | computes due services per branch timezone; `notifications.dedupe_key` (`02`) so re-runs never double-send | reminders silently stop (the canonical failure) |
| Event RSVP reminders | hourly | events starting within the reminder window; dedupe via `notifications.dedupe_key` (`rsvp_reminder:<event_id>`) | promised reminders (`11`) never fire |
| Broadcast fan-out | event-driven (dashboard send) | chunked via `broadcast_deliveries` rows with cursor resume; dedupe unique(broadcast_id, device_id); batches of 100 per Expo call | partial sends; must be resumable and haltable |
| Push receipts | every 15 min | sweeps ALL unprocessed tickets (`push_tickets` + `broadcast_deliveries`, `02`): AUTOMATED pushes are not fire-and-forget; delete `devices` on `DeviceNotRegistered`; alert if > 10% of a day's automated tickets error | dead tokens accumulate; Expo throttles senders who ignore receipts; note Expo keeps receipts only ~24h |
| Payhip inbox processing | every 5 min | processes `payhip_events` rows; grant AND refund confirmed against the Payhip API (product id, buyer email, amount taken from the API response only, `14`); unique `source_ref`; re-sweeps `unmatched_purchases` as the drain safety net (primary drain = trigger on email verification) | buyers cannot read purchased books |
| Payhip reconciliation | daily | pulls the last 7 days of transactions from the Payhip API; any transaction id missing from `payhip_events` is inserted as a synthetic event (unique id: idempotent); alert when a confirmed sale has no entitlement or unmatched row after 24h | silently DROPPED webhooks (incl. refunds) are otherwise invisible until a buyer complains |
| Retention purges | monthly | notifications = drop old partitions; reports > 24 months; `broadcast_deliveries` > 30 days; `payhip_events` payload redaction + 12-month purge; unclaimed `unmatched_purchases` > 12 months; `push_tickets` > 7 days; **`devices` with `last_seen_at` > 180 days** (the pruning backstop when receipts were missed: the token re-registers on next app open); batched deletes elsewhere | GDPR retention drift |
| Moderation alerts | hourly (W2.7 slice 5) | one digest per recipient of what they have not been told about, ledgered in `job_alerts` (recipient, kind, subject); the branch's leaders for anything waiting, every admin for anything past 48h or for a branch with no leader; reports included alongside pending posts | a quiet leader makes a branch's feed look dead (`09` Freshness safeguard) |
| Verse queue monitor | daily (W2.7 slice 5) | alert admins when a language is at or below 14 days of `daily_verses` depth, measured by `daily_verse_depth()` (first gap, not row count); one ledger row per admin per day | the daily touchpoint dies quietly |
| Counter reconciliation | nightly | recount glory/pray mismatches | drifted counts |
| Dev keep-alive | weekly (dev project only) | trivial query | dev project pauses |

**Scheduling wiring (corrected 2026-08-06, W2.7 slice 5; ADR [0016](../decisions/0016-pg-cron-plus-edge-functions-for-scheduled-work.md)).** The W1 audit recorded cron registration as Track P's, because "the schedule is environment-specific (function URLs + a cron-invocation secret differ per env)". That is true of the VALUES and not of the schedule, and a migration per environment would mean a migration history per environment, which `23` §3a forbids. So the mechanism is now in the repo and environment-agnostic:

- `cron.schedule(...)` in the job's own migration runs `jobs.invoke_edge_function('<slug>')`, which reads `project_url` and `service_role_key` from **Supabase Vault** at call time and POSTs through `pg_net`. An environment whose vault is empty raises a NOTICE and does nothing, so `supabase db reset` and CI stay silent.
- **Every job takes a lease** (`claim_job_lease` / `release_job_lease`, `public.job_leases`) so an overrunning run and the next tick cannot both send. The lease is given back when the run ends; its expiry is only the net under a run that died holding it. Advisory locks cannot serve here: the jobs reach Postgres through PostgREST, so every statement is a different pooled session.
- **A job that cannot deliver pings FAILURE**, never a quiet 200: "reminders silently stop" is the canonical failure of this whole table.
- What is still per-environment, and still Track P's: the two vault secrets, the healthchecks.io checks, and prod's six pre-existing cron jobs from the retired app (`docs/runbooks/prod-audit-2026-07-30.md`). Locally, `pnpm db:reset` (or `pnpm jobs:arm-local`) writes the vault secrets from the machine's own CLI keys; nothing is committed.
- `youtube-sync` and `live-detection` are still unscheduled by choice: the sermon sync runs from `pnpm db:reset` locally, and both get their schedules with the first hosted deployment that must auto-run them, now a one-line migration each rather than a design question.

## 6. Observability (the minimal owned alert set)

1. **Sentry** (app + dashboard + Deno SDK in edge functions), PII scrubbing on: alert on a new issue hitting > 5 users/hour; crash-free sessions < 99.5% during a rollout = halt criterion. **Wired W2.10 slice 1 (2026-08-12):** all three runtimes init only when a DSN is present, so an unconfigured environment is silent rather than noisy. NOT consent-gated (ADR 0020), which is what keeps the halt criterion meaningful, so scrubbing carries the whole privacy load and is asserted in tests on both sides. Two traps worth knowing: Sentry v10 deprecated `sendDefaultPii` in favour of per-category `dataCollection` whose defaults COLLECT cookies, request/response bodies, headers, query params, DB query data and stack-frame locals, all of which the dashboard turns off explicitly; and the Deno SDK does not instrument `Deno.serve`, so edge functions pass context per capture (`withScope`) and never set it globally, or one request's data leaks into the next on a reused isolate. Sourcemap upload rides the native build (app) and `withSentryConfig` (dashboard), both no-ops without `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`.
2. **healthchecks.io** dead-man pings on every job in §5 (free tier: 20 checks). Each job reads its own check URL from a per-function secret, so a check that has not been created yet is a no-op rather than an error: `HEALTHCHECK_URL_YOUTUBE_SYNC`, `HEALTHCHECK_URL_LIVE_DETECTION`, `HEALTHCHECK_URL_MODERATION_ALERTS`, `HEALTHCHECK_URL_VERSE_MONITOR` (W2.7 slice 5), `HEALTHCHECK_URL_STREAK_RECOMPUTE` (W2.8), the rest as their jobs land.
3. **OTP funnel:** log verification started/succeeded (no email addresses; country attribution is gone with phone OTP, so the funnel is ministry-wide); daily check alerts when success < 70% over 24h; PLUS an absolute alarm: > 20 consecutive failed verifications ministry-wide within 30 minutes pages immediately (catches a Sunday-morning total outage the daily check would miss); Resend delivery/bounce metrics remain as backup.
4. **Broadcast health:** alert if > 10% of a broadcast's deliveries fail (push receipts), AND alert when a broadcast sits in `sending` longer than 15 minutes with zero failures (an edge outage mid-send is otherwise invisible); runbook step: resume (cursor) or halt.
5. **UptimeRobot** (free): the web giving page (shared external SPOF: card/PayPal giving dies with the website; offline bank details in `12` cover the gap, but only an alert tells you), the church website, the dashboard, the Supabase REST endpoint.
6. **Supabase usage:** check egress/DB size/realtime connections at 80% of plan; spend cap decision recorded.
7. **Realtime health:** probe the Realtime websocket endpoint (UptimeRobot or the health job): §6.6 watches usage, not service health, and a Realtime-only outage silently degrades the Art. 9 removal guarantee to its 60s polling bound (`02`).
8. **Resend canary:** weekly, the verse-monitor job sends itself one email via Resend and pings a dedicated dead-man check (email verification otherwise fails silently until a buyer hits it).

## 7. Backups and disaster readiness

- Production on **Pro** remains the pre-launch requirement (Free's 5GB/month egress cannot serve sermon audio, and Free has NO backups). **Decision 2026-07-13: the upgrade is deferred for now.** Hard precondition while on Free: the nightly off-provider `db dump` pipeline + one verified restore MUST exist before any destructive work on the shared project (the `19` cleanup); until then, prod (including the live website's data) is one incident away from unrecoverable loss. PITR: start without, revisit at scale; RPO with nightly dumps = up to 24h accepted, recorded.
- **The pipeline exists (Track P P1, 2026-08-10; ADR 0018):** `backup.yml` dumps prod nightly (the `supabase db dump` roles/schema/data trio) AND full-copies every storage bucket into one tarball, encrypts it with age on the runner (CI holds only the public key; the decryption key is in the password manager only, an accepted single point of failure), and uploads to Backblaze B2, EU Central (Amsterdam). Retention: 30 days rolling via bucket lifecycle rule, which is also the GDPR age-out bound (`20`). Dead-man check `prod-backup` on healthchecks.io. Restore procedure + drill record: `docs/runbooks/restore-from-backup.md`. Full-copy storage is right while buckets are KBs; revisit for incremental encrypted sync when sermon audio lands (Phase 3).
- **Restore drill** once before launch and quarterly: restore the latest dump into a scratch project, boot the dashboard against it, record time taken.
- **Bus factor:** credentials inventory in `docs/runbooks/credentials.md`: every account (Apple, Google Play, Supabase org, Meta Business, Resend, Payhip, EAS/Expo, GitHub, Vercel, registrar), its owner, second owner, billing card, renewal date. Second owner added to Apple (App Store Connect Admin), Supabase org, and the password-manager vault (church officer). Keystore copies: EAS credentials + encrypted vault entry + offline USB in the church safe (Play App Signing means a lost upload key is recoverable via support, not fatal; note it in the runbook).
- Runbooks: deploy, rollback (OTA republish previous update; store = halt rollout + higher version), restore-from-backup, rotate-each-secret, "the app is down" triage, incident response (roles, contact tree, GDPR 72h step; see `20`).

## 8. Release engineering

- **Versioning:** semver in `app.config.ts`; `versionCode`/`buildNumber` auto-incremented remotely (Android starts >= 20 per `19`); `runtimeVersion: { policy: "fingerprint" }` so OTA updates only reach compatible binaries.
- **OTA (EAS Update):** JS/asset/copy/config fixes only, never native changes or review-relevant features; percentage rollout on the `production` channel; rollback = republish the previous update. OTA is NOT the forced-update mechanism.
- **Forced update:** `app_config.minimum_supported_version` in Supabase, fetched on launch and cached; below minimum = blocking screen with store link; Android additionally uses the in-app updates API (`expo-in-app-updates`). Test by faking the minimum before submission.
- **The floor is PER PLATFORM** (`{"ios": "x.y.z", "android": "x.y.z"}`, since 2026-07-30). One global value had a failure mode with no recovery for the person hit by it: raise it when Android goes live while iOS is still in review, and every iOS user is hard-blocked by a no-dismiss screen telling them to install a build the App Store will not give them. **Raise each platform only once ITS OWN store shows the build live.** The alternative was an operational rule to wait for both, rejected because this project has already decided (ADR 0015) not to rely on guarantees a human has to remember, and here forgetting locks out real people rather than losing a log row. The client accepts a bare string as meaning both platforms, so an un-migrated environment keeps gating; anything malformed resolves to no floor and FAILS OPEN, which is the rule the whole gate is built on.
- **Staged rollout:** Play 10 > 25 > 50 > 100% over ~7 days; iOS phased release (pausable). **Written halt criteria:** crash-free < 99.5%, ANR > 0.5% (the Play vitals threshold), OTP success collapse, any moderation or data-integrity bug. Halt, fix, ship a higher version.
- **Cadence:** fortnightly store train early; OTA between trains; budget day-scale review time. The rebrand release (Grace Portal identity, new app) should expect a full-length review; the fixed-code review login is documented in the review notes (`03`).
- **Platform floors:** ship on Expo SDK 56+ (targets Android API 36, required for all Play updates from 2026-08-31; also satisfies the 16KB page-size requirement). Minimum supported OS: whatever the chosen SDK supports (state it in the store listing and test matrix); reviewed at every SDK upgrade. Yearly calendar entry: Play target-API deadline + Apple Xcode/SDK minimums. Play pre-launch report is a release gate.

## 9. Cost meters (verified 2026-07-12; every metered dependency, what happens at the cap)

| Meter | Plan/limit | Watch | At the cap |
|-------|-----------|-------|-----------|
| Supabase Pro | $25/mo: 8GB DB, 100GB storage, 250GB egress, 500 realtime concurrent | audio egress (1,000 plays of a 50MB MP3 = 50GB); realtime at Sunday-live peak | overage $0.09/GB egress; keep spend cap ON initially, alert at 80% |
| Resend (auth OTP email) | $0 free tier: 3,000 emails/month, 100/day; ~$20/mo on the first paid tier | monthly-volume alert (`03`); per-address/per-IP send caps | sign-in is rare (long sessions), so OTP volume sits far under the tier; a spike pages before quota exhausts |
| ~~WhatsApp Cloud API~~ | **REMOVED 2026-07-29** (ADR 0014). It was ~$200 per 2,000-member blast at UK/DE marketing rates, capped at 2 ministry blasts/month, to reach a subset of the push audience. Broadcasts are now push + in-app only, at zero marginal cost | n/a | none: the budget alert went with it |
| YouTube Data API | 10,000 units/day | sync uses playlistItems (1 unit); never search.list (100) | job logs quota errors |
| EAS | Free: 15+15 builds/mo, Update 1,000 MAU. The forgotten meter is Update MAU: a congregation > 1,000 exceeds Free the first OTA month | plan Starter ($19/mo) at launch | builds queue; updates stop serving |
| Sentry Free | 5K errors/mo, 1 seat | per-key rate limits (a crash loop exhausts it in hours); quota alert at 80% | events dropped |
| PostHog Free | 1M events/mo, EU cloud | generous; consent-gated per `20` | events dropped |
| healthchecks.io / UptimeRobot | free tiers (20 checks / 50 monitors) | sufficient | n/a |

## 10. Realtime capacity at the Sunday-live peak

Concurrent Realtime connections: Free 200 / Pro 500; messages: Free 2M/mo, Pro 5M/mo. The peak (HQ live, all branches watching) is exactly when every open app could hold a connection, and raw per-client Presence is O(N²): ~1M messages in ONE Sunday service at 400 concurrent, which exhausts Free in two Sundays and sits at Pro's included quota with join-storm rate-cap risk. **Rules:** clients never subscribe to raw Presence; a server-side aggregator tracks presence and broadcasts a single watching-now count every 10-15s (~1.2M msgs/mo at peak: clears Pro comfortably). ALL channels (live AND family) subscribe on screen focus and unsubscribe on blur. Any channel-join rejection at the connection cap degrades to the same 15s polling (static stability: counters degrade before streams do). Load-test the first big live event on the preview build; alert at 80% of connections.

## 11. Dependency-failure quick matrix (verified 2026-07-13; full rules live in the cited docs)

| Down | App behavior (defined in) | Detection (§6) | Recovery |
|------|---------------------------|----------------|----------|
| Supabase (full) | cached feeds + retry (`04`); queued taps replay, drafts preserved (`01` §8); video keeps playing | #5 REST probe | runbooks (§7); post-outage moderation spike expected (drafts flood in) |
| Realtime only | live count falls to 15s polling; feeds poll-bounded 60s (`02`) | #7 websocket probe | self-heals on reconnect |
| Storage only | audio falls to "Open on YouTube" (`08`); books read offline (`14`) | none needed (loud failures) | wait |
| Edge functions only | jobs pause then self-heal via dedupe keys (§5); stuck broadcast alert | #2 dead-man + #4 | re-run; resume broadcast |
| Resend / email delivery | guests unaffected; `AUTH-2` outage copy (`03`); sessions survive (refresh needs no OTP) | #3 absolute alarm | wait; comms via push |
| ~~Meta (WhatsApp)~~ | not a dependency any more (ADR 0014). Note the flip side: push is now the ONLY automated channel, so an Expo/APNs/FCM outage means a broadcast waits for members to open the app (the Notification Center still has it), or a leader pastes it into the church WhatsApp community via `17` §2 | #4 | wait out the provider; paste manually if urgent |
| YouTube embed | "Open on YouTube"; live-fail state machine + credit-on-open (`08`) | Sentry | replays |
| YouTube Data API | stale-but-working Watch; /live URL fallback (`01` §4) | #2 dead-man | next sync |
| Payhip site / dropped webhooks | buy fails visibly; reconciliation poll surfaces dropped events daily (`14`) | §5 reconciliation alert | manual grants (`17` §4) |
| Resend | email verify stalls; order-id restore path works (`14`) | #8 canary | retry later |
| Expo Push | lock-screen silence; in-app center still populates (`15`); dedupe prevents post-recovery double-sends | #4 + ticket-error alert | wait; 180-day prune backstop (§5) |
| Vercel (dashboard) | app fine; publishing pauses; 48h escalation absorbs hours (`17`) | #5 | redeploy |
| Church website | giving falls to offline bank details (`12`); universal links degrade to browser | #5 (note: content of .well-known files is NOT checked, only HTTP 200) | redeploy |
