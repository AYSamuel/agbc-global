# 0007 · PostHog (EU cloud) for analytics

- Status: accepted
- Date: 2026-07-12 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/22-CONTENT-OPERATIONS.md` §5, `docs/spec/20-PRIVACY-COMPLIANCE.md`

## Context

The product needs its ~20 v1 events and north-star metrics without a data warehouse, under GDPR (special-category context: religious affiliation is inferable from usage).

## Decision

PostHog on the EU cloud (Frankfurt), free tier (1M events/month). Anonymous/cookieless mode or explicit opt-in per `20`; nothing non-essential fires before consent.

## Consequences

- EU data residency by construction; account is region-locked to eu.posthog.com (created 2026-07-18).
- Event names/properties must stay PII-free; the `22` §5 event list is the contract.
