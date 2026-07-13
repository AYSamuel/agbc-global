# 16 · Feature — Settings, Profile, Localization, Privacy & Account

## Purpose
Give members control over identity, appearance, language, notifications, and their data — and meet store requirements (account deletion, privacy).

## Screens
`SETTINGS` · Profile edit · `NOTIF-PREFS` · Language · Theme · `PRIVACY` · `DELETE` (account deletion) · Sign in/out.

### `SETTINGS` (hub — reached from More)
Rows/sections:
- **Profile** → edit display name, avatar, home branch.
- **Appearance → Theme** — segmented **System · Light · Dark** (writes `theme_pref`, applied instantly, persisted locally + to profile). Status bar re-themes too.
- **Language** — English · Deutsch · Nederlands (writes `profiles.language`; UI relocalizes instantly). Content stays EN in v1.
- **Notifications** → `NOTIF-PREFS`.
- **Blocked members** → list of blocked users with unblock actions (`blocked_users`, see `02`/`09`; store-required UGC control).
- **Privacy** → `PRIVACY`.
- **Delete account** → `DELETE`.
- **About / Contact / Legal** links.
- **Sign in** (guest) / **Sign out** (member).

### `NOTIF-PREFS`
Toggles mapping to `notification_prefs`: Ministry announcements · Branch updates · Service reminders · Prayer activity · Testimony (Glory) activity · **WhatsApp updates** (opt-in). If OS push denied, banner explains + link to system settings.

### Profile edit
- Display name, avatar (upload → Storage, per the bucket rules in `02`), home branch (drives attendance timezone, service reminders, branch notifications, and "My branch" scoping; what Home DISPLAYS follows the browsing chip, see `07`). Save → `profiles` update.

### `PRIVACY`
- Plain-language privacy summary + link to full policy (reuse website legal). What's collected (phone, name, activity), how it's used, moderation notice, contact for data requests. Compliance detail (lawful bases, special-category data, retention, DPAs, age policy) lives in `20-PRIVACY-COMPLIANCE.md`.

### `DELETE` (account deletion — store requirement)
- Clear explanation of what's removed. Confirm (type/hold). 
- On confirm: soft-delete profile (`deleted_at`), **null `phone` and `email`** (frees the unique constraints so the number can register again later, see `02`), anonymize or remove user content per policy (testimonies/prayers → removed or authored-by "A former member"), revoke sessions, delete personal data, prune devices.
- **Deletion reach (every table, in order):**

| Data | Action |
|------|--------|
| `pending` testimonies/prayers | **hard-cancel first**: removed from moderation queues, never approvable (publishing after consent withdrawal is an Art. 9 breach) |
| `glory_reactions`, `prayer_intercessions` | hard delete, then counter reconciliation runs (counters must not stay inflated) |
| approved testimonies/prayers | per policy: removed, or anonymized to "A former member" (the answered-prayer ribbon survives anonymization; consent record retained as processing evidence, `20`) |
| `attendance`, `streaks`, `milestones`, `plan_progress`, `playback_positions`, `saved_items`, `sermon_notes`, `reading_state` | hard delete |
| `rsvps`, `course_registrations`, `course_interest` | hard delete (or anonymize registrations the church must keep for a running course; decide per course) |
| `entitlements` | hard delete (frees the unique `source_ref` so restore-purchase can re-grant the same Payhip transaction to a new account with the same verified email) |
| `notifications`, `devices`, `notification_prefs`, `blocked_users` | hard delete (early in the job) |
| `reports.reporter_id` | anonymized (report rows retained 24 months for safeguarding, `20`) |
| Storage objects (avatar, testimony photos) | deleted in the same job |
| `payhip_events` / `unmatched_purchases` rows matching the account's verified email | redacted/deleted in the same job (buyer emails must not outlive the account; see `20` retention) |
| `broadcast_deliveries` | cascades with the `devices` hard delete (the 30-day purge already bounds the rest) |
| `moderated_by` / `broadcasts.author_id` (when a leader deletes) | retained as an opaque id in the audit trail (documented lawful basis: audit) |
- Confirmation + sign-out. Re-sign-in later = fresh profile.
- **Web deletion path (Play Store requirement):** a page on the agbc website lets a user request deletion without the app (enter phone → OTP → confirm; same server-side flow). Linked from the Play data-safety form. See `20`.
- **Web deletion hardening (it is an unauthenticated endpoint that triggers OTP sends):** one-shot flow (the OTP proves number control and executes the deletion; no session or token is created or persisted); uniform response ("if an account exists, a code was sent": no enumeration signal); the same Twilio Fraud Guard, geo allowlist, and per-number/per-IP limits as `03`; plus bot protection (e.g. Cloudflare Turnstile), because a public form that triggers WhatsApp/SMS sends is an SMS-pumping amplifier.

## Localization (i18n)
- **UI:** English, German, Dutch. Use `i18next`/`react-i18next` + `expo-localization` (`getLocales()`), JSON v4 plurals, with `@formatjs/intl-locale` + `@formatjs/intl-pluralrules/polyfill-force` imported at app entry (Hermes ships no `Intl.PluralRules`; DE/NL plural rules break without the polyfill). Reuse/translate strings from `agbc/src/i18n/ui.ts` (EN/DE/NL already exist for the website — port them).
- **Workflow:** i18n keys mandatory from Phase 1 (no literal strings in components); string freeze per release; named translation reviewers and the legal-string review rule live in `22-CONTENT-OPERATIONS.md` §4.
- **Default:** device locale if supported, else English; overridable in onboarding + Settings.
- **Content (devotional, plans, verses):** English v1. Data model has `language` fields so DE/NL content can be added without schema change.
- **Formatting:** dates/times/numbers/currency localized; branch times shown in branch timezone with locale formatting.
- **RTL:** not needed for EN/DE/NL.

## Data
- `profiles` (name, avatar, branch, language, theme_pref, deleted_at), `notification_prefs`, `devices`.

## States / edge cases
- **Guest Settings:** appearance + language + notifications-permission work locally; profile/prayer-prefs/delete require sign-in.
- **Language change mid-session:** relocalize without restart.
- **Theme = System:** follows OS live.
- **Delete while offline:** queue + confirm when online; don't half-delete.
- **Sign out:** clears personal caches, keeps guest browse; theme/language/branch persist locally.

## Permissions
- Appearance/language: everyone. Profile/notif-prefs/delete: member.

## Acceptance criteria
- [ ] Theme toggle (System/Light/Dark) applies instantly, persists, and re-themes status bars.
- [ ] Language switch relocalizes the whole UI live (EN/DE/NL).
- [ ] Account deletion fully removes/anonymizes data and is self-service (store-compliant).
- [ ] Notification prefs actually gate deliveries (see `15`).
- [ ] Guests can adjust appearance/language without an account.
