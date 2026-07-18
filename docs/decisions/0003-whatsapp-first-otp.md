# 0003 · Phone OTP with WhatsApp-first delivery

- Status: superseded by [0011](0011-email-otp-for-v1.md)
- Date: 2026-07-12 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/03-AUTHENTICATION.md` (as of 2026-07-12; since rewritten)

## Context

The membership is diaspora, mobile-first, WhatsApp-native. Passwords are friction; phone numbers looked like the universal identity. SMS to Nigeria is unreliable (DND filtering swallows OTP SMS).

## Decision

Phone number + OTP via Supabase Auth and Twilio Verify, WhatsApp channel first, SMS fallback.

## Consequences

- Required the full Twilio cluster: paid account, per-code fees, Meta business verification on the auth critical path, NCC sender-ID registration for Nigeria (2-3 week fuse).
- Superseded on 2026-07-18 by email OTP (0011) when finances ruled out the paid cluster; the WhatsApp-native argument remains valid and phone OTP can return post-v1 as a second method.
