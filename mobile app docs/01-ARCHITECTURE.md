# 01 · Architecture

## 1. Client: React Native + Expo

**Decision: React Native with Expo (managed workflow, EAS Build).**

### Why Expo over the alternatives

- **One codebase, both stores.** iOS + Android from the same TypeScript. A church team cannot maintain two native codebases.
- **You already ship RN-friendly.** You have an Apple Developer account (non-profit, fee waived) and an app already on the App Store: the hardest account/logistics hurdles are cleared.
- **Windows-friendly dev + cloud iOS builds.** This is the key one: see §2. Expo's **EAS Build** compiles iOS in the cloud, so you do **not** need a Mac to produce an installable iOS build. (This is precisely the Flutter pain point you hit: Flutter still expects local Xcode/macOS for iOS.)
- **OTA updates.** Expo Updates lets you push JS-only fixes without a full store review: valuable for copy/verse/typo fixes.
- **Batteries included.** Expo modules cover almost everything we need: `expo-audio` (playback + background + lock-screen controls; `expo-av` was removed in SDK 55, never reference it), `expo-notifications` (push), `expo-secure-store` (auth key), `expo-localization` (language), `expo-image`, `expo-web-browser` (link-out giving), deep linking, etc.
- **SDK floor:** target **Expo SDK 56+** at kickoff (Play requires target API 36 for all updates from 2026-08-31; SDK 56 also forked Expo Router from React Navigation). Track SDK upgrades per the release calendar in `21-OPERATIONS.md`.

### Core libraries

| Concern | Library |
|---------|---------|
| Navigation | **Expo Router only** (file-based; since SDK 56 it is forked from React Navigation: never import `@react-navigation/*` directly) |
| Server state / caching | **TanStack Query** (React Query) |
| Local/client state | Zustand (light) or React Context |
| Backend SDK | `@supabase/supabase-js` |
| Audio playback + background | **`expo-audio`** (SDK 55+: background playback config plugin + lock-screen controls, see `08`). Fallback only if gaps emerge: RNTP v4 (check `@rntp/player` licensing before any v5 use) |
| Video | YouTube via `react-native-youtube-iframe` or `expo-web-browser` deep-link |
| Push | `expo-notifications` + Expo Push service |
| Secure token storage | `expo-secure-store` |
| Localization | `expo-localization` + `i18next` / `react-i18next` |
| Maps (global family map) | **`react-native-svg` stylized world map** (bundled topojson geometry, lat/lng projected to SVG; fully offline, themable, no native SDK or API keys). `react-native-maps` only if a future feature needs real geography |
| Forms | `react-hook-form` + `zod` |
| Images | `expo-image` (caching, blurhash) |

## 2. Developing & testing from a Windows PC

You asked specifically: **can you build on Windows and still test the iOS version?** Yes: with caveats. Here's the exact picture.

### Android (fully local on Windows)
- Develop in VS Code on Windows.
- Test on a physical Android or the Android emulator (Android Studio) via the **EAS development build** (same dev-build workflow as iOS; Expo Go is frozen at SDK 54 and not the workflow).
- Full debug/hot-reload locally. No cloud needed.

### iOS (from Windows: no Mac required for most of it)
- **Live development / testing on your iPhone: EAS development build**, not Expo Go. (Reality check 2026: the store version of Expo Go is frozen at SDK 54, remote push broke in Go since SDK 53, and background audio/config plugins never worked there; Expo now positions Go as an educational tool.) Workflow: register the iPhone (`eas device:create`), build the dev client (`eas build --profile development -p ios`, ad hoc distribution), install via the QR link once, then `npx expo start` on Windows connects with full hot reload: the same day-to-day feel, full feature coverage. Rebuild the dev client only when native deps/config change (the fingerprint tells you). TestFlight internal distribution is the alternative install path.
- **iOS dev build / TestFlight / App Store build:** use **EAS Build** (`eas build -p ios`). Apple's binary is compiled **on Expo's cloud macOS machines**: you never touch a Mac. The `.ipa` is then submitted via **EAS Submit** to TestFlight/App Store.
- **What still benefits from a Mac (optional, not required):** the native iOS Simulator (Windows can't run it: use a real iPhone instead), and Xcode-level native debugging (rarely needed for this app). A cheap cloud-Mac (MacStadium, or a few hours of a rented Mac) covers edge cases, but the plan assumes **you build iOS entirely from Windows via a real iPhone + EAS.**

### Because this app REPLACES Grace Portal on the stores
- Your Apple Developer account, certificates, and App Store Connect are set up. EAS can manage signing credentials for you (it stores and reuses them). Reuse the existing Apple team.
- **Do NOT create a new App ID or package name.** Decision (2026-07-12): this app ships as an update to the existing Grace Portal listings, so current installs receive it automatically. Identity must match exactly (full plan in `19-MIGRATION-GRACE-PORTAL.md`):
  - **Android:** `applicationId = com.oami.agbcapp`, `versionCode` > 19, signed with the existing upload keystore (`agbc-app/agbc-new-upload-key.jks`, uploaded to EAS credentials).
  - **iOS:** `bundleIdentifier = com.olayinkaademiluka.grace-portal`, same App Store Connect record, build number above the last shipped build.

## 3. Backend

Two viable paths. **Recommended: managed BaaS (Supabase).** The custom path is documented so the decision is informed.

### Recommended: Supabase (managed)

> **Decision (2026-07-12): reuse the existing Supabase project** that Grace Portal and the agbc website already share; it becomes **production**. The website's ~3 tables are fenced off and untouched; Grace Portal's tables are removed after audit + backup. Full cleanup plan in `19-MIGRATION-GRACE-PORTAL.md`. Verify the project region is EU/UK (see `20-PRIVACY-COMPLIANCE.md`).

A single platform giving us everything the feature set needs:

| Need | Supabase piece |
|------|----------------|
| Relational data (users, testimonies, prayers, events, RSVPs, attendance, courses…) | **Postgres** |
| Auth (phone OTP) | **Supabase Auth** (phone provider → Twilio Verify: WhatsApp first, SMS fallback, see `03`) |
| File storage (audio sermons, book files, images) | **Storage** (S3-compatible, signed URLs) |
| Realtime (live testimony feed, prayer counts, "watching now") | **Realtime Broadcast** from DB triggers on private channels (sanitized payloads; NOT `postgres_changes` on content tables, which would leak anonymous authors: see `02` invariants). "Watching now" = Realtime Presence |
| Server logic (moderation actions, push fan-out, WhatsApp, receipts) | **Edge Functions** (Deno) |
| Fine-grained permissions (guest read, member write, leader moderate) | **Row-Level Security (RLS)** policies |

**Why:** RLS maps cleanly onto our guest/member/leader model; realtime powers the Family feed and live counts for free; storage + signed URLs handle self-hosted audio and owned-book files; one vendor, one bill, minimal ops for a church team.

### Alternative: custom backend

If a fully custom backend is preferred, here's what it takes and roughly what it costs.

**What you'd need to build/run:**
- **API server**: Node (NestJS/Express) or similar, REST or GraphQL.
- **Database**: managed Postgres (Neon, RDS, Supabase-as-DB-only).
- **Auth**: phone OTP yourself (Twilio Verify) + JWT issuance/refresh, session revocation, rate-limiting.
- **File storage + CDN**: S3 + CloudFront (audio, books, images), signed URLs.
- **Realtime**: WebSocket layer (Socket.IO) or a service (Ably/Pusher) for feeds and live counts.
- **Background jobs**: push fan-out, WhatsApp sends, scheduled verse-of-day, receipts (a queue: BullMQ/Redis, or serverless cron).
- **Admin API**: endpoints powering the leader dashboard.
- **DevOps**: hosting, CI/CD, logging, backups, monitoring, secrets, security patching.

**Rough monthly cost (early scale, low thousands of users):**
- Managed Postgres: **$0–25** (free tiers → small paid).
- App/API hosting (Render/Railway/Fly): **$7–25**.
- Object storage + CDN: **$1–10** (audio bandwidth is the variable; a few GB/month is cents, heavy sermon-audio streaming grows this).
- OTP (Twilio Verify): usage-based per verification. WhatsApp delivery is cheaper and far more reliable than SMS for Nigerian numbers (SMS to NG suffers DND filtering and costs well above the usual ~$0.05); SMS is the fallback channel. 1,000 sign-ins lands in the tens of dollars, one-off-ish (only on new sign-in, not every open).
- WhatsApp (Cloud API): **per-message billing** (Meta changed models in 2025); a marketing-category ministry-wide blast to 2,000 opted-in members costs roughly **$200 per blast** at UK/DE rates. Policy: push + in-app are the default channels; WhatsApp broadcasts capped at 2 ministry-wide sends/month (see `21-OPERATIONS.md` §9).
- Push (Expo/FCM/APNs): **free**.
- Redis/queue (if used): **$0–10**.
- **Total realistic early range: ~$25–120/month**, dominated by SMS volume and audio bandwidth. Supabase's managed path lands at the **low end of this** ($0 free tier → $25 Pro) while removing most of the DevOps labor: which is the real cost for a small team.

**Recommendation:** Start on **Supabase**. It gives a custom-quality Postgres schema (you own the SQL and can migrate off later) without the ops burden. Revisit a bespoke backend only if a specific requirement outgrows it.

> Whichever path: **the data model in `02-DATA-MODEL.md` is backend-agnostic.** It's plain relational Postgres and applies to both.

## 4. Media strategy

- **Video sermons + HQ live:** **YouTube** (channel `@Pastorolayinkaademiluka`). The app lists/embeds; it does not host video. Live = the channel's `/live` URL, upgraded to the precise stream via YouTube Data API when available. v1 = **HQ channel only**; per-branch channels are supported in the model (`branches.youtube_channel_id`) for later decentralization.
- **Audio sermons (self-hosted):** upload MP3/AAC to **Storage**; stream via signed URL. Client tracks playback position for **resume**, supports **background + lock-screen** playback (see `08`). This is the "listen while driving / save data" capability members asked for.
- **Books:** purchased on web (Payhip); the **file** (EPUB/PDF) is entitled to the buyer and read in-app from Storage (see `14`).

## 5. Integrations

| Integration | Purpose | Notes |
|-------------|---------|-------|
| YouTube Data API | Sermon list, live detection | Keyless RSS fallback caps at 15 entries |
| Stripe (via web) | Card giving | v1 links out to the existing web giving page |
| PayPal (via web) | Giving | `paypal.me/agbcglobal` |
| Payhip (via web) | Book purchase | Reader-app model; no store cut |
| Twilio Verify | OTP delivery | WhatsApp channel first, SMS fallback (see `03`) |
| WhatsApp Cloud API | Broadcast + shares | Complements push (see `15`) |
| Expo Push (APNs/FCM) | Push notifications | |
| Sanity | Events CMS | Post-v1 sync option only; v1 events are manual via the dashboard (see `11`) |
| Resend | Transactional email | Email-verification OTPs via Supabase Auth custom SMTP (see `20`); the website already uses Resend |

## 6. Environments

- **dev** (local dev builds + `supabase start` as the daily loop; a fresh free-tier hosted Supabase project for integration/preview), **production** (store builds + the existing shared Supabase project on Pro, see `19`). Staging exists only as the short-lived cleanup-rehearsal project (`19`/`21` §2).
- Secrets in EAS secrets / Supabase env; never in the client bundle.
- OTA channel per environment.

## 7. Analytics & observability

- Product analytics: **PostHog (EU cloud)** (decision 2026-07-12; Firebase Analytics dropped). Consent-gated: anonymous/cookieless mode or in-app opt-in; nothing non-essential fires before consent (see `20`). The v1 event list and north-star metrics live in `22-CONTENT-OPERATIONS.md` §5; instrument in Phase 2.
- Crash reporting: Sentry (Expo-compatible), configured to scrub PII (no phone numbers or user content in events/breadcrumbs).
- Backend logs + DB metrics via Supabase dashboard (or provider equivalent).

## 8. Offline write policy

Reads are cache-first everywhere (TanStack Query with a persisted cache). Writes fall into two classes:

- **Queued (idempotent one-tap actions):** attendance "I'm here" (carrying `client_taken_at`, see `02`), plan-day complete, RSVP status, Glory / "I prayed" toggles, playback position. Offline: enqueue locally (persisted), show optimistic UI, replay on reconnect. **The queue stores desired END-STATE per (action, entity), not an op log:** the last tap wins locally and exactly one idempotent write replays per entity (a tap-untap-tap sequence replays as one "reacted" write; ordering races cannot occur). Safety: each write is idempotent server-side via the unique constraints in `02`. Conflict policy: server state wins; a rejected replay reconciles the UI quietly. The queue is small and capped: eviction removes whole entities, oldest first, and REVERTS that entity's optimistic UI on eviction; cleared on sign-out.
- **Not queued (content + auth):** testimony/prayer composition, course registrations, profile edits, OTP. These need a server response: offline shows a clear error, preserves the draft, and offers retry. Never auto-submit content composed offline without the user seeing it happen.
