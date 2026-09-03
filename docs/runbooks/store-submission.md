# Runbook: submitting AGBC Global to the stores

**W4.8. Refs:** `19` (store identity, release copy), `03` §Security (the review bypass),
`21` §8 (release engineering, staged rollout, halt criteria), `18` (launch checklist).
Copy to paste: `docs/store/listing.json`. Form answers: `docs/store/data-safety.md`.

**Android first** (Ayo, 2026-09-02). The iOS steps are marked and can wait for an Apple device.

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
