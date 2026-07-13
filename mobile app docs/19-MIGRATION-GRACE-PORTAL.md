# 19 · Migration: Replacing Grace Portal

## Context

"Grace Portal" (`agbc-app/`, Flutter, package `grace_portal`, last local version `1.0.0+19`) is the church's existing app on the stores. **Nobody actively uses it.**

**Decision (2026-07-12):** the new AGBC Global app **replaces Grace Portal on the existing store listings**. Anyone who still has it installed receives the new app as a normal update. No in-app data migration is needed: there are no active users, and local data from the old app is simply abandoned when the update lands.

## Store identity (must match EXACTLY)

The stores do not care that the framework changes (Flutter to React Native); they care that identity and signing match.

| Item | Value | Source |
|------|-------|--------|
| Android `applicationId` | `com.oami.agbcapp` | `agbc-app/android/app/build.gradle` |
| Android `versionCode` | must be **> 19** (start at 20) | pubspec `1.0.0+19`; confirm the highest code actually uploaded in Play Console |
| Android signing | existing upload keystore `agbc-app/agbc-new-upload-key.jks`, uploaded into EAS credentials (never let EAS generate a new one) | |
| iOS bundle id | `com.olayinkaademiluka.grace-portal` | `agbc-app/ios/Runner.xcodeproj` |
| iOS build number | above the last build in App Store Connect / TestFlight | App Store Connect |
| Apple team | the existing non-profit team | |

- In `app.json` / `app.config.ts`: set `android.package` and `ios.bundleIdentifier` to the values above. This supersedes any earlier note about creating a new App ID.
- Keystore passwords/alias go into EAS credentials, never into the repo.
- If the Play app is enrolled in Play App Signing, only the upload key must match (it does); Google re-signs with the app signing key.
- Store listings (name, icon, screenshots, description) are updated to the AGBC Global branding with the first release; install base and review history are retained.

## Supabase: reuse plan (shared project!)

The existing Supabase project is **shared**: the agbc website uses roughly 3 tables; everything else belongs to Grace Portal. This project becomes the app's **production** backend after cleanup. Order of operations:

1. **Audit.** List every table, view, function, trigger, RLS policy, and storage bucket. Label each one `website`, `grace-portal`, or `unknown`. Confirm against the website codebase which objects it actually reads (never from memory).
2. **Fence.** Website objects and their RLS policies are untouchable. Record the fenced list in the project CLAUDE.md so no migration ever touches them.
3. **Back up + rehearse.** Full backup/export before any destructive change, then **rehearse the entire cleanup once**: restore the prod dump into a short-lived scratch project and run the full Grace Portal drop + new schema apply end to end there. No environment resembles prod (the website tables exist only there) until this rehearsal; do not discover collisions live.
4. **Remove.** Drop Grace Portal tables/functions/buckets only after the audit confirms nothing else reads them. Every drop is reviewed and explicitly confirmed (destructive, staged behind the backup).
5. **Clean auth.** Remove stale Grace Portal auth users (nobody active); keep any account the website relies on.
6. **Migrate (baseline strategy).** After cleanup, run `supabase db pull` against prod to produce a **baseline migration that INCLUDES the website's tables** (so the dev project, created from the same history, is truly schema-identical and RLS behavior matches), marked applied in prod via `supabase migration repair`. All app changes are subsequent numbered migrations that never reference website objects; CI enforces this with a fence-guard check against the fenced-object list, and a pgTAP test asserts the website objects are untouched. **Fence GRANTs too:** the app and website share one anon key, so every anon policy on website tables is reachable from the app and vice versa; the audit covers policies and grants, not just table drops. Prod migrations apply only via the approval-gated CI job (`21` §3). Seed branches/courses/academy/giving config via the versioned seed (with the augmentation map: the JSON lacks lat/lng/slug/timezone, see `02`).
7. **Region check.** Confirm the project region is EU/UK (see `20`). If it is not, weigh migrating to a fresh EU project BEFORE launch; that decision flips this plan to "new project + copy the website's 3 tables," so make it first.

**Environments:** existing shared project = **production**; a fresh free-tier project = **dev**. There is no staging environment; the only staging-like environment is the short-lived cleanup-rehearsal project (`21` §2).

## Store product (listing, rating, release copy)

- **Age rating questionnaires** (Apple's tier system, Play IARC) answered consistently with the spec: UGC = yes, with pre-publication moderation + report + block; accounts 16+ (per `20`); no unrestricted web content. Keep the answer sheet with the listing assets.
- **Listing localization:** the app ships EN/DE/NL, so the store listings do too: name/subtitle/description and screenshots per locale; an owner is named for producing them (see `22` owners table).
- **Screenshot matrix:** iPhone 6.9" and 6.5", iPad (tablet layouts are claimed in v1), Play phone + 7" + 10" tablet, per locale.
- **Deep-link files:** the church website hosts `/.well-known/apple-app-site-association` and `assetlinks.json`; the Android fingerprint is the **Play App Signing key SHA-256 from the Play Console**, never the local upload keystore (see `15`).
- **Release-note copy for existing Grace Portal installs** (the app changes name, icon, and sign-in overnight): "Grace Portal is now AGBC Global: a brand new app for the whole AGBC family. Browse freely, watch and listen to messages, share testimonies and prayers, and see the family across Glasgow, Berlin, Emmen and Ogbomosho. Sign in with your phone number to join in." Old Grace Portal credentials are retired; phone-OTP replaces them.

## Push: OneSignal is retired

Grace Portal used OneSignal; the new app uses Expo Push (APNs/FCM). Nothing to migrate (no active users). After the new app ships: retire the OneSignal app and remove its keys from any CI secrets (`agbc-app`'s GitHub Actions).

## Checklist

- [ ] Highest uploaded `versionCode` and iOS build number confirmed in Play Console / App Store Connect
- [ ] EAS credentials: existing Android upload keystore + Apple distribution cert configured
- [ ] App config uses `com.oami.agbcapp` / `com.olayinkaademiluka.grace-portal`, `versionCode` >= 20
- [ ] Supabase audit complete; website objects fenced and recorded in project CLAUDE.md
- [ ] Backup taken; Grace Portal objects removed; stale auth users cleaned
- [ ] `02` schema migrated; seeds loaded; RLS baseline reviewed
- [ ] Project region confirmed EU/UK, or the new-project decision recorded instead
- [ ] Cleanup rehearsed end to end on a restored prod dump (scratch project)
- [ ] Baseline migration (incl. website tables) pulled + repaired; fence-guard test green
- [ ] Shipping on Expo SDK 56+ (Play target API 36 from 2026-08-31)
- [ ] AASA + assetlinks live on the church site; assetlinks uses the Play App Signing SHA-256
- [ ] Age-rating answer sheet done; EN/DE/NL listings + screenshot matrix produced
- [ ] Listings updated to AGBC Global branding (release-note copy above)
- [ ] OneSignal retired after launch
