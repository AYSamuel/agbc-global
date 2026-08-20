# 15 · Feature: Notifications (Push + In-App) & Notification Center

## Purpose
Reach the family where they are, at the right scope, without spamming. Combines **push** (Expo/APNs/FCM) with an **in-app Notification Center**.

## Channels
1. **Push**: real-time, primary. Expo Push → APNs (iOS) / FCM (Android).
2. **In-app Notification Center** (`NC`): a durable log; every notification also lands here, so a member who has push turned off still sees everything the next time they open the app.

> **No WhatsApp Cloud API** (ADR [0014](../decisions/0014-push-only-broadcasts.md), 2026-07-29). It was dropped rather than deferred: a Cloud API broadcast only ever reached a signed-in member who had opted in AND given a phone number, which is a SUBSET of the push audience, not people beyond it. What actually reaches people without the app is the church's existing WhatsApp community, and that is a human posting a message. The dashboard serves it with a "Copy for WhatsApp" action (`17` §2), not an integration. Sharing individual content out to WhatsApp via the OS share sheet is unrelated and unchanged.

> **Android channels + permission ordering:** SIX channels: five map 1:1 to pref keys (ministry, branch, service reminders, prayer activity, testimony activity) plus a `transactional` channel with no pref key (always-on action confirmations). Ordering rule: create ALL SIX channels at first app start (Android 13+ will not show the permission prompt until a channel exists), request permission in-context per `06`, THEN fetch the Expo push token. Channel names/importance are immutable after creation; get them right the first time. iOS: consider provisional authorization (quiet delivery) for service reminders before the full prompt.

> **Only service reminders interrupt** (decided with Ayo 2026-08-15, W3.3; recorded here because the OS remembers a deleted channel's settings, so this is a one-shot call rather than a preference). `service_reminders` is created at Android `IMPORTANCE_HIGH`: "service starts in 1 hour" is useless seen late, and it is the one category where arriving after the fact is a failure. The other five (`ministry`, `branch`, `prayer`, `testimony`, `transactional`) are `DEFAULT`: sound, no takeover. The prayer channel gates on `prayer_activity` (and carries `prayer_reminders` with it, per the tier table); `transactional` has no gate. The ids live twice by necessity, in the app's `features/notifications/channels.ts` and the sender's `_shared/pushChannels.ts`, because a pnpm workspace and a Deno import map cannot share a module; both sides assert the same six literals in tests, and a channel the server names but the app never created is dropped silently by Android.

> **Foreground behaviour, per category** (decided 2026-08-20, W3.5; the spec was silent and the app set no handler at all, so expo-notifications' default showed NOTHING while the app was open). A push that arrives with the app in the foreground was being delivered and swallowed: Expo's receipt said `ok`, FCM handed it over, and the member saw nothing. Two earlier "a real push landed" claims in this project rested on Expo ACCEPTING a ticket, which is a different thing, and both were wrong. The rule now: **everything reaches the tray, and only some things interrupt.** `service_reminder` shows a banner WITH sound, because it is the one category this doc already says interrupts and the only channel created at `IMPORTANCE_HIGH`; `ministry`, `branch` and `event` show a banner without sound, because they are news the member was not looking for; `event_change` joins them rather than sitting with the quiet confirmations (W3.5 slice 4), which is the one exception to the line below: it does answer something the member did, but the screen they are on is not the one showing it, and an event they are about to leave for being cancelled is news whatever else is open; activity (`prayer`, `testimony_glory`) and the transactional confirmations show no banner, because the screen the member is already on shows the same thing and a banner over it is noise. Lives in `features/notifications/foreground.ts`, keyed off the same `type` that picks the channel. Two implementation facts that are load-bearing: the handler must answer within THREE SECONDS or expo-notifications discards the notification, so it is a pure lookup that can never fetch or throw; and `shouldShowAlert` is deprecated in expo-notifications 57 in favour of the `shouldShowBanner`/`shouldShowList` pair, which is what makes "tray but no banner" expressible at all.

> **Payload privacy rule:** push payloads never carry testimony/prayer content (special-category data on lock screens and through Expo/APNs/FCM). Generic title + deep link only ("Someone prayed with you"); the body is fetched in-app after auth. Same rule for edge-function logs (see `20`).

> **Localization rule:** automated notifications are stored as template key + params and rendered per recipient `profiles.language` at send time and in the center (see `02`). Never bake English strings into `notifications` rows.

## Notification tiers (scoping is central)
This is the multi-branch answer to "who gets notified":

| Tier | Who receives | Examples | Pref key |
|------|--------------|----------|----------|
| **Ministry-wide** | **All members, all branches** | Global gathering, ministry-wide announcement, HQ special live, **a ministry-wide event posted** (W3.5 slice 4) | `ministry_announcements` |
| **Branch** | Members of that branch | Branch event posted (`event`, built W3.5 slice 4), branch update, local service change | `branch_updates` |
| **Service reminder** | Member's branch service | "Service starts in 1 hour" | `service_reminders` |
| **Personal: activity** | The individual | Someone prayed for you, Glory reactions on your testimony | `prayer_activity` / `testimony_activity` |
| **Personal: prayer reminder** | The member who committed ("I will pray") | "You said you'd pray for a request, take a moment now" (deep link to `PRAYER-DETAIL`) | `prayer_reminders` (opt-out), **but NOT its own control**: NOTIF-PREFS' single "Prayer activity" switch writes both `prayer_activity` and `prayer_reminders`, because the frame captions it "When someone prays with you, and reminders to pray" (W3.3 decision 2, built and proven on device 2026-08-19). The columns stay separate so a later item can split the control without a migration; the cost is that a member who likes the pings but finds the nudges naggy loses both. **The cadence is day 1, day 3, day 7 from `committed_at`, then it ends** (three nudges, hard cap; decided with Ayo 2026-08-19, W3.4 slice 2). Anchored to the commitment rather than to the last send, so a nudge held back does not drag the rest of the cadence out. **Quiet hours 08:00-21:00 in the member's branch timezone**, the only quiet-hours rule in the app and the one this tier needs, because every other reminder has a clock of its own (an hour before a service, a day before an event) while a nudge would happily arrive at 03:00; a nudge due outside the window waits for the next qualifying hour. **Stops** when the member marks "I prayed", the request is answered, unpublished or deleted, the cap is reached, `prayer_reminders` goes off, or a block appears in either direction between the two people. The payload carries NO params at all: not the request, not a word of it, not the author. See `09` Prayer commitment. |
| **Personal: transactional** | The individual | Post approved / needs changes, RSVP reminder, registration confirmed, purchase added to Library, **an event you RSVP'd to cancelled, moved or back on** (`event_change`, W3.5 slice 4) | always on (own `transactional` Android channel, no pref key: these answer an action the member took). **The event notices sit here rather than with `event`/`branch` deliberately**: a member who switched branch news off has said they do not want to hear about new events, which is not the same as agreeing to turn up at a locked door for one they booked |

> **Answer to "global meetings: do all users get notified?"** Yes: a **ministry-wide** notification (or a global event, `branch_id IS NULL`) fans out to **every member across all branches** who has `ministry_announcements` enabled. Branch notifications stay within the branch.

## Notification Center (`NC`)
- Reached via the **bell on Home** (unread dot) and More → Notifications.
- List of `notifications` (rendered per the user's language, time, read state), newest first. **Cursor pagination** (~30 per page); unread badge caps at "99+"; activity batching: "N people said Glory" collapses per post per day; a footer row at the retention boundary: "Older notifications are removed after 12 months."
- Tap → **deep link** to the target screen (`deep_link` field): e.g. a "someone prayed for you" opens `PRAYER-DETAIL`; a global event opens `EVENT-DETAIL`.
- Mark read on view/tap; "mark all read."
- Empty → "You're all caught up."

## Sending (who triggers what)
- **Automated (system):** service reminders (scheduled per branch service time); personal activity (prayer/glory: pref-gated); transactional (post approved/needs changes, RSVP reminder, registration confirmed, purchase added: ALWAYS on, `transactional` channel); verse/devotional reminder (opt-in).
- **Manual (leaders/admins via dashboard, see `17`):** `broadcasts`: a leader sends **branch** scope; an admin sends **ministry** scope (four-eyes approval required, `17`); channels are push + in-app (both, always: there is nothing to choose between since ADR 0014). Fan-out via edge function, chunked through `broadcast_deliveries` rows (cursor resume, dedupe per device, haltable mid-send), batches of 100 per Expo call → `devices` push tokens + `notifications` rows (unique per profile+broadcast: re-runs never double-write).
- **Receipts (delivery truth):** Expo push is two-phase: sends return tickets; real outcomes arrive as receipts fetched ~15 to 30 minutes later. A scheduled function fetches receipts by stored ticket ids and deletes `devices` rows on `DeviceNotRegistered` (ignoring receipts gets senders throttled). This is a launch requirement, not an optimization.

## Deep-link routes (examples)
| Notification | Opens |
|--------------|-------|
| Prayer prayed-for | `PRAYER-DETAIL` |
| Testimony got Glory | `TESTIMONY-DETAIL` |
| Post approved/changes | `MY-POSTS` / the post |
| Global/branch event posted, or one you RSVP'd to cancelled, moved or back on | `EVENT-DETAIL` (`/event/<id>`; `11` requires the link to keep working after a cancellation, which is why a published event is cancelled and never deleted) |
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
- **Permission not granted:** in-app center still works; Settings explains how to enable OS push. **The banner's condition is "we have already had our one ask AND the OS is not granting", never `canAskAgain`** (W3.3 slice 5, instrumented on device 2026-08-19): a revoked, even `USER_FIXED`, Android permission still answers `canAskAgain: true` outside an in-process request, so the mapping that yields `denied` can never be reached from the state the banner exists for. The ask flag is `features/notifications/ask.ts`'s persisted `asked`, which also keeps the banner from jumping the queue before the value moment has had its turn (`06`).
- **Push permission denied:** the broadcast still lands in the Notification Center and the Home bell shows the unread dot. Nothing is silently lost; it just waits for the next app open.
- **Push provider outage:** there is no automated second channel (ADR 0014). Broadcasts reach members on next app open, and a leader can paste the message into the church's WhatsApp community using the composer's "Copy for WhatsApp" action.
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
- [ ] A member with push denied still finds every broadcast in the Notification Center.
- [ ] Service reminders fire per branch service time/timezone.
