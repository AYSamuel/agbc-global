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
  - mobile: typecheck, ESLint, Jest + React Native Testing Library, `expo-doctor`
  - dashboard: typecheck, ESLint, Vitest, build
  - supabase: `supabase start` on the runner, apply full migration history, `supabase test db` (pgTAP), `deno test` for functions, types-drift check (`supabase gen types typescript --local` diffed against the committed file), fence-guard grep (no migration references the website's fenced objects). CI time budget: cache the Supabase Docker images in Actions and run pgTAP files in parallel; the supabase job exceeding 10 minutes is treated as a regression
- **supabase-deploy.yml:** merge to `main` auto-applies migrations + functions to DEV. Prod deploy is a **manually triggered `workflow_dispatch` job** (the solo-dev equivalent of an approval gate; reviewer-gated environments need a paid tier on private repos, deferred per `23`/`24`); the prod `SUPABASE_ACCESS_TOKEN` + db password live ONLY in the `production` environment's secrets, consumed exclusively by that workflow. If GitHub Team is ever adopted, upgrade this to a required-reviewer environment gate.
- **release.yml:** version tag triggers `eas build --profile production` + `eas submit`.
- **nightly.yml:** Maestro E2E on Android emulator profiles (small phone + tablet), full migration history against a fresh DB, pseudo-localization run, `supabase db dump` of prod uploaded encrypted off-provider (see §7).
- **EAS profiles** (`eas.json`): `development` (dev client, internal, dev Supabase), `preview` (internal distribution, channel `preview`, dev Supabase), `production` (store, channel `production`, prod Supabase). `cli.appVersionSource: "remote"` + `autoIncrement`. Client config (Supabase URL, anon key) via EAS environment variables read in `app.config.ts`; never in the repo.
- **Secrets map:** GitHub repo secrets: `EXPO_TOKEN`, dev Supabase token. GitHub `production` environment only: prod Supabase token + db password. EAS env: public client config only. Supabase function secrets: `TWILIO_*`, `WHATSAPP_TOKEN`, `YOUTUBE_API_KEY`, `PAYHIP_API_KEY`, `RESEND_API_KEY`/SMTP creds. EAS credentials (not env vars): the Android upload keystore, the **FCM V1 service account key** (required for Expo Push on Android even with no Firebase SDK in the app), and the APNs .p8 key. GitHub secrets also hold the Sentry auth token (sourcemap upload; the DSN itself is public-by-design and lives in EAS/Vercel env). Vercel: per-environment as above. Nothing secret ships in the app bundle (the anon key is public by design; RLS is the boundary); a build-time scan asserts no service key/vendor token appears in the JS bundle.
- **Protection:** on the free plan, enforced branch protection is unavailable on private repos, so branch discipline (PRs + green checks before merge) is by convention until GitHub Team; required status checks are still configured so the upgrade is a toggle. Renovate: security updates fast-laned, routine bumps on a cooldown (no day-zero installs), lockfile committed.

## 4. Testing strategy (the merge gate)

| Layer | Tool | Covers |
|-------|------|--------|
| Unit | Jest (`jest-expo`); Vitest (dashboard) | streak/ISO-week math incl. DST + branch-timezone matrix, service_date derivation, gate-return state machine, offline queue reducer, currency/fee selection, i18n plurals (DE/NL) |
| Component | React Native Testing Library | the four data states per feed screen, GateSheet trigger + return, compose + consent flow, forced-update gate, MY-POSTS states |
| RLS / authz | pgTAP via `supabase test db` (+ basejump `supabase_test_helpers`) | every table has RLS forced; guest sees only approved; anonymous prayers never expose `author_id`; **each Write-path invariant bypass attempt fails** (insert approved, self-set role, edit approved without re-pend, member INSERT into `entitlements`, backdated `attendance`, foreign-author `from_prayer_id`); blocked-author rows invisible both ways; leader branch-scope; foreign-id IDOR probes on dashboard routes; ministry broadcast refused without a distinct approver; WhatsApp cap refusal; mark-answered on a non-approved prayer fails; author edit of a `removed` row fails; RSVP against a cancelled/started event fails; broadcast edit during `pending_approval` clears `approved_by`; writes from a deleted profile fail; writes without `onboarded_at` fail; `attendance.client_taken_at` clamps (72h/future) |
| Edge functions | `deno test` unit + `supabase functions serve` integration | Payhip: same signed fixture replayed twice = one entitlement, unknown event = 200; fan-out chunking; OTP funnel logging |
| Contracts | zod schemas in `packages/shared` + types-drift CI job | app and edge functions cannot disagree silently; consumers tolerate unknown fields (old app versions outlive the backend) |
| E2E | **Maestro** (2026 Expo consensus; runs on dev/release builds) | journeys only: guest browse Home > Watch > Give bank details; OTP sign-in with the review number (bypass flag is always on in dev/preview, `03`); post testimony > pending; Glory gate-return; RSVP; block a member > their content disappears; devotional day complete |
| Edge integration extras | `supabase functions serve` | email verify then restore-purchase grants exactly once; a forged refund event does not revoke |
| Manual matrix | per release | one low-end real Android on the minimum OS + current iPhone, at small phone / large phone / tablet widths, 2x text scale, VoiceOver + TalkBack pass |

Cadence: per PR = everything except E2E; nightly = Maestro + migration-history + pseudo-loc; pre-release = Maestro both platforms + the manual matrix.

## 5. Background jobs (scheduler: Supabase Cron = pg_cron + pg_net; it schedules but does NOT retry skipped runs or alert, so every job below ends by pinging its healthchecks.io dead-man check; a missed ping alerts)

| Job | Schedule | Idempotency | Failure blast radius |
|-----|----------|-------------|----------------------|
| YouTube sync | nightly 03:00 UTC | upsert on `youtube_id`; uses uploads-playlist `playlistItems.list` (1 quota unit), never `search.list` (100) | Watch goes stale silently |
| Live detection | every 5 min around `branch_services` windows (edge function) | sets/clears `sermons.is_live` | live banner wrong |
| Streak recompute | on-write trigger (primary) + weekly cron safety net, lease-locked | pure function of `attendance`, safe to re-run | streaks stale |
| Service reminders | every 15 min | computes due services per branch timezone; `notifications.dedupe_key` (`02`) so re-runs never double-send | reminders silently stop (the canonical failure) |
| Event RSVP reminders | hourly | events starting within the reminder window; dedupe via `notifications.dedupe_key` (`rsvp_reminder:<event_id>`) | promised reminders (`11`) never fire |
| Broadcast fan-out | event-driven (dashboard send) | chunked via `broadcast_deliveries` rows with cursor resume; dedupe unique(broadcast_id, device_id); batches of 100 per Expo call | partial sends; must be resumable and haltable |
| Push receipts | every 15 min | sweeps ALL unprocessed tickets (`push_tickets` + `broadcast_deliveries`, `02`): AUTOMATED pushes are not fire-and-forget; delete `devices` on `DeviceNotRegistered`; alert if > 10% of a day's automated tickets error | dead tokens accumulate; Expo throttles senders who ignore receipts; note Expo keeps receipts only ~24h |
| Payhip inbox processing | every 5 min | processes `payhip_events` rows; grant AND refund confirmed against the Payhip API (product id, buyer email, amount taken from the API response only, `14`); unique `source_ref`; re-sweeps `unmatched_purchases` as the drain safety net (primary drain = trigger on email verification) | buyers cannot read purchased books |
| Payhip reconciliation | daily | pulls the last 7 days of transactions from the Payhip API; any transaction id missing from `payhip_events` is inserted as a synthetic event (unique id: idempotent); alert when a confirmed sale has no entitlement or unmatched row after 24h | silently DROPPED webhooks (incl. refunds) are otherwise invisible until a buyer complains |
| Retention purges | monthly | notifications = drop old partitions; reports > 24 months; `broadcast_deliveries` > 30 days; `payhip_events` payload redaction + 12-month purge; unclaimed `unmatched_purchases` > 12 months; `push_tickets` > 7 days; **`devices` with `last_seen_at` > 180 days** (the pruning backstop when receipts were missed: the token re-registers on next app open); batched deletes elsewhere | GDPR retention drift |
| Verse queue monitor | daily | alert admins when < 14 future `daily_verses` rows exist | the daily touchpoint dies quietly |
| Counter reconciliation | nightly | recount glory/pray mismatches | drifted counts |
| Dev keep-alive | weekly (dev project only) | trivial query | dev project pauses |

## 6. Observability (the minimal owned alert set)

1. **Sentry** (app + dashboard + Deno SDK in edge functions), PII scrubbing on: alert on a new issue hitting > 5 users/hour; crash-free sessions < 99.5% during a rollout = halt criterion.
2. **healthchecks.io** dead-man pings on every job in §5 (free tier: 20 checks).
3. **OTP funnel, every served country:** log verification started/succeeded per country (no phone numbers); daily check alerts when any country's success < 70% over 24h; PLUS an absolute alarm: > 20 consecutive failed verifications ministry-wide within 30 minutes pages immediately (catches a Sunday-morning total outage the daily check would miss); Twilio Console triggers on error rate and monthly spend remain as backup.
4. **Broadcast health:** alert if > 10% of a broadcast's deliveries fail (push receipts + WhatsApp statuses), AND alert when a broadcast sits in `sending` longer than 15 minutes with zero failures (an edge outage mid-send is otherwise invisible); runbook step: resume (cursor) or halt.
5. **UptimeRobot** (free): the web giving page (shared external SPOF: card/PayPal giving dies with the website; offline bank details in `12` cover the gap, but only an alert tells you), the church website, the dashboard, the Supabase REST endpoint.
6. **Supabase usage:** check egress/DB size/realtime connections at 80% of plan; spend cap decision recorded.
7. **Realtime health:** probe the Realtime websocket endpoint (UptimeRobot or the health job): §6.6 watches usage, not service health, and a Realtime-only outage silently degrades the Art. 9 removal guarantee to its 60s polling bound (`02`).
8. **Resend canary:** weekly, the verse-monitor job sends itself one email via Resend and pings a dedicated dead-man check (email verification otherwise fails silently until a buyer hits it).

## 7. Backups and disaster readiness

- Production on **Pro** remains the pre-launch requirement (Free's 5GB/month egress cannot serve sermon audio, and Free has NO backups). **Decision 2026-07-13: the upgrade is deferred for now.** Hard precondition while on Free: the nightly off-provider `db dump` pipeline + one verified restore MUST exist before any destructive work on the shared project (the `19` cleanup); until then, prod (including the live website's data) is one incident away from unrecoverable loss. PITR: start without, revisit at scale; RPO with nightly dumps = up to 24h accepted, recorded.
- Storage objects (sermon audio, book files, avatars) are NOT in database backups: a nightly Storage sync job copies buckets off-provider.
- Nightly `supabase db dump` via GitHub Actions to encrypted off-provider storage (survives a Supabase account-level incident).
- **Restore drill** once before launch and quarterly: restore the latest dump into a scratch project, boot the dashboard against it, record time taken.
- **Bus factor:** credentials inventory in `docs/runbooks/credentials.md`: every account (Apple, Google Play, Supabase org, Twilio, Meta Business, Payhip, EAS/Expo, GitHub, Vercel, registrar), its owner, second owner, billing card, renewal date. Second owner added to Apple (App Store Connect Admin), Supabase org, and the password-manager vault (church officer). Keystore copies: EAS credentials + encrypted vault entry + offline USB in the church safe (Play App Signing means a lost upload key is recoverable via support, not fatal; note it in the runbook).
- Runbooks: deploy, rollback (OTA republish previous update; store = halt rollout + higher version), restore-from-backup, rotate-each-secret, "the app is down" triage, incident response (roles, contact tree, GDPR 72h step; see `20`).

## 8. Release engineering

- **Versioning:** semver in `app.config.ts`; `versionCode`/`buildNumber` auto-incremented remotely (Android starts >= 20 per `19`); `runtimeVersion: { policy: "fingerprint" }` so OTA updates only reach compatible binaries.
- **OTA (EAS Update):** JS/asset/copy/config fixes only, never native changes or review-relevant features; percentage rollout on the `production` channel; rollback = republish the previous update. OTA is NOT the forced-update mechanism.
- **Forced update:** `app_config.minimum_supported_version` in Supabase, fetched on launch and cached; below minimum = blocking screen with store link; Android additionally uses the in-app updates API (`expo-in-app-updates`). Test by faking the minimum before submission.
- **Staged rollout:** Play 10 > 25 > 50 > 100% over ~7 days; iOS phased release (pausable). **Written halt criteria:** crash-free < 99.5%, ANR > 0.5% (the Play vitals threshold), OTP success collapse in any country, any moderation or data-integrity bug. Halt, fix, ship a higher version.
- **Cadence:** fortnightly store train early; OTA between trains; budget day-scale review time. The rebrand release (Grace Portal identity, new app) should expect a full-length review; the fixed-OTP review login is documented in the review notes (`03`).
- **Platform floors:** ship on Expo SDK 56+ (targets Android API 36, required for all Play updates from 2026-08-31; also satisfies the 16KB page-size requirement). Minimum supported OS: whatever the chosen SDK supports (state it in the store listing and test matrix); reviewed at every SDK upgrade. Yearly calendar entry: Play target-API deadline + Apple Xcode/SDK minimums. Play pre-launch report is a release gate.

## 9. Cost meters (verified 2026-07-12; every metered dependency, what happens at the cap)

| Meter | Plan/limit | Watch | At the cap |
|-------|-----------|-------|-----------|
| Supabase Pro | $25/mo: 8GB DB, 100GB storage, 250GB egress, 500 realtime concurrent | audio egress (1,000 plays of a 50MB MP3 = 50GB); realtime at Sunday-live peak | overage $0.09/GB egress; keep spend cap ON initially, alert at 80% |
| Twilio Verify | ~$0.05/successful verification + channel fee (WhatsApp auth template cheap; SMS to NG dearer + DND-filtered) | monthly spend trigger + Fraud Guard ON + geo allowlist (`03`) | fraud spike pages someone instead of running a bill |
| WhatsApp Cloud API | per-message billing (Meta changed models in 2025); marketing-category ~$0.09-0.12+ in UK/DE; one 2,000-member ministry blast ~ $200 | **policy: max 2 ministry-wide WhatsApp blasts/month** (decision 2026-07-12); push + in-app are the defaults; dashboard shows estimated cost before send | monthly budget alert |
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
| Twilio WhatsApp channel | SMS fallback carries sign-in (`03`) | #3 funnel | automatic |
| Twilio both channels | guests unaffected; `AUTH-2` outage copy (`03`); sessions survive | #3 absolute alarm | wait; comms via push |
| Meta (also takes Verify WhatsApp) | broadcasts fall to push + in-app (`15`) | #4 | resume failed legs |
| YouTube embed | "Open on YouTube"; live-fail state machine + credit-on-open (`08`) | Sentry | replays |
| YouTube Data API | stale-but-working Watch; /live URL fallback (`01` §4) | #2 dead-man | next sync |
| Payhip site / dropped webhooks | buy fails visibly; reconciliation poll surfaces dropped events daily (`14`) | §5 reconciliation alert | manual grants (`17` §4) |
| Resend | email verify stalls; order-id restore path works (`14`) | #8 canary | retry later |
| Expo Push | lock-screen silence; in-app center still populates (`15`); dedupe prevents post-recovery double-sends | #4 + ticket-error alert | wait; 180-day prune backstop (§5) |
| Vercel (dashboard) | app fine; publishing pauses; 48h escalation absorbs hours (`17`) | #5 | redeploy |
| Church website | giving falls to offline bank details (`12`); universal links degrade to browser | #5 (note: content of .well-known files is NOT checked, only HTTP 200) | redeploy |
