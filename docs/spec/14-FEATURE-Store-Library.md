# 14 · Feature: Store (Bookstore) & My Library

## Purpose
Sell the church's e-books and let owners read them in-app: using the **reader-app model**: **buy on the web (Payhip)**, **read owned books in-app**. This avoids the App Store's in-app-purchase cut on digital goods (books are purchased outside the app; the app is a reader for content the user already owns).

## Decision recap
- **Buy → web (Payhip).** **Read owned → in-app reader.** No in-app store purchase in v1.
- "My Library" + "Bookstore" live as their own section under **More**.
- **Devotionals are books too** (decision 2026-07-12): the lead pastor's devotionals are sold on Payhip like any book; buying one grants the entitlement AND unlocks its structured day-by-day plan experience in Rhythm (`10`). `reading_plans.book_id` makes the link (`02`).

## User stories
- As a member, I browse books and buy on the web.
- As a member who bought a book, I read it in the app and it remembers my place.
- As a visitor, I can browse and buy; reading requires owning + being signed in.

## Screens
`STORE` (Bookstore) · `BOOK-DETAIL` · `LIBRARY` (My Library) · `READER`.

### `STORE`
- Grid of books (cover, title, author, price). From `books`.
- Tap → `BOOK-DETAIL`. Empty → "New titles coming soon."

### `BOOK-DETAIL`
- Cover, title, author, description, price.
- **Buy** → opens Payhip product (`books.payhip_url`) in in-app browser.
- If **owned** (entitlement exists): primary action becomes **Read** → `READER`.

### `LIBRARY` (My Library)
- Books the member owns (`entitlements`), with reading progress. Empty → "Books you own will appear here" + Browse CTA.
- Tap → `READER` (resume location).

### `READER`
**Scope decision (2026-07-12): v1 supports BOTH formats.** Honest sizing: the reader is 2 to 3 weeks of real work (two rendering engines, theming, font size, location persistence, offline). Stack:
- **PDF (the current catalog's format):** `@kishannareshpal/expo-pdf` first (Expo-native); `react-native-pdf` + config plugins as fallback, with an iOS New-Architecture smoke test before committing (open blank-view issues exist under Fabric).
- **EPUB:** `@epubjs-react-native/core` + `react-native-webview`; budget for a compatibility patch of its file-system adapter (it predates the SDK 54 `expo-file-system` API change), or vendor it.
- **Offline model:** download once via the new `expo-file-system` File API using a short-lived signed URL minted at download time; expiry then only affects re-downloads, never reading. Progress + resume; Wi-Fi-only option.
- Remembers location (`reading_state`), font size, light/dark reading theme.

## Entitlement flow (how owning works)

**Trust model (verified 2026-07-12):** Payhip's webhook "signature" is a static hash of the API key: constant on every event, no payload HMAC, no timestamp. It authenticates NOTHING and is replayable. Therefore the webhook is only a TRIGGER; grants happen after server-side confirmation.

```
User buys on Payhip (web)
  → Payhip webhook → edge function
     → insert raw event into `payhip_events` (unique event id: replays no-op)
        → async processor CONFIRMS the sale via Payhip's server API (transaction lookup)
           → matched verified email → `entitlements` (unique source_ref = transaction id)
           → no matching profile yet → `unmatched_purchases` (drained automatically when
             a profile with that email later exists (identity email, verified by sign-in, `03`); visible in the dashboard queue)
Refund event → same inbox → revoke ONLY after the API confirms refund
status for that source_ref (a forged refund webhook must not strip a
paying member's book); unconfirmable refund events log + alert.
```

**What the API confirmation checks:** the webhook payload supplies ONLY the lookup key. Product id (must match `books.payhip_product_id`), buyer email, amount/currency, and refund status are taken exclusively from the Payhip API response; any mismatch routes to `unmatched_purchases` and alerts (a real cheap transaction id replayed against an expensive book must fail).

**Drain mechanism:** when a profile with a matching email appears (sign-up or auth email change, `03`), a trigger grants matching `unmatched_purchases` rows through the same confirmed-grant path; the 5-minute Payhip job re-sweeps as a safety net (`21` §5).

**Reconciliation for never-arrived webhooks:** a daily job pulls the last 7 days of transactions from the Payhip API and inserts any transaction id missing from `payhip_events` as a synthetic event (unique id: idempotent), so silently dropped webhooks (including refunds) surface within a day, never only when a buyer complains (`21` §5).

**Revocation, client side:** on refund the book leaves LIBRARY and READER refuses to open it (entitlement re-checked on open when online; offline grace until the next successful sync, which then deletes the local file). `reading_state` and `plan_progress` are retained 12 months so a re-purchase restores place and progress; earned milestones are never revoked; a refunded devotional's plan re-locks per `10`.

**Return-from-purchase:** dismissing the in-app browser opened from Buy triggers an entitlement refetch and a banner ("Bought it? It appears in your Library within a few minutes"); entitlement-gated screens (BOOK-DETAIL, PLAN, LIBRARY) refetch on focus; the transactional purchase push remains the completion signal.

**No separate email-verification step (since 2026-07-18):** the identity email is verified by sign-in itself (`03`), so restore needs no dedicated verify screen; on persistent delivery problems the order-id restore path is the fallback. Delivery is monitored by the Resend canary (`21` §6).

**Restore purchase ("I bought this"):** grants only against the profile's identity email (`profiles.email`, verified by sign-in, `03`) or a Payhip order id the claimant provides (proof of receipt). Uniform response either way ("if a matching purchase exists, it will be added": no enumeration signal). Rate-limited per account and per IP.

## Data
- `books`, `entitlements`, `reading_state`, `payhip_events`, `unmatched_purchases` (see `02`). Book files in a PRIVATE bucket; signed URLs minted per request by an edge function that verifies the entitlement, short TTL (minutes). Accept that a downloaded offline copy leaves our control (unavoidable); never issue a shareable long-lived URL.

## States / edge cases
- **Guest:** browse + buy (web); Read/Library → gate. After sign-in, entitlements are matched by **verified email** (or via Restore purchase with a Payhip order id); phone matching does not exist in the pipeline.
- **Bought but not matched:** "Restore purchase" flow by email; support fallback.
- **Not owned taps Read:** routes to Buy (never a locked blank).
- **Large file download:** progress + resume; Wi-Fi-only option.
- **DRM-light:** files are per-user signed; don't expose public URLs.
- **Offline:** owned+downloaded books read offline; store browse shows cached.

## Permissions
- Browse/buy: guest. Read/library: member + entitlement.

## Notifications
- New book released (optional). Purchase confirmed / added to library. Deep-link → `BOOK-DETAIL`/`LIBRARY`.

## Acceptance criteria
- [ ] Browsing + buying works via Payhip web; no in-app purchase used.
- [ ] A verified purchase grants an entitlement and appears in My Library.
- [ ] Reader loads owned books, remembers place, supports light/dark + offline.
- [ ] "Read" on an unowned book routes to purchase, never a dead lock screen.
