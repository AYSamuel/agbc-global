# 12 · Feature — Giving

## Purpose
Make generosity easy and safe. **v1 links out to the existing web giving** (Stripe/PayPal/bank) rather than in-app native payments — this is the **safest path for App Store review** (avoids the 30% cut / IAP requirement debate around donations) and reuses the church's already-built, compliant web flow.

## Decision recap
- **v1:** link out to web giving (in-app browser). Bring native in-app giving **later** if warranted.
- Giving needs **no account** — guests can give (lowest friction for generosity).

## User stories
- As anyone, I can give by card, PayPal, or bank transfer in a few taps.
- As a member abroad, I can give in the right currency for my branch.
- As anyone, I can copy bank details reliably.

## Screen: `GIVE` (Tab 4)
- Warm intro (why we give). 
- **Give by card** → opens web giving page in an in-app browser (`expo-web-browser`). Server derives currency from branch country (GBP/EUR/NGN) — see `donationCurrency()` in `site.ts`.
- **PayPal** → `https://paypal.me/agbcglobal` (in-app browser).
- **Bank transfer** → `GIVE-BANK`.
- Reassurance line: secure, handled on the church's web checkout.

### `GIVE-BANK`
- Currency selector (GBP · EUR · USD · HUF · NGN) from `giving.accounts` in `site.ts`.
- Per account: holder + fields, each with a **copy button** (copies value, shows "Copied" toast). Works fully offline (static details).
- Real data (from `site.ts`):
  - **GBP** — Amazing Grace Bible Church Global Ltd · Acct 51672549 · Sort 23-08-01 · IBAN GB81 TRWI 2308 0151 6725 49
  - **EUR** — IBAN BE53 9051 2105 0953
  - **USD** — Acct 664108655887707 · ACH/Wire 084009519
  - **HUF** — Acct 12600016-10798549-03467568
  - **NGN** — Olayinka Ademiluka Ministries International · Acct 1027814748 · UBA
- Monthly/standing-order guidance + the cancellation inbox (`oami.gospel@gmail.com`) for changing a recurring card gift.

## Recurring gifts
- v1: handled on the web checkout (Stripe). App explains "manage/cancel your monthly gift" and links to the cancellation email/inbox. Native recurring management is post-v1.

## Data
- Config lives in the `giving_config` table (see `02`), seeded from `site.ts` and served to the app with an offline cache. Never bundled app config: bank-detail changes must go live WITHOUT an app release (`22` §1). No sensitive data in the app.
- Optional: log a lightweight "give tapped" analytics event (no financial data).

## States / edge cases
- **Offline:** bank details render (static); web card/PayPal show "connect to the internet to give online" + bank alternative.
- **Web checkout fails / user cancels:** returns to `GIVE`, no error state needed beyond the browser's own.
- **Copy on old devices:** clipboard fallback; always show the value as selectable text too.
- **Currency for branch:** default from selected branch country; user can switch.

## Permissions
- None. Guests and members alike.

## App Store compliance note
- Because giving is a **donation to a non-profit** and is handled **outside the app** (web), it is compliant with store donation rules. Do **not** implement Apple IAP for donations. If native in-app giving is added later, use a compliant donation SDK/flow and re-check policy.

## Acceptance criteria
- [ ] Card and PayPal open the web flow in an in-app browser and return cleanly.
- [ ] Bank details are correct (match `site.ts`), copyable, and work offline.
- [ ] Currency selection covers GBP/EUR/USD/HUF/NGN.
- [ ] No account is required to give.
- [ ] No Apple IAP is used for donations.
