# Runbook: submitting AGBC Global to the stores

**W4.8. Refs:** `19` (store identity, release copy), `03` §Security (the review bypass),
`21` §8 (release engineering, staged rollout, halt criteria), `18` (launch checklist).
Copy to paste: `docs/store/listing.json`. Form answers: `docs/store/data-safety.md`.

**Android first** (Ayo, 2026-09-02). The iOS steps are marked and can wait for an Apple device.

---

## SUBMISSION RECORD: Android, versionCode 22, sent for review 2026-09-05

**Status: in review.** Five changes are with Google (production release 22 at full rollout,
content rating, target audience, privacy policy, data safety). Reviews are typically under
seven days. The store listing itself is ALREADY LIVE: listing copy and graphics on an app
that is already published do not go through review, so they went out the moment they were
saved, hours before the release did.

What shipped, so a later reader does not have to reconstruct it:

| | |
|---|---|
| Bundle | versionCode 22, 1.0.0, 84 MB, EAS build 2026-09-04 21:07 UTC |
| Rollout | Full, 100%, 177 countries. Staged rollout was considered and rejected: 5 installs makes a fraction meaningless |
| Listing | Name, both descriptions, icon, 5 phone and 5+5 tablet screenshots, all from `docs/store/listing.json` and `docs/store/screenshots/` |
| Feature graphic | LEFT AS THE OLD ONE, deliberately. It is dated but it is genuinely the church's logo, so replacing it is a brand decision rather than a correctness one |
| Review bypass | ARMED on production 2026-09-04 11:21 UTC, proven end to end on the device the same day |

**versionCode 21 does not exist on Play and never did.** It was built, converted to an APK,
installed over USB and tested, and then superseded when the placeholder icon was found. EAS
keeps its own counter (`appVersionSource: 'remote'`), so the numbering jumped 20 to 22 on
Play. Gaps are fine; Play only requires the number to increase.

### The follow-ups this submission created, in the order they come due

1. **TURN OFF THE REVIEW BYPASS AT APPROVAL + 7 DAYS.** Not at approval: Google re-checks
   apps without warning, and a reviewer meeting a dead sign-in is a flag. The procedure is
   section 1 of this runbook. It is a working key into a member account until it is done,
   which is why it is first on this list and why the runbook already calls it the step nobody
   remembers.

2. **Purge the review account's posts** at the same time. `03` keeps them out of every
   moderation queue so they can never reach the feed, but they should not sit in the table.
   The account is `Play Review`, `graceportalad@gmail.com`, profile created 2026-09-04 11:31
   UTC, role `member`.

3. **Prove the bypass is off** by attempting the old pair and being refused. An untested
   "off" is a belief, and this is the same discipline that caught the W4.5 erasure bug: every
   layer passed alone and the live path had never been driven.

### Known gaps, deliberately carried past launch

- **No OTA updates.** `expo-updates` is not installed, so every fix is a full store release
  with a review cycle, and `21` §8's "rollback = republish the previous update" cannot work as
  written. The `eas build` prompt offered to install it mid-build and was declined, correctly:
  it adds native code and would have invalidated the artefact already tested. **Decide this
  deliberately after launch rather than inside a build prompt.**
- **`eas submit` is not configured.** `eas.json` has `submit.production: {}` and there is no
  Google service-account key, so the 84 MB bundle was uploaded by hand through the browser.
  Every future release repeats that until a service account exists.
- **Content Ayo deferred until after release** (2026-09-04): Founding Members testimonies, the
  `daily_verses` queue, and sermon audio. The verse queue matters most: the app repeats the
  most recent verse rather than showing nothing, so a thin queue is invisible in review and
  obvious to a member three days later.
- **The store listing exists in en-US only.** `listing.json` carries reviewed DE, NL and FR
  copy that no Play listing uses yet, so a German member sees English on the store page and
  German in the app.
- **`apps/mobile/assets/expo.icon/`** is referenced by nothing since the iOS icon override was
  removed. Harmless, but worth deleting so nobody wonders why Expo's chevron is in the repo.

### Three warnings Play raised on the bundle, and why none was acted on

Recorded because they will appear again on the next release and the reasoning should not have
to be redone.

- **"No longer supports 26 devices."** They are Android TV and Car models. The install base was
  checked device by device before submitting: Pixel 10, Galaxy S22 Ultra, and unidentified
  phones. No TV, no car, nobody stranded.
- **"Significantly increases the size of APKs."** True and accepted. 84 MB against Grace
  Portal's much smaller build, and the direct consequence of the point below.
- **"No deobfuscation file."** Does not apply. `android/app/build.gradle:69` leaves
  `enableMinifyInReleaseBuilds` at false, and the AAB contains zero
  `com.android.tools.build.obfuscation` entries, so nothing is obfuscated and there is nothing
  to map. Play emits this warning whenever no mapping is attached and cannot tell the two cases
  apart. The 56 native debug-symbol files ARE present, which covers the crashes that would
  otherwise be unreadable.

---

## 0. Before anything is uploaded

- [ ] `pnpm store:check` passes (listing copy within every store's limits, and promising nothing
      `features.ts` still hides).
- [ ] The launch checklist blockers in `18` that are NOT engineering are closed, in particular
      **the website's legal pages are still drafts** (`legalEntity.reviewed` is false) and Play
      asks for a privacy-policy URL at submission.
- [ ] `daily_verses` has more than a fortnight queued in each language (`22` §2). The app repeats
      the most recent verse rather than showing nothing, so a thin queue is invisible in review
      and obvious to a member three days later.
- [ ] The deep-link file answers on the live site:
      ```
      curl -sI https://www.agbcglobal.com/.well-known/assetlinks.json
      ```
      Expect `200`, `content-type: application/json`, no redirect.

### The three things that need a name or a signature, not code

Each of these is short, and each is genuinely blocked on a person. They are listed together
because they are the only things standing between the work being finished and the app being
submittable.

1. **The French reviewer** (`22` §4 still says "name TBC"). No francophone branch exists, so
   there is no default person, and W4.6 rewrote 233 French strings that no native speaker has
   read. **What they receive is already prepared:** `docs/store/review-packet-fr.md`, generated
   from the app itself, with all 918 strings beside their English and the 72 legal and consent
   lines in the first table. German and Dutch packets exist too, for the readers `22` already
   names. Regenerate any of them with `node scripts/build-review-packet.mjs <de|nl|fr>`.

2. **The named data-protection contact** (`20` line 93: record the name in the project
   CLAUDE.md and in the privacy policy). **The route already exists and works**: the app's
   PRIVACY screen has "Contact us about my data", which opens the contact form, and the
   website's legal pages print the general inbox for data requests. What is missing is a
   person who owns answering them, which GDPR asks for and a store reviewer does not. Naming
   them is the whole task; nothing needs building.

3. **A solicitor reading the legal wording.** `legalEntity.reviewed` in `Desktop/agbc` is
   `false`, so privacy, terms and Impressum all carry a draft banner, and Play asks for a
   privacy-policy URL at submission. W4.8 filled the three facts that were public record
   (company number, registered office, directors, all from Companies House SC812955) and left
   this one alone, because it is a judgement about wording rather than a fact to look up. The
   fourth blank, whether the company is VAT registered, is also still open and is on no
   register.

---

## 1. The review account, and the window it lives in

`03` requires exactly one allowlisted address that accepts a fixed 6-digit code, **enabled in
production only from submission until approval + 7 days**. The reviewer types it into the normal
sign-in screen like any member; there is no special build and no hidden gesture.

### Turning it on

The values live in the password manager and are registered in
[`credentials.md`](./credentials.md), which asks for this window to be written up there BEFORE
it is switched on. Do that first; this section is the procedure, that one is the record.

Set three secrets on the production project (`agbc-production`, ref `mqvojrkotwwvwzsewybx`):

```
supabase secrets set --project-ref mqvojrkotwwvwzsewybx \
  REVIEW_BYPASS_ENABLED=true \
  REVIEW_EMAIL=<the address in the review notes> \
  REVIEW_CODE=<a FRESH 6-digit code for this window>
```

Then redeploy the function so it picks them up:

```
supabase functions deploy review-signin --project-ref mqvojrkotwwvwzsewybx
```

**A fresh code every window.** The keyspace is a million, deliberately, so the reviewer can type
it into the ordinary 6-digit box (`03`, decided 2026-07-26). What compensates is everything
around it: the flag is off outside the window, the endpoint is per-IP rate limited (429 with a
ten-minute `Retry-After`), every denial is identical so nothing can be enumerated, and a
**successful** mint raises a Sentry alert. Reusing last release's code throws that away.

### Proving it works BEFORE submitting

Do not submit and hope. From a device or curl, sign in with the review address and the code and
confirm you land as a member. Then check Sentry received
`review-signin: store-review bypass minted a session`. If that alert does not arrive, the
alerting path is broken and you will not know if the address is used later.

### Turning it off

**This is the step with a deadline, and the one nobody remembers.** Approval + 7 days:

```
supabase secrets unset --project-ref mqvojrkotwwvwzsewybx \
  REVIEW_BYPASS_ENABLED REVIEW_EMAIL REVIEW_CODE
supabase functions deploy review-signin --project-ref mqvojrkotwwvwzsewybx
```

Then confirm a sign-in attempt with the old code is refused. The flag alone is enough
(`enabled` is `REVIEW_BYPASS_ENABLED === 'true'`, and anything else means off), but unsetting
all three leaves nothing to be re-enabled by accident.

**Purge the review account's posts.** `03` says posts by the review account are excluded from
every moderation queue and can never be approved, so they cannot leak into the feed, but they
should not sit in the table either.

**Re-review happens without warning.** Both stores re-check apps after the fact. Re-opening the
window is this same section run again with a new code, which is why it is written down rather
than remembered.

---

## 2. Review notes to paste into the submission

> AGBC Global is the app for Amazing Grace Bible Church, a church with branches in Glasgow
> (Scotland), Berlin (Germany), Emmen (Netherlands) and Ogbomosho (Nigeria).
>
> MOST OF THE APP NEEDS NO ACCOUNT. You can browse messages, watch and listen to sermons, find a
> branch, see service times, read the verse of the day and view events without signing in.
>
> TO REVIEW THE SIGNED-IN FEATURES, use this account:
>   Email: <review address>
>   Code:  <6-digit code>
> Enter the email on the sign-in screen, tap "Send code", then type the code above. No email is
> actually sent to this address and the code does not change.
>
> SIGNING IN NORMALLY uses a one-time code emailed to the address you enter. There are no
> passwords.
>
> USER-GENERATED CONTENT IS MODERATED BEFORE PUBLICATION. Testimonies and prayer requests posted
> from the review account will show as "pending" and will not appear in the public feed: that is
> the correct behaviour, not a bug. Every post is read by a branch leader first. Members can
> report any post and block any member from the post's own menu, and blocked members are listed
> in Settings.
>
> SERMON VIDEO plays through YouTube's embedded player. Audio-only playback uses the church's own
> MP3 files and continues in the background, which is why the app declares a media-playback
> foreground service.
>
> GIVING does not take payments in the app. It displays the church's bank details and opens the
> church website in a browser for card giving.
>
> ACCOUNT DELETION is in Settings > Privacy > Delete account, and is also available without the
> app at https://www.agbcglobal.com/delete-account
>
> The app is available in English, German, Dutch and French; the language can be changed in
> Settings.

Fill the two placeholders from the secrets set in section 1. **Do not paste the code anywhere
else**, and note that the address is not a secret (it is allowlisted, and `03` deliberately keeps
it out of logs for the opposite reason: it belongs to a real person).

---

## 3. Play: the upload

- [ ] **Assign the Google Service Account Key for Play Store submissions in EAS.**
      `credentials.md` records it as still unassigned and explicitly as W4.8's. Without it
      `eas submit` cannot talk to the Play Console, and it is discovered at the moment you try.
- [ ] **Give the PRODUCTION EAS environment its Supabase values.** Only `preview` carries
      `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` today (Track P Phase 4); the
      production environment was deliberately left until the store build, which is this one.
      Both are public identifiers. A production build without them reaches no backend at all.
- [ ] Build the AAB with EAS, signed by the **existing upload keystore** in EAS credentials.
      Never let EAS generate a new one (`19`).
- [ ] `versionCode` is above 19. It is 20 in `app.config.js` today; the next release increments.
- [ ] Store listing per locale from `docs/store/listing.json` (en-GB, de-DE, nl-NL, fr-FR).
- [ ] Data safety form from `docs/store/data-safety.md`, including the deletion URL.
- [ ] Age rating questionnaire from the same sheet.
- [ ] App content: declare the **media playback foreground service** (`18` already carries this).
- [ ] Screenshots per locale: phone, 7" tablet, 10" tablet.
      **From an EAS preview or production build, never the dev client.** A dev
      build wears expo-dev-client's floating gear over every screen and points at
      the local database, so its content is seed data. `bash
      scripts/capture-store-screenshots.sh` does the matrix either way; run it
      against the release build once the launch content exists, because a Family
      feed captured against production today is empty (`22` §2 and §3).
- [ ] Release notes: the Grace Portal transition copy from `listing.json`, not "bug fixes".
- [ ] **Pre-launch report is a release gate** (`21` §8). Read it before promoting.

## 3b. iOS, when there is a device (deferred)

Same listing and answers, plus: the AASA file needs the Apple Team ID before universal links
work (`Desktop/agbc` docs/SPEC-app-links.md), `APP_STORE_URL` in `apps/mobile/src/lib/links.ts`
is still a search URL and wants the numeric App Store id, and `18` carries the iOS E2E as owed.

---

## 4. Staged rollout, and when to stop

From `21` §8, unchanged, restated here so the halt criteria are in the same place as the button:

**Play:** 10% > 25% > 50% > 100% over about 7 days. **iOS:** phased release, which is pausable.

**Halt, fix, and ship a higher version if any of these is true:**

- crash-free sessions below **99.5%**
- ANR above **0.5%** (the Play vitals threshold)
- a collapse in OTP sign-in success
- **any** moderation or data-integrity bug

"Halt" means stop the rollout, not "watch it". A moderation bug on a moderation-first app is the
one that damages people rather than the numbers.

**Raise `minimum_supported_version` per platform, and only once THAT store shows the build
live** (`21` §8). Raising Android's floor while iOS is still in review hard-blocks every iOS
member behind a screen telling them to install a build the App Store will not give them.

---

## 5. After approval

- [ ] Turn the review bypass **off** (section 1) and diary it for approval + 7 days.
- [ ] Purge the review account's posts.
- [ ] Retire the OneSignal app that Grace Portal used, and remove its keys from `agbc-app`'s CI
      secrets (`19`).
- [ ] Update `18`'s launch checklist and `19`'s checklist with what actually happened.
