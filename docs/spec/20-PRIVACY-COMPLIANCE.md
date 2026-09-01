# 20 · Privacy, GDPR & Safeguarding

The congregation spans the UK (Glasgow), the EU (Berlin, Emmen), and Nigeria (Ogbomosho): **UK GDPR and EU GDPR both apply**, and Nigeria's NDPA applies to Ogbomosho members. This doc is engineering guidance, not legal advice; have the final policy text reviewed by the church's data-protection contact or counsel before launch.

## Why this app is higher-stakes than a normal app

Church membership, testimonies, and prayer requests reveal **religious beliefs**: special-category data under **GDPR Art. 9**. Healing testimonies add **health data**. Special-category processing needs an Art. 9 condition on top of a normal lawful basis. Ours:

- **Explicit consent (Art. 9(2)(a))** for anything shared publicly, captured by the mandatory consent step before every testimony/prayer submission (`09`).
- **Art. 9(2)(d)** (legitimate activities of a religious not-for-profit, relating to members/former members, no disclosure outside without consent) as the backstop for internal processing (attendance, rhythm, moderation).

## Lawful-basis map

| Processing | Data | Lawful basis | Art. 9 condition |
|-----------|------|--------------|------------------|
| Account (email, name, branch, language) | contact + profile | contract (providing the service) | 9(2)(d) |
| Testimonies / prayers (public sharing) | UGC incl. religious/health | consent | 9(2)(a) explicit, via consent step |
| Attendance / rhythm / plan progress | religious-practice data | consent (member opts in by using the feature) | 9(2)(a) |
| Push notifications | device tokens | consent (opt-in prefs, `15`) | n/a |
| Moderation & safety (reports, audit) | UGC + reports | legitimate interest (community safety) | 9(2)(d) |
| Analytics (product events) | pseudonymous, device-scoped usage | consent (opt-in, see below) | n/a |
| Crash reporting | scrubbed diagnostics, no identifiers | legitimate interest (keeping the service working) | n/a |

## Consent mechanics

- The compose **consent step** (`09`) is the Art. 9 capture: plain words ("shared publicly with the church family worldwide; a leader reviews it first"), stored with a timestamp and the version of the wording shown.
- Consent is withdrawable: deleting a post, or the account, withdraws it; the delete paths (`16`) are the mechanism.
- **Analytics:** nothing non-essential fires before consent. **Settled 2026-08-12 (W2.10, ADR 0020), replacing the either/or this line used to offer:** PostHog is **opt-in**, asked once by a sheet on the first Home after onboarding (`ANALYTICS-ASK`) with the switch in `SETTINGS › Privacy & data`. The choice is stored **on the device**, not against a profile, because first run has no account and the gate funnel is a guest measurement. Yes, no and dismissing all count as answered, so nobody is asked twice, and refusing is one tap beside the yes. Anonymous/cookieless was considered and rejected: the SDK persists a device id either way, so it would not have removed the consent question, and it would have cost three of the five north stars in `22` §5. **No `identify()` ever:** events carry branch, scope, locale and role, never the member id, so religious-practice events never sit against an identified individual (the cost is that one person on two devices counts twice). IP-based geo enrichment is off; `branch_id` is both truer and less intrusive. Withdrawal reaches the data: turning the switch off opts out AND drops the stored device id.
- **Crash reporting is NOT gated, and is scrubbed instead** (ADR 0020). A crash report is how the app gets fixed, and `21` §8's rollout halt criterion ("crash-free sessions < 99.5%") measures nothing if it only sees the members who opted in. What is refused: the user record (so no email, no IP), request bodies, headers, query strings, cookies, stack-frame locals, screenshots, view hierarchy, session replay, and console breadcrumbs whole. The privacy notice says this plainly, and so does the line under the analytics switch in Settings. This paragraph and the table above used to disagree with each other; the table now matches.

## Data residency

- The Supabase project must be in an **EU region**; verify the existing shared project as part of the `19` audit. If it is in a non-EU region, decide before launch whether to migrate (see `19`, step 7).
- Meta (broadcasts) and Resend route messages internationally by nature; that transfer is covered by their DPAs and current transfer mechanisms (DPF/SCCs), not by our region choice.

## Processors (a DPA with each)

| Vendor | Purpose | Notes |
|--------|---------|-------|
| Supabase | DB / auth / storage | DPA available; pin EU region |
| ~~Meta (WhatsApp Cloud API)~~ | **REMOVED from the processor list 2026-07-29** (ADR 0014): broadcasts are push + in-app only, so no member data reaches Meta. **No phone numbers are collected at all any more**, which is a data-minimisation improvement under Art. 5(1)(c). (Twilio left the same list with the email-OTP decision 2026-07-18, `03`) |
| Expo | push relay | DPA |
| Sentry | crash reporting | DPA; PII scrubbing on |
| PostHog | analytics | EU Cloud option; DPA |
| Payhip | book purchases | buyer's merchant of record; we receive only buyer email for entitlement (`14`) |
| Resend (or equivalent) | ALL sign-in OTP codes + transactional email (`03`) | DPA; SPF + DKIM aligned and DMARC at enforcement on the church domain; Supabase Auth custom SMTP points at it (the built-in Supabase sender is dev-only: 2 emails/hour). The website already uses Resend, so reuse that account |

Keep the accepted-DPA list with the church's records; re-check when a vendor or their terms change.

## Retention schedule

| Data | Retention | Mechanism |
|------|-----------|-----------|
| OTP codes / delivery logs | provider-side, minutes to days | never mirrored into our DB |
| In-app notifications log | 12 months | scheduled purge |
| Attendance / rhythm / plan progress | while account active | removed/anonymized with account deletion |
| Testimonies / prayers | until author deletes or account deleted | deletion policy (`16`) |
| Moderation reports | 24 months (safeguarding evidence) | scheduled purge; reporter anonymized on account deletion |
| Analytics | max 14 months | provider setting |
| Consent records (`consent_version`/`consented_at` on content rows) | retained after deletion/anonymization as Art. 9 processing evidence | kept on the anonymized/soft-deleted row |
| **Payment records** (`donations`, `course_registrations`) | **Survive account deletion**, with the member reference nulled. Added 2026-08-17: `donations` joined our schema at ADR 0023 and this position was already being asserted by two migrations' ON DELETE SET NULL without ever being written down where a DPIA would find it. The rows carry the payer's own `donor_name` / `full_name`, `email` and (for Gift Aid) `donor_address`, so this is a genuine carve-out, taken under Art. 17(3)(b): a charity cannot answer for money it has received by pointing at a deleted row, and a Gift Aid claim is a declaration to HMRC that has to remain evidenced. What deletion DOES remove is the link to the account: `donations.user_id` and `course_registrations.profile_id` null on delete, so the record stops naming a member of the app while the financial fact survives. **Open before launch:** confirm the exact statutory period with the church's accountant (Gift Aid and charity accounting are both years, not months, but "years" is not a retention policy) and add the purge that enforces it, alongside `privileged_actions`' 7-year job in `21` §5 | FK `on delete set null` in `20260817120000` / `20260809202000`; asserted in `supabase/tests/039`. No purge job yet, deliberately: the period is unconfirmed and deleting financial records early is the worse error |
| `payhip_events` raw payloads (buyer emails, buyer IP) | payload redacted to non-PII after successful processing; full rows purged at 12 months | `21` §5 retention job. **Built W4.1 slice 2:** the redaction keeps exactly six keys (order id, type, date, price, currency, items) and drops everything else, so a key Payhip adds later is dropped by default rather than kept by oversight |
| `unmatched_purchases` (buyer emails) | purged 12 months after creation, claimed or not | `21` §5 retention job. **Built W4.1 slice 2, slightly wider than this row said.** It read "if unclaimed"; a CLAIMED row goes at the same age and not later, because the durable record of that sale is the entitlement it produced and what is left here is a stranger's address with nothing hanging on it |
| `reading_state` after a revocation (where somebody got to in a book they no longer own) | purged 12 months after the entitlement was revoked | `21` §5 retention job. **Built W4.1 slice 2.** `14` has promised the 12 months since it was written (so a re-purchase restores place and progress) and nothing implemented it; keyed on the revocation rather than on the reading, so an owner who has not opened a book in two years keeps their bookmark |
| `privileged_actions` (who granted a role or moved a member, and when; ADR 0015) | **7 years**, aligned with charity governance record-keeping. The row survives the target's deletion with their identifying data dropped and `target_redacted_at` stamped: the governance question ("who appointed this leader") stays answerable while the member is genuinely gone. Same shape as the consent-record carve-out above | append-only table, immutable by policy and trigger (`17` §Platform); purge job deferred until the first rows approach 7 years, tracked in `21` §5 |
| `privileged_actions.note` (the private reason a branch request was refused) | **Survives erasure with the row** (decided 2026-07-30). It is free text a leader typed and may name the member, so the alternative was considered and rejected: wiping it would make closing an account a way to erase a safeguarding record, which is the same failure the carve-out below exists to prevent. Retained under Art. 17(3) (legal obligation, and the establishment or defence of legal claims) rather than under the app's ordinary basis. Admin-readable only, never shown to the member and never re-readable by the leader who wrote it | the append-only trigger already permits either outcome, so this needed no migration; **the reject form must tell the leader, at the point of typing, that the note is retained and admin-readable**, because a required free-text field with no such notice invites detail nobody chose to keep |
| Backups | Nightly off-provider dumps: **30-day rolling retention**, age-encrypted client-side, Backblaze B2 EU Central/Amsterdam (`21` §7, ADR 0018; live since Track P P1, 2026-08-10). Supabase Pro later adds provider dailies, 7-day retention (Free has none; PITR is a paid add-on) | deletion honored by age-out ("beyond use"): a deleted member's data leaves the off-provider copies within 30 days, and the vendor only ever holds ciphertext |

## Deletion & data rights

- **In-app deletion** (`16`) plus the **web deletion path** (Play requirement): a page on the agbc website, email + OTP verified, driving the same server-side flow.
- Deletion reaches: DB rows, storage objects (avatars, testimony photos), the auth user, push tokens, analytics (deletion API or expiry), and third parties where applicable. Backups age out.
- **Two documented carve-outs, both narrow, both stated in the privacy notice** rather than left as surprises: consent evidence on anonymized content rows (above), and `privileged_actions` audit rows, where the deletion job drops the identity and keeps the governance record. An audit log that a member can erase by asking to be deleted cannot do the one job it exists for, which is showing who was given authority over other people's Art. 9 data. The deletion job MUST know about this table: it redacts rather than skips, so "we forgot" and "we decided" are not the same code path.
- **The refusal note is inside that second carve-out, and the privacy notice must say so plainly** (decided 2026-07-30, see the row above). Watch one thing as this feature meets real use: 7 years is a *charity governance* period, and if these notes ever carry actual child-protection detail, UK safeguarding practice retains such records far longer than that. The number is deliberately recorded here rather than only in code so it can be revised once, in one place, without a migration.
- Access/export: an admin-run export (JSON) of one member's data; respond within one month of a request. **Identity verification to the same bar as deletion:** the requester proves control of the account's email via OTP before any export is fulfilled (an email-only account has no other identity anchor; releasing special-category data to an impostor is itself a breach).

## Age policy & safeguarding

- **Accounts are 16+.** The Art. 8 digital-consent age is 16 in Germany and the Netherlands (13 in the UK); one bar keeps it simple and avoids parental-consent flows. `AUTH-3` includes a 16+ self-declaration (`03`). Guests of any age can browse public content.
- **Photos:** the consent step reminds authors to have permission from anyone identifiable, especially children. Moderation rejects photos of identifiable minors without known consent (`17`). Implemented W2.3 slice 3 as its own consent version, `content-share-photo-v1` (the words-only points plus the photo clause), recorded only when the post carries an image and enforced by the database via `consent_versions.covers_photos`: the version on the row therefore names exactly the wording the author read, and a photo can never be attached under consent that did not mention one.
- **Disclosures:** a testimony/prayer disclosing abuse or self-harm is never approved into the public feed; leaders route it to the branch lead pastor through the church's existing safeguarding process (`17`).
- **Illegal-image (CSAM) handling:** user photo uploads are hash-scanned before human review where feasible (Cloudflare's free CSAM Scanning Tool if media is fronted by Cloudflare; else PhotoDNA/Thorn-class hash matching). A documented takedown + report path exists (IWF/NCMEC + local police); moderators are trained never to download flagged content; pending photos are never publicly reachable (private bucket, `02`).
- **No DMs in v1** is a deliberate safeguarding choice (sharing goes out via WhatsApp instead). Keep it that way unless a moderated design is specced.

## DPIA

Special-category data at scale means a **DPIA screening before launch** (ICO template is fine). The mitigations to record already exist by design: moderation-before-public, explicit consent step, EU residency, guest-first minimal collection, this retention schedule, and account deletion.

## Breach basics

- Keep an internal register of ALL incidents, even non-notifiable ones.
- 72-hour assessment/notification path to the relevant authority (ICO for the UK, the competent German LfD, the Dutch AP) when there is risk; notify users directly when the risk is high.
- Assign a named data-protection contact for the church before launch; record the name in the project CLAUDE.md and in the privacy policy.
- A one-page **incident runbook** exists before launch (roles + deputies, contact tree, evidence preservation, comms templates, the 72h assessment step); it lives in `docs/runbooks/` (`21` §7).
- `/.well-known/security.txt` (RFC 9116) on the church website with a working Contact and an unexpired Expires.

## Content licensing (Bible text)

Decision 2026-07-12: daily verses and devotional verse text use the **WEB (World English Bible)**: public domain, no attribution requirement, no quotation caps, safe to store in the DB and render on branded share images. `daily_verses.translation` / `devotional_days.verse_translation` record it. If a licensed translation (NIV/ESV/NLT) is ever adopted, its quotation policy applies and the required attribution line must render on `VerseCard`, `PLAN-DAY`, and every shared verse image; revisit this section then.

## Privacy notice

Layered, plain-language:

1. One short paragraph at the point of collection: `AUTH-1` ("your number is used to sign you in and is never shown publicly") and the consent step.
2. The in-app `PRIVACY` screen (`16`): what's collected, why, who sees it, how to delete.
3. The full policy hosted on the agbc website, linked from `PRIVACY` and from both store listings.
