# 0011 · Email OTP for v1 auth

- Status: accepted (supersedes [0003](0003-whatsapp-first-otp.md))
- Date: 2026-07-18
- Spec: `docs/spec/03-AUTHENTICATION.md` (rewritten this date), `docs/spec/02-DATA-MODEL.md`

## Context

Finances ruled out the Twilio cluster (paid account, per-code fees) and its fuses (Meta business verification on the auth path, NCC Nigeria sender-ID registration, 2-3 weeks). SMS to Nigeria is DND-filtered regardless. The church website already uses Resend, whose free tier (3,000 emails/month) covers church-scale OTP volume.

## Decision

Email address + typed 6-digit OTP via Supabase Auth (code in the template via `{{ .Token }}`, never a magic link), delivered through Resend custom SMTP (SPF + DKIM aligned, DMARC at enforcement). Local dev uses Mailpit. Email becomes the profile identity; phone becomes optional, collected only at WhatsApp broadcast opt-in.

## Consequences

- Zero auth cost; no external fuse on the launch critical path; Meta verification gates Phase 3 broadcasts only; one WhatsApp number needed instead of two.
- Known trade-off: some members rarely check email and OTP mail can land in spam. Mitigations in `03` (domain auth, code in subject, spam hint on AUTH-2, support copy).
- Reversible: phone/WhatsApp OTP can be added post-v1 as a second identity without account loss.
- Simplification: the Payhip restore-purchase flow needs no separate email-verification step (identity email is verified by sign-in).
