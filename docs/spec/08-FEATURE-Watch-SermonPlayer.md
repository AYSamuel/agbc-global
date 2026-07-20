# 08 · Feature: Watch & Sermon Player

## Purpose
Let anyone catch a message they missed, watch or **listen**, on any branch's feed, with the "listen while driving / save data" experience members asked for: **audio-only, background + lock-screen playback, resume where I paused.**

## User stories
- As a member, I can listen to a sermon in the background while driving and pick up where I left off.
- As a visitor, I can watch the latest message without an account.
- As anyone, I can watch the HQ Sunday live stream.

## Screens
`WATCH` (tab) · `SERMON` (player) · `LIVE` · `WATCH-SEARCH` · `SERMON-NOTES` · `MY-LIST`

### `WATCH` (Tab 2)
- **Featured hero**: latest/pinned message → `SERMON`.
- **Live state**: if HQ is live now, a live banner → `LIVE`. Otherwise no dead "live" tab; show replays.
- **Rails (mirrors the website's watch page, decision 2026-07-20)**: **Recent messages** = the channel's Videos tab only (UULF playlist: long-form uploads, no Shorts, no stream recordings), three shown + See all; **Recent live streams** = the Live tab (UULV playlist), three shown + See all; Series chips; (later) per-branch. Scheduled premieres (`liveBroadcastContent = 'upcoming'`) never appear: nothing watchable exists yet and their thumbnails are placeholders.
- **Search** icon → `WATCH-SEARCH`.
- Each card: thumbnail, title, speaker, duration, **progress bar** (member resume), **Save** (gate), overflow (Share, audio-only).

### `SERMON` (player)
- **Video** (YouTube embed) or **audio** (self-hosted). Toggle **Audio-only** to switch to the self-hosted audio stream (data-saving); available only when the sermon has an `audio_url`.
- **Resume (two layers, decision 2026-07-20):** positions are saved **locally on the device for everyone, guests included** (a phone call must never cost you your place), and members ADDITIONALLY sync `playback_positions` server-side so the position follows across devices. On open, seek to the server position when signed in, else the local one; write every ~10s, on pause/exit, and on backgrounding. A position within 30s of the end is treated as finished (start over), and under 15s is not worth restoring. The local layer shipped with the Watch slice (W1.3/W1.4 window); the server-synced layer lands with the audio slice (W3.1).
- **Background + lock-screen (self-hosted audio only):** engine = **`expo-audio`** (SDK 55+). Config plugin `["expo-audio", { "enableBackgroundPlayback": true }]` (adds iOS `UIBackgroundModes: audio` and Android `FOREGROUND_SERVICE_MEDIA_PLAYBACK` + controls service); `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' })`; `player.setActiveForLockScreen(true, { title, artist, artwork })` is mandatory on Android (without lock-screen controls, background audio stops after ~3 minutes). Declare the mediaPlayback foreground-service type in the Play Console app-content form. `expo-av` is removed from Expo (SDK 55); `react-native-track-player` is a fallback only, evaluated if expo-audio gaps emerge (v5 `@rntp/player` is commercially licensed: check before any use). YouTube video pauses when backgrounded; background YouTube playback is a Premium feature we must not replicate.
- Actions: play/pause/seek, ±15s, speed (1x/1.25x/1.5x), **Add note** → `SERMON-NOTES` (gate), **Save** (gate), **Share** (OS/WhatsApp), **Open on YouTube** (fallback).

### `LIVE`
- Live video (HQ channel `/live` or precise stream via YouTube Data API).
- **"Watching now"** realtime count.
- **Auto-attendance (precise rule):** opening `LIVE` during an active `branch_services` window of the streaming branch (v1: HQ) writes attendance ONCE, immediately, with `source='live_watch'` and `branch_id` = the streaming branch. The row stands even if the stream never goes live: **credit-on-open IS the failed-stream protection**, no separate grace mechanism needed. Counts toward rhythm.
- Ends → replay (`SERMON`) or back to `WATCH`.
- **Scheduled-but-absent state machine (the stream fails on Sunday):** during a `branch_services` window with no live stream, show "We'll be live soon: hold on" with replays below; after 15 minutes degrade to "We couldn't go live today" + the latest message. Never a spinner, never a countdown reaching zero into nothing. Members who opened `LIVE` during the window already have their attendance row (credit-on-open, above), so a failed stream never breaks a streak.

### `WATCH-SEARCH`
- Query title/speaker/series. Empty → recent searches / suggestions. No results → "No messages found" + clear.

### `SERMON-NOTES`
- Member's private notes for a sermon (`sermon_notes`), autosaved. List in More → (via sermon) or profile.

### `MY-LIST`
- Saved sermons (`saved_items`). Empty → "Save messages to watch later" + browse CTA.

## Media architecture
- **Video:** YouTube via `react-native-youtube-iframe` + `react-native-webview` (pin the version; maintenance has slowed, community forks exist; keep "Open on YouTube" as the tested fallback path). v1 = **HQ channel only** (a config value, not a `sermons` column). Model supports `branches.youtube_channel_id` for future per-branch decentralization.
- **YouTube ToS box (Data API branding rules):** thumbnails and titles from the Data API are shown unmodified; playback-initiating thumbnails are at least 120x70px; YouTube attribution is visible on Watch rails and the player and never obscured; the app name never contains "YouTube"; all Data API calls (sync + live detection) run in edge functions, the API key never ships in the client.
- **Audio:** MP3/AAC in Storage, streamed via signed URL. A sermon row may have `youtube_id` and/or `audio_url`. Audio-only exists **only when `audio_url` is present**. Never extract, proxy, or background-play the audio track of a YouTube video: that violates YouTube's Terms of Service and is an app-review risk. No `audio_url` ⇒ the toggle is disabled with a tooltip.
- **Operational commitment:** the "listen while driving" promise only exists for sermons whose MP3 was actually uploaded. Uploading the week's audio via the dashboard is a standing weekly task; assign its owner (media team) before launch (`18`).
- **Sync (job spec, see `21` §5):** nightly edge function (Supabase Cron) pulls the **Videos-tab (UULF) and Live-tab (UULV) playlists** via `playlistItems.list` plus one `videos.list` batch (1 quota unit per call; never `search.list` at 100 units; mirrors the website's youtube-api client, 2026-07-20), records each row's `kind`, drops scheduled premieres, and upserts `on conflict (youtube_id) do update` (partial unique index, idempotent retries). Videos that vanish from the channel are marked `status='unavailable'`, never deleted: resume positions, notes, and My List survive. Keyless RSS fallback caps at 15, cannot tell tabs or premieres apart (degraded by design), and never overwrites a stored `kind`.
- **Sermon rot handling:** an `unavailable` sermon's player shows "This message is no longer available" and falls back to the self-hosted audio if `audio_url` survives; My List renders it greyed with a remove action; notes stay reachable. **Restore is symmetric:** the nightly sync sets `status='available'` for any row whose youtube_id reappears in the uploads playlist (`unavailable` is only ever the reflection of the last sync).
- **Stale live-flag bound:** `sermons` gains `live_checked_at`; clients treat `is_live` as false when `live_checked_at` is older than 15 minutes (a dead detection job can never advertise a live service into dead air), and the nightly sync clears any stale `is_live` it finds.

## Data
- Reads: `sermons`, `playback_positions`, `saved_items`, `sermon_notes`.
- Writes: `playback_positions` (throttled), `saved_items`, `sermon_notes`, `attendance` (live watch).

## States / edge cases
- **Guest:** watch/listen freely; Save/notes gate. **Resume works for guests too**, from the device-local position (decision 2026-07-20, superseding the earlier "guests always start at 0" rule); only the cross-device sync of that position is a member perk.
- **No network:** show cached list; player shows retry + "open on YouTube."
- **Live not running:** live banner hidden; `/live` handled gracefully.
- **Audio missing for a sermon:** audio-only disabled with tooltip.
- **Playback interrupted (call/route change):** pause + preserve position. The YouTube embed lives in a WebView that Android may tear down while backgrounded, so the position is captured on the AppState transition rather than trusted to survive inside the player.
- **Backgrounded then killed:** position already persisted server-side (throttled writes) so resume survives app death.

## Permissions
- Browse/watch/listen: guest. Resume/save/notes: member.

## Acceptance criteria
- [ ] Audio plays with app backgrounded and shows lock-screen controls.
- [ ] Reopening a partly-heard sermon resumes within a few seconds of where it stopped (member).
- [ ] HQ live is detectable and playable with a live "watching now" count.
- [ ] Guests can watch the latest message with no gate; only personalization gates.
- [ ] No "live" dead end when nothing is live.
