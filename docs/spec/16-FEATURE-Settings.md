# 16 · Feature: Settings, Profile, Localization, Privacy & Account

## Purpose
Give members control over identity, appearance, language, notifications, and their data: and meet store requirements (account deletion, privacy).

## Screens
`SETTINGS` · Profile edit · `NOTIF-PREFS` · Language · Theme · `PRIVACY` · `DELETE` (account deletion) · Sign in/out.

### `SETTINGS` (hub: reached from More)
Rows/sections:
- **Profile** → edit display name, avatar; request a home-branch change (see Profile edit).
- **Appearance → Theme**: segmented **System · Light · Dark** (writes `theme_pref`, applied instantly, persisted locally + to profile). Status bar re-themes too.
- **Language**: English · Deutsch · Nederlands · Français (writes `profiles.language`; UI relocalizes instantly). Content stays EN in v1.
- **Notifications** → `NOTIF-PREFS`.
- **Blocked members** → list of blocked users with unblock actions (`blocked_users`, see `02`/`09`; store-required UGC control).
- **Privacy** → `PRIVACY`.
- **Delete account** → `DELETE`.
- **About / Contact / Legal** links.
- **Sign in** (guest) / **Sign out** (member).

### `NOTIF-PREFS`
Toggles mapping to `notification_prefs`: Ministry announcements · Branch updates · Service reminders · Prayer activity · Testimony (Glory) activity. If OS push denied, banner explains + link to system settings, and notes that everything still arrives in the Notification Center. (The WhatsApp toggle went with ADR 0014; there is no phone number to collect any more.)

### Profile edit
- Display name, avatar (upload → Storage, per the bucket rules in `02`). Save → `profiles` update.
- **Home branch is REQUESTED, not edited** (decided 2026-07-29, ADR 0015). It drives attendance timezone, service reminders, branch notifications and "My branch" scoping (what Home DISPLAYS follows the browsing chip, see `07`), and it is also what `can_moderate_branch()` derives moderation authority from, so it is not a field a member writes.
- Chosen freely during onboarding (AUTH-3), then locked: `profiles_guard` refuses any owner change once `onboarded_at` is set (`02` §Invariants, pgTAP `018`).
- **The branch being JOINED approves it**, not the one being left: a member moving Glasgow to Berlin needs Berlin's leader. Glasgow's leader sees it afterwards as history and cannot block it, because a leader should not be able to refuse someone leaving. A LEADER's own move is approved by an admin, and an approved move drops them to member unless the admin grants the new branch's leadership in the same action. An admin picks up any request immediately when the destination has no leader, and after 48 hours when it does.
- **The 48 hours is an expectation, not a hold.** The move lands the moment it is approved. Copy says it usually takes up to 48 hours. Churn is prevented by a **90-day cooldown after a completed move** and by allowing **one open request at a time**, never by delaying an approved move.
- **A rejection explains nothing to the member.** They see a neutral, grace-framed outcome; the reason is a private ministry record in `privileged_actions`, readable by admins only. Deliberate: the reasons most needing a record are the ones that must not be handed back (`20`).
- The refusal copy points them at **the branch they asked to join, by its name and its published contact** (`branches.email`, already public and anon-readable per `02`), not at "your branch leader" and **never at the individual who decided**. Three reasons, in order of importance: naming the decider discloses who refused them, which is exactly wrong in the safeguarding cases this whole no-reason rule exists to protect; a branch can have several leaders, so "the leader" is not well defined; and their own branch's leader did not make the decision and cannot explain it. This is enforced by the schema, not by the copy: the decider's identity is not a column on the request at all, it lives only in the admin-only `privileged_actions` log, so there is nothing for the app or a hand-written query to leak.
- **States on this screen:** current branch; "awaiting confirmation" with Cancel while pending; the neutral refused state, dismissible; and a cooldown state saying when they can ask again. A quiet dismissible line on Home while a request is open, because until push lands in Phase 3 there is no way to tell them. Push replaces the banner then.
- Admins are exempt and set their own home branch directly: it grants them nothing, since an admin already moderates every branch.
- Full design, data model and acceptance criteria: `docs/spec/plans/W2.7-people-roles-and-branch-moves.md`. Screens are unbuilt and their mockup frames do not exist yet; composing them is a blocking gate.

### `PRIVACY`
- Plain-language privacy summary + link to full policy (reuse website legal). What's collected (email, name, activity: no phone number, ever, since ADR 0014), how it's used, moderation notice, contact for data requests. Compliance detail (lawful bases, special-category data, retention, DPAs, age policy) lives in `20-PRIVACY-COMPLIANCE.md`.

### `DELETE` (account deletion: store requirement)
- Clear explanation of what's removed. Confirm (type/hold). 
- On confirm: soft-delete profile (`deleted_at`), **null `email`** (frees the unique constraint so the address can register again later, see `02`), anonymize or remove user content per policy (testimonies/prayers → removed or authored-by "A former member"), revoke sessions, delete personal data, prune devices.
- **Deletion reach (every table, in order):**

| Data | Action |
|------|--------|
| `pending` testimonies/prayers | **hard-cancel first**: removed from moderation queues, never approvable (publishing after consent withdrawal is an Art. 9 breach) |
| `glory_reactions`, `prayer_intercessions` | hard delete, then counter reconciliation runs (counters must not stay inflated) |
| approved testimonies/prayers | **the member chooses at deletion** (default: remove): "Remove all my posts" or "Keep them, credited to A former member". Anonymized rows null `author_id` (block filtering no longer applies; branch_id, counts, and consent evidence are kept; the answered-prayer ribbon survives). **Prayers with `is_anonymous=true` keep the label "A member" permanently**: anonymity chosen at post time is never altered by later account state (relabeling would reveal the anonymous author left) |
| `rejected` and `removed` testimonies/prayers | hard delete rows AND their photo objects in the same job (non-public content, consent withdrawn); safeguarding evidence lives in `reports` (retained 24 months), not in the content row |
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
- **Web deletion path (Play Store requirement):** a page on the agbc website lets a user request deletion without the app (enter email → OTP → confirm; same server-side flow). Linked from the Play data-safety form. See `20`.
- **Web deletion hardening (it is an unauthenticated endpoint that triggers OTP sends):** one-shot flow (the OTP proves address control and executes the deletion; no session or token is created or persisted); uniform response ("if an account exists, a code was sent": no enumeration signal); the same per-address/per-IP rate limits as `03`; plus bot protection (e.g. Cloudflare Turnstile), because a public form that triggers email sends is an inbox-bombing amplifier and burns the send quota.

## Localization (i18n)
- **UI:** English, German, Dutch, French. Use `i18next`/`react-i18next` + `expo-localization` (`getLocales()`), JSON v4 plurals, with `@formatjs/intl-locale` + `@formatjs/intl-pluralrules/polyfill-force` imported at app entry (Hermes ships no `Intl.PluralRules`; DE/NL/FR plural rules break without the polyfill). Reuse/translate strings from `agbc/src/i18n/ui.ts` (EN/DE/NL already exist for the website: port them; FR is net-new translation).
- **Workflow:** i18n keys mandatory from Phase 1 (no literal strings in components); string freeze per release; named translation reviewers and the legal-string review rule live in `22-CONTENT-OPERATIONS.md` §4.
- **Default:** device locale if supported, else English; overridable in onboarding + Settings.
- **Content (devotional, plans, verses):** English v1. Data model has `language` fields so DE/NL content can be added without schema change.
- **Formatting:** dates/times/numbers/currency localized; branch times shown in branch timezone with locale formatting. Stated as one rule (W2.8, after RHYTHM shipped American dates to every member of a Glasgow-led church): **the moment follows the event, the format follows the reader, and a stored day follows neither.**
  - **A time that belongs to a place** (a service, an event) is shown on THAT place's clock, always, labelled with the place. Converting it to the reader's zone would tell a Berlin member browsing Glasgow to arrive an hour late. The exception is participation at a distance (a livestream, a ministry-wide gathering), which shows BOTH: the origin, and "your time" (`11` §Timezone).
  - **A stored day** (`attendance.service_date`, "last gathered") is not an instant. The timezone acted once, at write time, in the branch attended, and the date is immutable after; it therefore renders identically in Ogbomosho and Glasgow forever. Never re-apply a zone to one (`features/rhythm/format.ts`).
  - **The format** (day-month order, 12h against 24h, separators) is regional and carries no information about when anything happens, so it follows the READER: `useFormattingLocale()`, which takes the device's region when it agrees with the language being read and leaves it to `Intl` otherwise. i18next still translates with the bare language code; the two are different questions with different answers.
- **RTL:** not needed for EN/DE/NL/FR.

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
- [ ] Language switch relocalizes the whole UI live (EN/DE/NL/FR).
- [ ] Account deletion fully removes/anonymizes data and is self-service (store-compliant).
- [ ] Notification prefs actually gate deliveries (see `15`).
- [ ] Guests can adjust appearance/language without an account.
