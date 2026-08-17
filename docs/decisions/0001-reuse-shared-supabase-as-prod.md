# 0001 · Reuse the shared Supabase project as production

- Status: **superseded by [0023](0023-production-is-a-new-supabase-project.md)** (2026-08-17)
- Date: 2026-07-13 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/19-MIGRATION-GRACE-PORTAL.md`, `docs/spec/24-PHASE-MINUS-1.md` §1

## Context

A Supabase project (ref `fotfplvqsnmbzjjhqlwp`, eu-central-1) already exists and serves the LIVE church website plus legacy Grace Portal tables. Options: reuse it as the app's production, or create a fresh project and run two.

## Decision

Reuse the shared project as prod. Region confirmed EU (eu-central-1), which satisfies the GDPR posture in `20`. One project, one bill, one backup pipeline covering the website's data too.

## Consequences

- Hard rules follow: the traffic fence (no app build points at prod while it is on the Free plan) and the destructive-work gate (off-provider dump + verified restore before ANY destructive step of the Grace Portal cleanup). See Track P in `25`.
- Website-owned objects must be audited and fenced (the FENCED SUPABASE OBJECTS list in `CLAUDE.md`); until the audit, every pre-existing prod object is treated as fenced.

## Superseded, 2026-08-17

Reversed by [0023](0023-production-is-a-new-supabase-project.md): production is a new project
and the website moves onto it. Two things this ADR could not have known decided it. The
2026-07-30 audit priced the cleanup (13 tables, 48 functions, 21 triggers, 42 policies, 6
cron jobs, a bucket, two migration histories, four measured ordering hazards, all on a live
project), and ADR 0017 made `course_registrations` a table the app and the website SHARE, so
the website stopped being a neighbour to fence off and became a participant in our schema.

The fenced list this ADR called for was built, used, and dissolved with the fence. The audit
it called for is the reason the reversal could be argued at all, and it stands as the record
of what the old project holds.
