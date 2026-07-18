# 0004 · Giving links out to the web

- Status: accepted
- Date: 2026-07-12 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/12-FEATURE-Giving.md`

## Context

In-app payments would route donations through store billing (15-30% cut) or require a payments integration with compliance burden. Guests should also be able to give without an account.

## Decision

The GIVE tab links out to the church website's giving page via the in-app browser (`expo-web-browser`), plus PayPal and fully-offline bank details from `giving_config`. No payment processing in the app itself.

## Consequences

- No store cut on donations; no PCI surface in the app; guests can give (lowest friction for generosity).
- Store review must see giving as clearly link-out (physical-world charity exemption); bank details must work offline from cached config (`12`).
