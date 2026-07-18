# 0002 · Replace Grace Portal on the existing store listings

- Status: accepted
- Date: 2026-07-12 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/19-MIGRATION-GRACE-PORTAL.md`

## Context

The church already ships an app (Grace Portal) on both stores. A new app could get fresh listings, or take over the existing records.

## Decision

The new app replaces Grace Portal on the EXISTING listings: Android `com.oami.agbcapp` (versionCode floor 20, confirmed: highest uploaded is 19; signed with the existing upload keystore held in EAS credentials), iOS `com.olayinkaademiluka.grace-portal` on the existing App Store Connect record and Apple team.

## Consequences

- Existing installs update in place; no audience rebuild, no review history reset.
- The identity values may NEVER be regenerated or changed; new store records may never be created. Release notes must explain the rebrand to existing users (`19`).
