# 0001 · Reuse the shared Supabase project as production

- Status: accepted
- Date: 2026-07-13 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/19-MIGRATION-GRACE-PORTAL.md`, `docs/spec/24-PHASE-MINUS-1.md` §1

## Context

A Supabase project (ref `fotfplvqsnmbzjjhqlwp`, eu-central-1) already exists and serves the LIVE church website plus legacy Grace Portal tables. Options: reuse it as the app's production, or create a fresh project and run two.

## Decision

Reuse the shared project as prod. Region confirmed EU (eu-central-1), which satisfies the GDPR posture in `20`. One project, one bill, one backup pipeline covering the website's data too.

## Consequences

- Hard rules follow: the traffic fence (no app build points at prod while it is on the Free plan) and the destructive-work gate (off-provider dump + verified restore before ANY destructive step of the Grace Portal cleanup). See Track P in `25`.
- Website-owned objects must be audited and fenced (the FENCED SUPABASE OBJECTS list in `CLAUDE.md`); until the audit, every pre-existing prod object is treated as fenced.
