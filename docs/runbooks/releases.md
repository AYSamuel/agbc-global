# Releases

The table `23` (b) has asked for since it was written, and which did not exist until
1.0.1. It is the whole release picture together with the two store consoles: what shipped,
which build carried it, from which commit, and how far it was rolled out.

**How a release is cut**, in the order the steps actually happen:

1. Bump `version` in `apps/mobile/app.config.js`. That is the ONLY version number in the
   repo. The build number lives on EAS (`appVersionSource: "remote"`, and the production
   profile auto-increments), so nothing here sets `versionCode`. Read the live one with
   `eas build:version:get --platform android`.
2. Merge the release commit into `main`, then tag it: `git tag -a v1.0.1 -m "..."` and
   push the tag. **The tag triggers nothing.** `23` says it triggers `release.yml`; that
   workflow was never written, and the CI budget rule argues against one whose only job
   would be to label what a human just did. The tag is the record, not a mechanism.
3. `eas build --platform android --profile production` from the tagged commit. EAS records
   the commit on the build, which is what makes the "commit" column below trustworthy
   rather than typed in from memory.
4. Upload the `.aab` by hand in the Play console. `eas submit` is still not configured
   (`store-submission.md`, known gaps): `eas.json` has `submit.production: {}` and there is
   no Google service-account key.
5. **Verify from Publishing overview, never from the form you just filled in**, and for
   anything public verify from the live store page. This console has three separate
   not-committed-yet states and has caught us with all three
   (`store-submission.md` §SUBMISSION RECORD).
6. **Only once THAT store shows the build live**, raise `app_config.minimum_supported_version`
   for that platform if the release is meant to retire the one before it (`21` §8). Never
   before, and never both platforms at once while only one is live.

**What the app does with a release once it is out** (W4.10): a member on an older build is
told at most once a day and can install it without leaving the app; at 28 days of staleness
Play's immediate flow takes over. Nothing per-release has to be configured for that. The one
optional lever is Play's update priority (4 or higher, set through the Publishing API), which
escalates a release immediately.

---

## The table

| Version | Build | Tag | Commit | Fingerprint | Built | Store | Rollout | Notes |
|---|---|---|---|---|---|---|---|---|
| 1.0.1 | 23 | `v1.0.1` | (this release) | (filled from the build) | 2026-09-08 | Play | TBC | **The first in-app-update release.** W4.10: the once-a-day update notice, Play's flexible install behind it, escalation at 28 days stale, and the forced-update wall's button installing rather than linking out. Also the first release whose artefact is tagged, and the first row in this table |
| 1.0.0 | 22 | none | `178d1a0` | `7f58dee6` | 2026-09-04 (32 min) | Play, submitted 2026-09-05, **live 2026-09-06** | full (100%) at submission | The launch release, and the one that replaced Grace Portal on the existing listing. Recorded here after the fact, from the console and the EAS build record. **The store listing did not go out with it**: it was typed into the console and never saved, so Play served Grace Portal's name, icon and screenshots for three days until it was saved and sent for review on 2026-09-08 |
| 1.0.0 | 21 | none | `1d1faeb` | `f9409204` | 2026-09-04 (20 min) | never uploaded | n/a | Superseded by 22 the same day. Kept in the table because it is the reason `versionCode` cannot be read as a release count: 21 and 22 are two builds of ONE release, which is exactly why W4.10's escalation is measured in Play's staleness days instead |

**Runtime fingerprint** is the first eight characters of the hash EAS computes per build
(`runtimeVersion` is `{ policy: 'fingerprint' }`). It is not typed in from memory: read it
back with `eas build:list --platform android --json`, which returns `fingerprint.hash` on
every build. It matters only to OTA, which is not built (`21` §8), so today it distinguishes
nothing and is recorded because a native change is exactly what makes two builds
incompatible, and this is the only place that would show it.

**How long a build takes**, from this project's own record rather than a guess: 14 to 32
minutes wall clock including the free-tier queue, with the two production builds at 20 and
32 minutes.

**The build allowance is 15 Android and 15 iOS per CALENDAR MONTH**, and it resets on the
1st (Expo pricing + billing FAQ, re-read 2026-09-08). It is not a lifetime cap. Running out
does not queue anything and cannot be paid past on Free: new builds are simply unavailable
until the reset. September stood at 7 Android builds before 1.0.1, two of which errored;
whether an errored build spends the allowance is not stated in Expo's docs, so count it as
if it does and read the real number from the usage page on expo.dev.

**Staged rollout and the halt criteria** live in `21` §8 and are restated in
`store-submission.md` §4, next to the button that does it: Play 10 > 25 > 50 > 100% over
about seven days, halted for crash-free below 99.5%, ANR above 0.5%, an OTP success
collapse, or any moderation or data-integrity bug. 1.0.0 went out at full rollout because it
was the rebrand release replacing an app that already had installs.
