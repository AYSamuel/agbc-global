# 19 · Migration: Replacing Grace Portal

## Context

"Grace Portal" (`agbc-app/`, Flutter, package `grace_portal`, last local version `1.0.0+19`) is the church's existing app on the stores. **Nobody actively uses it.**

**Decision (2026-07-12):** the new AGBC Global app **replaces Grace Portal on the existing store listings**. Anyone who still has it installed receives the new app as a normal update. No in-app data migration is needed: there are no active users, and local data from the old app is simply abandoned when the update lands.

## Store identity (must match EXACTLY)

The stores do not care that the framework changes (Flutter to React Native); they care that identity and signing match.

| Item | Value | Source |
| ------ | ------- | -------- |
| Android `applicationId` | `com.oami.agbcapp` | `agbc-app/android/app/build.gradle` |
| Android `versionCode` | must be **> 19** (start at 20) | pubspec `1.0.0+19`; **CONFIRMED 2026-07-18 in Play Console: highest uploaded is 19 (1.0.0)**. Play App Signing key SHA-256 (for assetlinks.json): `E2:43:77:09:F4:A6:3E:66:B0:D5:F2:B4:B2:B7:6D:E2:9D:6D:EE:37:00:F1:84:5C:6E:E4:E9:AC:76:20:F6:5B` |
| Android signing | existing upload keystore at `C:\Users\AY\agbc-keystore\agbc-new-upload-key.jks` (moved out of the old app folder 2026-07-19), alias `agbc-key`, uploaded into EAS credentials (never let EAS generate a new one). Password verified with keytool 2026-07-18; passwords in `agbc-app/android/key.properties` (gitignored, local-only) AND the password manager | |
| iOS bundle id | `com.olayinkaademiluka.grace-portal` | `agbc-app/ios/Runner.xcodeproj` |
| iOS build number | above the last build in App Store Connect / TestFlight | App Store Connect |
| Apple team | the existing non-profit team | |

- In `app.json` / `app.config.ts`: set `android.package` and `ios.bundleIdentifier` to the values above. This supersedes any earlier note about creating a new App ID.
- Keystore passwords/alias go into EAS credentials, never into the repo.
- If the Play app is enrolled in Play App Signing, only the upload key must match (it does); Google re-signs with the app signing key.
- Store listings (name, icon, screenshots, description) are updated to the AGBC Global branding with the first release; install base and review history are retained.

## Supabase: reuse plan (shared project!) · HISTORICAL from 2026-08-17

**THIS SECTION IS NO LONGER AN INSTRUCTION.** ADR 0023 (2026-08-17) reversed ADR 0001:
production is a NEW Supabase project and the church website moves onto it. Everything below
describes the reuse-and-clean-up plan that is no longer being executed. There is no cleanup,
no rehearsal, no two-history reconciliation, and no fence. The authoritative document is
`docs/spec/plans/track-p-fresh-prod-project.md`.

It is kept rather than deleted because it is the record of what the old project holds and
what was decided about it, and because two of its findings still bind: the region requirement
(EU, `eu-central-1`) and the `course_registrations` ALTER that ran on the old project on
2026-08-10, which is now simply part of that project's history.

**The rest of `19` is untouched and still binding.** Store identity, signing, versionCode,
listings, ratings and release copy are unaffected by where the database lives.

---

> **Steps 1 and 2 are DONE (2026-07-30).** Full evidence and the ordered cleanup plan:
> `docs/runbooks/prod-audit-2026-07-30.md`; the fenced list is in the project `CLAUDE.md`.
>
> **The ADR 0017 additive ALTER on `course_registrations` ran 2026-08-10** (reviewed step,
> behind Track P P1): prod's copy of the shared table now carries the app's second block
> (columns, comments, indexes, the partial unique; NO FKs/triggers/policies, whose targets
> arrive with this cutover). Script + evidence: `docs/runbooks/prod-alter-2026-08-10.md`.
> The step is also recorded in prod's own migration history
> (`..._course_registrations_app_columns`), which step 6's baseline must reckon with.
> The audit corrected three things below and found four ordering hazards this section did not
> anticipate, so read the runbook before acting on steps 3 to 6.
>
> Corrections: the website uses **2** tables (`donations`, `course_registrations`), not ~3.
> The project is **already migration-managed** (35 migrations, Jan to Feb 2026), so step 6's
> baseline works against an existing history. And there are **6 active cron jobs**, which this
> document never mentions.
>
> Hazards, all measured: `donations`' admin policy references `public.users` and the
> `user_role` enum, so a CASCADE drop silently deletes it; `donations.user_id` FKs to
> `auth.users` with no ON DELETE and 4 of 12 rows point at users step 5 wants to delete, so
> step 5 is refused as written; the cron jobs call functions on the drop list, so they must be
> unscheduled BEFORE the drops or they fail every minute; and `public.daily_verses` collides by
> name with the new schema in an incompatible shape, which fails the apply.

The existing Supabase project is **shared**: the agbc website uses roughly 3 tables; everything else belongs to Grace Portal. This project becomes the app's **production** backend after cleanup. Order of operations:

1. **Audit.** List every table, view, function, trigger, RLS policy, and storage bucket. Label each one `website`, `grace-portal`, or `unknown`. Confirm against the website codebase which objects it actually reads (never from memory).
2. **Fence.** Website objects and their RLS policies are untouchable. Record the fenced list in the project CLAUDE.md so no migration ever touches them.
3. **Back up + rehearse.** Full backup/export before any destructive change, then **rehearse the entire cleanup once**: restore the prod dump into a short-lived scratch project and run the full Grace Portal drop + new schema apply end to end there. No environment resembles prod (the website tables exist only there) until this rehearsal; do not discover collisions live.
4. **Remove.** Drop Grace Portal tables/functions/buckets only after the audit confirms nothing else reads them. Every drop is reviewed and explicitly confirmed (destructive, staged behind the backup).
5. **Clean auth.** Remove stale Grace Portal auth users (nobody active); keep any account the website relies on.
6. **Migrate (baseline strategy).** After cleanup, run `supabase db pull` against prod to produce a **baseline migration that INCLUDES the website's tables** (so the dev project, created from the same history, is truly schema-identical and RLS behavior matches), marked applied in prod via `supabase migration repair`. All app changes are subsequent numbered migrations that never reference website objects; CI enforces this with a fence-guard check against the fenced-object list, and a pgTAP test asserts the website objects are untouched. **Fence GRANTs too:** the app and website share one anon key, so every anon policy on website tables is reachable from the app and vice versa; the audit covers policies and grants, not just table drops. Prod migrations apply only via the manually triggered prod deploy workflow (`21` §3, `23` §4). Seed branches/courses/academy/giving config via the versioned seed (with the augmentation map: the JSON lacks lat/lng/slug/timezone, see `02`).
7. **Region check: DONE (2026-07-13).** Confirmed `eu-central-1` (Frankfurt), EU as required; this plan stands. Note the project is currently on the **Free plan** with the Pro upgrade deferred: the off-provider dump pipeline + verified restore is a hard precondition before any destructive step above (`21` §7, `24`).

**Environments:** existing shared project = **production**; a fresh free-tier project = **dev**. There is no staging environment; the only staging-like environment is the short-lived cleanup-rehearsal project (`21` §2).

## Store product (listing, rating, release copy)

- **Age rating questionnaires** (Apple's tier system, Play IARC) answered consistently with the spec: UGC = yes, with pre-publication moderation + report + block; accounts 16+ (per `20`); no unrestricted web content. Keep the answer sheet with the listing assets.
- **Listing localization:** the app ships EN/DE/NL/FR, so the store listings do too: name/subtitle/description and screenshots per locale; an owner is named for producing them (see `22` owners table).
- **Screenshot matrix:** iPhone 6.9" and 6.5", iPad (tablet layouts are claimed in v1), Play phone + 7" + 10" tablet, per locale.
- **Deep-link files:** the church website hosts `/.well-known/apple-app-site-association` and `assetlinks.json`; the Android fingerprint is the **Play App Signing key SHA-256 from the Play Console**, never the local upload keystore (see `15`).
- **Release-note copy for existing Grace Portal installs** (the app changes name, icon, and sign-in overnight): "Grace Portal is now AGBC Global: a brand new app for the whole AGBC family. Browse freely, watch and listen to messages, share testimonies and prayers, and see the family across Glasgow, Berlin, Emmen and Ogbomosho. Sign in with your email to join in." Old Grace Portal credentials are retired; email-OTP replaces them.

## Push: OneSignal is retired

Grace Portal used OneSignal; the new app uses Expo Push (APNs/FCM). Nothing to migrate (no active users). After the new app ships: retire the OneSignal app and remove its keys from any CI secrets (`agbc-app`'s GitHub Actions).

## Checklist

- [x] Highest uploaded `versionCode` and iOS build number confirmed in Play Console / App Store Connect (both 19 on 1.0.0, 2026-07-18)
- [ ] EAS credentials: existing Android upload keystore + Apple distribution cert configured
- [ ] App config uses `com.oami.agbcapp` / `com.olayinkaademiluka.grace-portal`, `versionCode` >= 20
- [x] Supabase audit complete; website objects fenced and recorded in project CLAUDE.md (2026-07-30, `docs/runbooks/prod-audit-2026-07-30.md`)
- [ ] `donations`' admin policy rewritten against `public.profiles` BEFORE any drop (else CASCADE deletes it silently)
- [ ] `donations_user_id_fkey` resolved for the 4 rows pointing at auth users due for deletion (never CASCADE: they are giving records)
- [ ] All 6 cron jobs unscheduled BEFORE dropping the functions they call
- [ ] Prod's `daily_verses` dropped (name collision with the new schema, incompatible shape). Content is NOT carried: the 57 rows are randomly sampled KJV, include a duplicate and several shame-framed verses, and `22` specifies WEB. Launch verses come from `22`'s "90 daily verses queued" checklist item
- [ ] `notification_receipts` RLS decision made (currently disabled on a live project)
- [ ] Nightly off-provider `db dump` pipeline live + one verified restore (HARD precondition before ANY destructive step, `21` §7 / `24`)
- [ ] Cleanup rehearsed end to end on a restored prod dump (scratch project)
- [ ] Backup taken; Grace Portal objects removed; stale auth users cleaned
- [ ] `02` schema migrated; seeds loaded; RLS baseline reviewed
- [ ] Before the app schema is applied, check `sermon_notes` for duplicate `(profile_id, sermon_id)` pairs. `20260815120000` DELETES duplicates (keeping the newest) so it can add the unique constraint behind them. That is safe today only because these tables reach prod for the first time AT this cutover and therefore hold nothing; if the order ever changes and real notes exist first, this migration deletes a member's words without asking (flagged with Ayo, 2026-08-15, W3.1 slice 4)
- [x] Project region confirmed EU: `eu-central-1` (2026-07-13; project ref `fotfplvqsnmbzjjhqlwp`)
- [ ] Baseline migration (incl. website tables) pulled + repaired; fence-guard test green
- [ ] Shipping on Expo SDK 56+ (Play target API 36 from 2026-08-31)
- [ ] AASA + assetlinks live on the church site; assetlinks uses the Play App Signing SHA-256
- [ ] Age-rating answer sheet done; EN/DE/NL/FR listings + screenshot matrix produced
- [ ] Listings updated to AGBC Global branding (release-note copy above)
- [ ] OneSignal retired after launch
