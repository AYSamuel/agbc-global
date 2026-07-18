# 0010 · Full bespoke tablet layouts in v1

- Status: accepted
- Date: 2026-07-15 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/05-DESIGN-SYSTEM.md` (tablet rules)

## Context

Tablet/iPad support could ship as capped-column phone layouts (cheap) or bespoke tablet layouts (master-detail where it earns it).

## Decision

Full bespoke tablet layouts in v1, a conscious cost trade-off. Capped-column remains the documented fallback if the schedule slips.

## Consequences

- Every screen's verification matrix includes tablet width and both orientations; store screenshot sets include iPad and 7"/10" Android tablets.
- The `Screen` primitive carries width classes from day one (W0.8) so tablet isn't retrofitted.
