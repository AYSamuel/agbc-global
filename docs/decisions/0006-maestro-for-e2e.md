# 0006 · Maestro for end-to-end tests

- Status: accepted
- Date: 2026-07-12 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/21-OPERATIONS.md` §4

## Context

E2E on React Native offers Detox (gray-box, heavier setup) or Maestro (black-box YAML flows, the 2026 Expo community consensus, runs on dev/release builds).

## Decision

Maestro, for journey-level smoke tests only (guest browse, OTP sign-in with the review bypass, post-to-pending, gate-return, RSVP, block). Logic depth belongs to Jest/RNTL/pgTAP, not E2E.

## Consequences

- Cheap to write and maintain; runs in nightly CI on Android emulator profiles (small phone + tablet).
- Black-box means no deep state assertions; server-side truths are asserted by pgTAP instead.
