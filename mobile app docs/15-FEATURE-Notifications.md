# 15 · Feature: Notifications (Push + WhatsApp) & Notification Center

## Purpose
Reach the family where they are, at the right scope, without spamming. Combines **push** (Expo/APNs/FCM) with **WhatsApp** (the audience's native channel) and an **in-app Notification Center**.

## Channels
1. **Push**: real-time, primary. Expo Push → APNs (iOS) / FCM (Android).
2. **WhatsApp**: via WhatsApp Cloud API (or provider). For broadcasts and shares; complements push for a WhatsApp-first audience. **Opt-in** (`notification_prefs.whatsapp_opt_in`).
3. **In-app Notification Center** (`NC`): a durable log; every notification also lands here.

> **Android channels + permission ordering:** SIX channels: five map 1:1 to pref keys (ministry, branch, service reminders, prayer activity, testimony activity) plus a `transactional` channel with no pref key (always-on action confirmations). Ordering rule: create ALL SIX channels at first app start (Android 13+ will not show the permission prompt until a channel exists), request permission in-context per `06`, THEN fetch the Expo push token. Channel names/importance are immutable after creation; get them right the first time. iOS: consider provisional authorization (quiet delivery) for service reminders before the full prompt.

> **Payload privacy rule:** push payloads never carry testimony/prayer content (special-category data on lock screens and through Expo/APNs/FCM). Generic title + deep link only ("Someone prayed with you"); the body is fetched in-app after auth. Same rule for edge-function logs (see `20`).

> **Localization rule:** automated notifications are stored as template key + params and rendered per recipient `profiles.language` at send time and in the center (see `02`). Never bake English strings into `notifications` rows.

## Notification tiers (scoping is central)
This is the multi-branch answer to "who gets notified":

| Tier | Who receives | Examples | Pref key |
|------|--------------|----------|----------|
| **Ministry-wide** | **All members, all branches** | Global gathering, ministry-wide announcement, HQ special live | `ministry_announcements` |
| **Branch** | Members of that branch | Branch event, branch update, local service change | `branch_updates` |
| **Service reminder** | Member's branch service | "Service starts in 1 hour" | `service_reminders` |
| **Personal: activity** | The individual | Someone prayed for you, Glory reactions on your testimony | `prayer_activity` / `testimony_activity` |
| **Personal: transactional** | The individual | Post approved / needs changes, RSVP reminder, registration confirmed, purchase added to Library | always on (own `transactional` Android channel, no pref key: these answer an action the member took) |

> **Answer to "global meetings: do all users get notified?"** Yes: a **ministry-wide** notification (or a global event, `branch_id IS NULL`) fans out to **every member across all branches** who has `ministry_announcements` enabled. Branch notifications stay within the branch.

## Notification Center (`NC`)
- Reached via the **bell on Home** (unread dot) and More → Notifications.
- List of `notifications` (rendered per the user's language, time, read state), newest first. **Cursor pagination** (~30 per page); unread badge caps at "99+"; activity batching: "N people said Glory" collapses per post per day; a footer row at the retention boundary: "Older notifications are removed after 12 months."
- Tap → **deep link** to the target screen (`deep_link` field): e.g. a "someone prayed for you" opens `PRAYER-DETAIL`; a global event opens `EVENT-DETAIL`.
- Mark read on view/tap; "mark all read."
- Empty → "You're all caught up."

## Sending (who triggers what)
- **Automated (system):** service reminders (scheduled per branch service time); personal activity (prayer/glory: pref-gated); transactional (post approved/needs changes, RSVP reminder, registration confirmed, purchase added: ALWAYS on, `transactional` channel); verse/devotional reminder (opt-in).
- **Manual (leaders/admins via dashboard, see `17`):** `broadcasts`: a leader sends **branch** scope; an admin sends **ministry** scope (four-eyes approval required, `17`); channels chosen (push / WhatsApp / in-app; WhatsApp rationed to 2 ministry-wide/month per the cost policy in `21` §9). Fan-out via edge function, chunked through `broadcast_deliveries` rows (cursor resume, dedupe per device, haltable mid-send), batches of 100 per Expo call → `devices` push tokens + WhatsApp API + `notifications` rows (unique per profile+broadcast: re-runs never double-write).
- **Receipts (delivery truth):** Expo push is two-phase: sends return tickets; real outcomes arrive as receipts fetched ~15 to 30 minutes later. A scheduled function fetches receipts by stored ticket ids and deletes `devices` rows on `DeviceNotRegistered` (ignoring receipts gets senders throttled). This is a launch requirement, not an optimization.

## Deep-link routes (examples)
| Notification | Opens |
|--------------|-------|
| Prayer prayed-for | `PRAYER-DETAIL` |
| Testimony got Glory | `TESTIMONY-DETAIL` |
| Post approved/changes | `MY-POSTS` / the post |
| Global/branch event | `EVENT-DETAIL` |
| Service reminder | `HOME` (next-service) / `LIVE` if live |
| Broadcast | in-app content or `NC` detail |
| Course confirmed | `COURSE` |

## Data
- `devices` (push tokens), `notification_prefs`, `notifications` (in-app log, monthly-partitioned), `broadcasts`, `broadcast_deliveries`.
- Fan-out edge function respects each recipient's prefs before sending (absent pref row = column defaults, see `02`).

## Deep-link configuration

- **Scheme:** `agbc://` in app config; **universal links** via the church website: `https://<domain>/.well-known/apple-app-site-association` (team id + `com.olayinkaademiluka.grace-portal`, served as JSON, no redirect) and `assetlinks.json` for Android App Links. **Critical:** the assetlinks SHA-256 fingerprint is the **Play App Signing key from the Play Console**, NOT the local upload keystore (Google re-signs the AAB; the upload key's fingerprint silently fails verification). `android.intentFilters` with `autoVerify: true`; `ios.associatedDomains`.
- `notifications.deep_link` stores **expo-router paths** (e.g. `/family/prayer/[id]`), handled by a notification-response listener calling `router.push`; cold start covered by `getLastNotificationResponseAsync`.
- Deep links navigate only; they never carry or trigger writes (see `03` gate-return security rule).

## States / edge cases
- **Permission not granted:** in-app center still works; Settings explains how to enable OS push.
- **WhatsApp not opted in:** skip WhatsApp; still push + in-app.
- **Token invalid/expired:** pruned via the receipts job (`DeviceNotRegistered` appears in RECEIPTS, not usually at send time) plus ticket-level errors.
- **Guest:** no push of any kind; tokens are never registered before sign-in (settled, see `02`/`06`). The notification center is member-only by definition.
- **Blocked users:** fan-out suppresses activity notifications when a block exists in either direction (`02` block mechanism).
- **Quiet hours / rate:** avoid over-notifying; batch activity where possible.
- **Deep link to deleted content:** graceful "this is no longer available."

## Permissions
- Receiving personal notifications: member. Sending: leader (branch) / admin (ministry).

## Acceptance criteria
- [ ] Ministry-wide notification reaches all branches; branch notification stays in-branch.
- [ ] Every notification appears in the Notification Center and deep-links correctly.
- [ ] Prefs actually suppress the corresponding categories.
- [ ] WhatsApp is opt-in and complementary, never the sole required channel.
- [ ] Service reminders fire per branch service time/timezone.
