# 0008 · One purchase unlocks book AND devotional plan

- Status: accepted
- Date: 2026-07-15 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/10-FEATURE-Rhythm.md`, `docs/spec/14-FEATURE-Store-Library.md`, `docs/spec/07-FEATURE-Home-DailyVerse.md`

## Context

The pastor's devotional exists as a written book sold via Payhip. The app wants a structured day-by-day plan driving Home's daily CTA and the Rhythm streak. Selling them separately doubles friction and support surface.

## Decision

One Payhip purchase grants ONE entitlement that unlocks BOTH the readable book in My Library and the structured plan (PLAN/PLAN-DAY). The dashboard import tool splits the book into days.

## Consequences

- Entitlement-join RLS on the plan tables; Home's verse-card CTA routes entitled users to PLAN-DAY, others to BOOK-DETAIL, and must never route to an empty plan (`10`).
- Purchases stay on the web (Payhip), consistent with 0004's no-store-cut posture.
