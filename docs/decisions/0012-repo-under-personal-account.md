# 0012 · Repo under Ayo's personal GitHub account

- Status: accepted (amends the 2026-07-13 free-org decision in `23` §4 / `24` §2.1)
- Date: 2026-07-18
- Spec: `docs/spec/23-VERSION-CONTROL.md` §4, `docs/spec/24-PHASE-MINUS-1.md` §2.1

## Context

The original bootstrap plan placed the private repo under a new free GitHub org (church ownership, second owner for the bus factor). Ayo decided to keep it under his personal account.

## Decision

`AYSamuel/agbc-global`, private, stays where it is. Everything else from the original decision stands: prod deploys via a manually triggered `workflow_dispatch` job, branch discipline by convention until GitHub Team is justified by a second contributor.

## Consequences

- Simpler now; the bus-factor mitigation shifts to the credentials runbook (second owners on the accounts that matter) rather than org ownership.
- If a second contributor joins or church ownership is later required, GitHub supports transferring a repo to an org with automatic redirects; revisit then.
