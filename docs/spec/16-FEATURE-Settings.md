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
- **When the branch itself CLOSES, none of the above applies** (W3.5 slice 5c, `02` §branches). There is no branch left to stay in and no leader to ask, so the member is asked on next launch to choose a new home and the change lands at once: no approval, no 48 hours, and no 90-day settle (it writes no request row, so it starts no cooldown either, and they may ask to move again the same day). HQ is offered first. The prompt can be put off and a Home card carries it until they choose; until then they get no branch-tier notifications, though the whole family's announcements still reach them. Any request they had open is cancelled with it, so a leader cannot approve a move they have already made for themselves.
- Full design, data model and acceptance criteria: `docs/spec/plans/W2.7-people-roles-and-branch-moves.md`. Screens are unbuilt and their mockup frames do not exist yet; composing them is a blocking gate.

### `PRIVACY`
- Plain-language privacy summary + link to full policy (reuse website legal). What's collected (email, name, activity: no phone number, ever, since ADR 0014), how it's used, moderation notice, contact for data requests. Compliance detail (lawful bases, special-category data, retention, DPAs, age policy) lives in `20-PRIVACY-COMPLIANCE.md`.

### `DELETE` (account deletion: store requirement)
- Clear explanation of what's removed. Confirm (type/hold). 
- On confirm: soft-delete profile (`deleted_at`), **null `email`** (frees the unique constraint so the address can register again later, see `02`), anonymize or remove user content per policy (testimonies/prayers → removed or authored-by "A member", see the reach table below), revoke sessions, delete personal data, prune devices.
- **BUILT W4.5 slice 1 (2026-09-01) as `erase_profile()` + `delete_my_account()`** (`20260901140000`, `150000`, `160000`), executing the reach below in ONE transaction, because "don't half-delete" can only be meant if every database write commits together. Building it against the real schema turned up FIVE places where the reach as written could not run, and each is corrected in the table:
  - **The profile row and the auth user both SURVIVE.** `profiles.id` references `auth.users(id)` ON DELETE CASCADE, so deleting the auth user would hard-delete the profile and cascade into twenty tables, taking with it the audit trail this doc says is retained (`broadcasts.author_id` is NOT NULL with NO ACTION and points here). The profile is therefore soft-deleted and STRIPPED, and the auth user is neutralised in place: nulling its email frees the address, because `auth.users_email_partial_key` is a partial unique index and nulls do not collide.
  - **Four columns had to become nullable before any of this could run**: `testimonies.author_id`, `prayers.author_id`, `profiles.email` and `profiles.display_name` were all NOT NULL, so "null `author_id`" and "null `email`" were instructions the schema refused. Nulling the author matters beyond a failed statement: a kept post still pointing at the stripped shell is PSEUDONYMISED, not anonymised, and pseudonymised data is still personal data.
  - **`testimony_feed` INNER JOINed `profiles`**, so a null `author_id` would have made every kept post vanish from the feed silently: the exact opposite of what "keep my posts" means. It is a LEFT JOIN from W4.5, and `054` asserts a kept post is still in the feed.
  - **The three write guards had to learn about the erasure** (`20260901150000`). They exist to stop a member rewriting their own history and the erasure runs under that member's own uid, so each honours a transaction-local `in_account_erasure()` flag, the same mechanism `in_counter_write()` and `in_privileged_profile_write()` already use.
  - **Nulling `auth.users.email` does NOT free the address, and this row said it did.** Driven against the real auth API on 2026-09-01 (W4.5 slice 2): after nulling only the email, a signup for the same address is still refused `422 email_exists`, because `auth.identities.email` is a GENERATED column over `identity_data ->> 'email'` and the signup check reads it too. Delete the identity rows as well and the same signup returns 200. So the erasure does both, and the identity row is also where the raw address would otherwise sit for ever inside `identity_data`. **The suite could not have caught this**: seeded auth users in this project have no identities at all, so the fixture had a shape the real writer never produces, and `054` now inserts a genuine one.
  - **Only object BYTES cannot join the transaction**, so their paths are written into `account_erasures` and removed by the `erasure-sweep` job every 15 minutes (`21` §5). Everything else, sessions and the auth user included, is done inside it. The seam falls where it has to: what can be atomic is atomic, and what cannot is idempotent and retryable. Failing there is safe by construction, because the account is already gone and what is left is unreachable files.
- **Content under an OPEN safeguarding report is held, and this is a real limit on erasure.** `reports.testimony_id` and `reports.prayer_id` are ON DELETE CASCADE, so destroying a member's content would destroy every report ever made about it, including safeguarding ones: the opposite of `20`'s 24-month retention and of `02`'s own "removal does not end a safeguarding duty". Such a row is therefore **anonymised and soft-deleted rather than destroyed**: it leaves every member-facing surface at once, the person is erased from it, and the evidence survives. Lawful under Art. 17(3) and scoped as narrowly as it can be, in two ways: only OPEN reports hold (a settled one has had its duty discharged and the report row is then the evidence on its own), and the hold only bites where the row would otherwise have been DESTROYED, so a held post under "keep my posts" is anonymised and simply left standing.
- **The last admin cannot delete their account.** ADR 0015 already refuses demoting the last admin, and deleting yourself is a demotion with extra steps, so the rule has to cover both doors or it covers neither: a ministry with no admin has nobody who can appoint one.
- **Deletion reach (every table, in order):**

| Data | Action |
|------|--------|
| `pending` testimonies/prayers | **hard-cancel first**: removed from moderation queues, never approvable (publishing after consent withdrawal is an Art. 9 breach) |
| `glory_reactions`, `prayer_intercessions` | hard delete, then counter reconciliation runs (counters must not stay inflated) |
| approved testimonies/prayers | **the member chooses at deletion** (default: remove): "Remove all my posts" or "Keep them, credited to **A member**". **The label was "A former member" until 2026-09-01 and was changed by Ayo on seeing it on the device (W4.5):** a kept post that announces its author has left tells the whole congregation, every time somebody goes, that people are leaving the church. "A member" is the label an anonymous post already carries, so a kept post is indistinguishable from one and says nothing about anybody. Nothing in the app renders a separate "former member" string, and the DELETE screen promises the same words the feed draws. Anonymized rows null `author_id` (block filtering no longer applies; branch_id, counts, and consent evidence are kept; the answered-prayer ribbon survives). **Prayers with `is_anonymous=true` keep the label "A member" permanently**: anonymity chosen at post time is never altered by later account state (relabeling would reveal the anonymous author left) |
| `rejected` and `removed` testimonies/prayers | hard delete rows AND their photo objects in the same job (non-public content, consent withdrawn); safeguarding evidence lives in `reports` (retained 24 months), not in the content row |
| `attendance`, `streaks`, `milestones`, `plan_progress`, `playback_positions`, `saved_items`, `sermon_notes`, `reading_state` | hard delete |
| `rsvps`, `course_interest` | hard delete |
| `course_registrations` | **CORRECTED W4.5:** this row said hard delete and `02`/`20` say the opposite, which wins. `profile_id` is ON DELETE SET NULL there precisely so "payment records survive account deletion", and it is one of THE TWO SHARED TABLES the live website's Stripe webhook writes. The row is KEPT with `profile_id` and the link trio nulled: losing the church's record of a course fee because the payer left is not erasure, it is losing the books |
| `entitlements` | hard delete (frees the unique `source_ref` so restore-purchase can re-grant the same Payhip transaction to a new account with the same verified email) |
| `notifications`, `devices`, `notification_prefs`, `blocked_users` | hard delete (early in the job); `blocked_users` in BOTH directions, since neither a block they made nor one made against them has a subject any more |
| `profile_emails`, `branch_change_requests`, `course_handoff_tokens`, `job_alerts` | **ADDED W4.5:** hard delete. Four member-referencing tables this list never named, each theirs alone. That a table could exist for months with no stated instruction is why `054` asserts the whole set from the catalogue: a new foreign key into `profiles` turns the build red until somebody decides whether it is reached, nulled, or retained as audit |
| `reports.reporter_id` | anonymized (report rows retained 24 months for safeguarding, `20`) |
| Storage objects (avatar, testimony photos) | deleted in the same job |
| `payhip_events` / `unmatched_purchases` rows matching the account's verified email | redacted/deleted in the same job (buyer emails must not outlive the account; see `20` retention) |
| `broadcast_deliveries` | cascades with the `devices` hard delete (the 30-day purge already bounds the rest) |
| `moderated_by` / `broadcasts.author_id` (when a leader deletes) | retained as an opaque id in the audit trail (documented lawful basis: audit) |
- Confirmation + sign-out. Re-sign-in later = fresh profile.
- **The OTHER device notices too (W4.5, `03`'s deleted-account transition, which had never been built).** A phone whose owner deleted the account from somewhere else still holds an access token good for up to an hour, so it goes on rendering a member shell over data that is gone; the refresh failure catches it eventually, and this catches it the next time the app looks. **The signal is READ, not inferred**: `03` describes noticing when "a write is rejected for a deleted profile", and a rejection is a 42501 that half a dozen other policies also produce, so acting on one would mean telling somebody their account is gone on the strength of a guess. The erased member can still SELECT their own row (the erasure strips it rather than removing it, because the audit trail points at it), so the app asks outright and gets an answer that cannot mean anything else. It then takes the SAME transition as a refresh failure (guest in place, personal caches cleared, any pending gate action dropped) with its own words: **"This account no longer exists."** rather than "please sign in again", which would send somebody to a door that no longer opens.
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
