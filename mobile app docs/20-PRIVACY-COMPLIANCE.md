# 20 · Privacy, GDPR & Safeguarding

The congregation spans the UK (Glasgow), the EU (Berlin, Emmen), and Nigeria (Ogbomosho): **UK GDPR and EU GDPR both apply**, and Nigeria's NDPA applies to Ogbomosho members. This doc is engineering guidance, not legal advice; have the final policy text reviewed by the church's data-protection contact or counsel before launch.

## Why this app is higher-stakes than a normal app

Church membership, testimonies, and prayer requests reveal **religious beliefs**: special-category data under **GDPR Art. 9**. Healing testimonies add **health data**. Special-category processing needs an Art. 9 condition on top of a normal lawful basis. Ours:

- **Explicit consent (Art. 9(2)(a))** for anything shared publicly, captured by the mandatory consent step before every testimony/prayer submission (`09`).
- **Art. 9(2)(d)** (legitimate activities of a religious not-for-profit, relating to members/former members, no disclosure outside without consent) as the backstop for internal processing (attendance, rhythm, moderation).

## Lawful-basis map

| Processing | Data | Lawful basis | Art. 9 condition |
|-----------|------|--------------|------------------|
| Account (phone, email, name, branch, language) | contact + profile | contract (providing the service) | 9(2)(d) |
| Testimonies / prayers (public sharing) | UGC incl. religious/health | consent | 9(2)(a) explicit, via consent step |
| Attendance / rhythm / plan progress | religious-practice data | consent (member opts in by using the feature) | 9(2)(a) |
| Push / WhatsApp notifications | tokens, phone | consent (opt-in prefs, `15`) | n/a |
| Moderation & safety (reports, audit) | UGC + reports | legitimate interest (community safety) | 9(2)(d) |
| Analytics / crash reporting | pseudonymous usage | consent (see below) | n/a |

## Consent mechanics

- The compose **consent step** (`09`) is the Art. 9 capture: plain words ("shared publicly with the church family worldwide; a leader reviews it first"), stored with a timestamp and the version of the wording shown.
- Consent is withdrawable: deleting a post, or the account, withdraws it; the delete paths (`16`) are the mechanism.
- **Analytics:** nothing non-essential fires before consent. v1: run PostHog in anonymous/cookieless mode OR behind an in-app opt-in (Settings toggle + first-run card). Sentry is configured to scrub PII: no phone numbers, no user content in events or breadcrumbs.

## Data residency

- The Supabase project must be in an **EU region**; verify the existing shared project as part of the `19` audit. If it is in a non-EU region, decide before launch whether to migrate (see `19`, step 7).
- Twilio and Meta route messages internationally by nature; that transfer is covered by their DPAs and current transfer mechanisms (DPF/SCCs), not by our region choice.

## Processors (a DPA with each)

| Vendor | Purpose | Notes |
|--------|---------|-------|
| Supabase | DB / auth / storage | DPA available; pin EU region |
| Twilio | OTP (WhatsApp + SMS) | DPA; verify current transfer mechanism |
| Meta (WhatsApp Cloud API) | OTP delivery, broadcasts | business terms + DPA |
| Expo | push relay | DPA |
| Sentry | crash reporting | DPA; PII scrubbing on |
| PostHog | analytics | EU Cloud option; DPA |
| Payhip | book purchases | buyer's merchant of record; we receive only buyer email for entitlement (`14`) |
| Resend (or equivalent) | transactional email (email verification OTP, `02`/`03`) | DPA; SPF + DKIM (+ DMARC) on the church domain; Supabase Auth custom SMTP points at it (the built-in Supabase sender is dev-only: 2 emails/hour). The website already uses Resend, so reuse that account |

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
| `payhip_events` raw payloads (buyer emails) | payload redacted to non-PII after successful processing; full rows purged at 12 months | `21` §5 retention job |
| `unmatched_purchases` (buyer emails) | purged 12 months after creation if unclaimed | `21` §5 retention job |
| Backups | Supabase Pro: daily, **7-day retention** (Free has none; PITR is a paid add-on); plus nightly off-provider dumps (`21` §7) | deletion honored by age-out ("beyond use") |

## Deletion & data rights

- **In-app deletion** (`16`) plus the **web deletion path** (Play requirement): a page on the agbc website, phone + OTP verified, driving the same server-side flow.
- Deletion reaches: DB rows, storage objects (avatars, testimony photos), the auth user, push tokens, analytics (deletion API or expiry), and third parties where applicable. Backups age out.
- Access/export: an admin-run export (JSON) of one member's data; respond within one month of a request. **Identity verification to the same bar as deletion:** the requester proves control of the account's phone via OTP before any export is fulfilled (a phone-only account has no other identity anchor; releasing special-category data to an impostor is itself a breach).

## Age policy & safeguarding

- **Accounts are 16+.** The Art. 8 digital-consent age is 16 in Germany and the Netherlands (13 in the UK); one bar keeps it simple and avoids parental-consent flows. `AUTH-3` includes a 16+ self-declaration (`03`). Guests of any age can browse public content.
- **Photos:** the consent step reminds authors to have permission from anyone identifiable, especially children. Moderation rejects photos of identifiable minors without known consent (`17`).
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
