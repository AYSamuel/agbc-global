# Store answer sheets: Play Data safety, Apple privacy labels, IARC age rating

**W4.8. Refs:** `20` (lawful bases, processors, what is collected), `19` (age rating guidance),
`03` (auth), `09` (UGC), `15` (push).

Both stores ask the same questions in different words, and both punish a wrong answer harder
than a conservative one: a data-safety declaration that does not match observed behaviour is a
policy enforcement matter, not a listing correction.

## How these answers were derived

**From the code, not from `20`'s prose.** `20` is engineering guidance written ahead of the
build; the app is what actually runs. Same discipline the PRIVACY screen's bullets were held to
at W4.6, where three of the approved frame's claims turned out to be untrue of the app.

Every table and routine the app writes, enumerated from `apps/mobile`:

| Written | What it holds |
|---|---|
| `profiles` | name, branch, language (email lives in Supabase Auth) |
| `testimonies`, `prayers` | the member's own words, plus the path of a photo they attached |
| `glory_reactions`, `prayer_intercessions` | who reacted, who committed to pray and who prayed |
| `record_attendance()` | check-ins ("I'm here") |
| `rsvps`, `course_interest` | going / interested, and interest in a course |
| `sermon_notes`, `saved_items`, `playback_positions` | private notes, saved messages, resume points |
| `devices` | the Expo push token for this device |
| `notification_prefs`, `notifications` | which notifications are wanted, and read state |
| `reports`, `blocked_users` | safety actions |
| `branch_change_requests` | a request to move branch |
| `testimony-photos` bucket | the photo itself |
| `delete_my_account()` | erases the above |

**What the app does NOT write, and it matters for both forms:**

- **No payment data.** `donations` and `course_registrations` are written by the WEBSITE's Stripe
  webhook, never by the app (ADR 0017, ADR 0023). The app's Give tab displays bank details and
  opens the church website in a browser for card giving; nothing is typed into the app.
- **No location.** No `expo-location`, and the declared Android permissions are only
  `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, all for
  background sermon audio.
- **No camera, contacts or microphone.** `expo-image-picker` is used for the LIBRARY only
  (`launchImageLibraryAsync`; there is no `launchCameraAsync` call anywhere).
- **No phone number, ever** (ADR 0014 removed the only thing that wanted one).
- **No calendar data.** `expo-calendar` reads the list of calendars solely to find a writable
  one and then writes an event. It never reads events, and the list never leaves the device.

---

## Google Play: Data safety

### Data collected and shared

"Shared" in Play's sense means transferred to a third party. Our processors (`20`) are
**not** "sharing": Supabase, Expo, PostHog and Sentry act on our instructions under DPAs, which
Play treats as processing rather than sharing. So every row below is **collected, not shared**.

| Play category | Type | Collected | Required? | Purpose | Notes |
|---|---|---|---|---|---|
| Personal info | Name | Yes | **Required** | App functionality | On the profile. REQUIRED, not optional: `authProfileSchema` in `packages/shared/src/contracts/auth.ts` is `displayName: z.string().trim().min(1)`, so sign-up cannot complete without one. This row said "Optional" until 2026-09-04, when entering the declaration forced the question and the schema settled it |
| Personal info | Email address | Yes | Required | App functionality, Account management | The only sign-in credential (`03`, email OTP) |
| Personal info | User IDs | Yes | Required | App functionality | The Supabase auth id |
| Personal info | **Political or religious beliefs** | **Yes** | Optional | App functionality | See the first judgement call below |
| Personal info | Address, phone number, race, sexual orientation, other | No | | | Never asked for |
| Financial info | any | **No** | | | Giving opens the website; nothing is entered in the app |
| Health and fitness | any | No | | | See the second judgement call below |
| Messages | any | No | | | No in-app messaging, DMs or email sending between members |
| Photos and videos | Photos | Yes | Optional | App functionality | Only a photo attached to a testimony |
| Audio files | any | No | | | The app plays audio; it records none |
| Files and docs | any | No | | | |
| Calendar | any | **No** | | | Write-only, see above |
| Contacts | any | No | | | |
| App activity | Other user-generated content | Yes | Optional | App functionality | Testimonies, prayer requests, sermon notes |
| App activity | App interactions | Yes | **Optional** | Analytics | PostHog, opt-IN, off until the member says yes (ADR 0020) |
| App activity | Other actions | Yes | Optional | App functionality | Check-ins, reactions, RSVPs, saves, resume points |
| App activity | In-app search history | **No** | | | The last 8 Watch search terms ARE kept, in `AsyncStorage` on the device only (`features/watch/searchHistory.ts`), and never sent anywhere. Both stores ask about data COLLECTED, meaning transmitted off the device, so this is a no. It is listed rather than omitted because "no search history" would be wrong and somebody will read the code |
| Web browsing | any | No | | | |
| App info and performance | Crash logs | Yes | Required | App functionality (diagnostics) | Sentry, scrubbed, NOT consent-gated (`20`) |
| App info and performance | Diagnostics | Yes | Required | App functionality | Same |
| Device or other IDs | Device or other IDs | Yes | Optional | App functionality (notifications), Analytics | The Expo push token, and PostHog's device id once analytics is accepted |

### Security practices

| Question | Answer | Evidence |
|---|---|---|
| Data encrypted in transit | **Yes** | HTTPS to Supabase and every processor; no cleartext endpoint |
| Users can request data deletion | **Yes** | In-app: Settings > Privacy > Delete account (`16`). Also on the web at `https://www.agbcglobal.com/delete-account` for somebody who no longer has the app, which is the URL to give Play |
| Committed to the Play Families policy | Not applicable | Accounts are 16+ (`20`) and the app is not directed at children |
| Independent security review | No | |

### Data deletion URL

`https://www.agbcglobal.com/delete-account` (live and proven end to end against production on
2026-09-02).

---

## Apple: privacy nutrition labels

Apple's model is "Data Used to Track You" / "Data Linked to You" / "Data Not Linked to You".

**Data Used to Track You: NONE.** Nothing is shared with a data broker, and no identifier is
used to follow a member across apps or websites. Analytics never calls `identify()` and carries
no member id (ADR 0020), so no App Tracking Transparency prompt is needed.

**Data Linked to You**

| Category | Types |
|---|---|
| Contact Info | Email Address, Name |
| User Content | Photos, Other User Content (testimonies, prayer requests, notes) |
| Identifiers | User ID |
| Usage Data | Product Interaction (only once analytics is accepted) |
| Sensitive Info | Religious beliefs, for the same reason as Play below |
| Diagnostics | Crash Data, Performance Data |

**Data Not Linked to You:** none that is not already listed above. Crash reports are scrubbed of
the user record but are reported here as linked, because that is the conservative reading and
the reports are tied to a session that belongs to somebody.

---

## IARC age rating (Play) and Apple age rating

Answered consistently with `19` and with what the app actually does.

| Question | Answer | Why |
|---|---|---|
| Violence, sexual content, profanity, drugs, gambling | None | |
| Does the app contain user-generated content? | **Yes** | Testimonies and prayer requests (`09`) |
| Is UGC moderated? | **Yes, before publication** | Nothing appears in the feed until a branch leader approves it. Proven by the W2 exit audit: publish-bypass attempts are refused at the app AND the RLS layer |
| Can users report content? | **Yes** | Report on every post, with reasons (`09`) |
| Can users block other users? | **Yes** | Block from a post's actions; Settings lists blocked members |
| Can users interact or exchange content? | Yes, publicly and asynchronously | No private messaging, no DMs, no live chat |
| Does the app share user location with other users? | **No** | The Family map plots BRANCHES and the testimonies that came from them, at city level, never a member's device location |
| Unrestricted web access? | **No** | Outbound links open a browser to the church's own site, YouTube, or a payment page. There is no in-app browser field a member can type any URL into |
| Minimum age for an account | **16** | `20`. A required self-declaration at sign-up: the profile step will not submit until the member ticks "I am 16 or over" (`auth:agePrompt` / `auth:ageInvalid`). It is a declaration rather than a verified age, which is the normal answer to this question and the honest one to give |
| Does the app offer purchases? | Not in v1 | The bookstore is deferred (`18`), and giving opens the website |

**Expected outcome:** Play/IARC around PEGI 3 to 7 / ESRB Everyone with a "users interact"
descriptor; Apple 12+ or 17+ depending on how the UGC questions are scored. The moderation and
reporting answers are the ones that keep it low; answer them accurately rather than
optimistically.

---

## Three judgement calls, flagged rather than buried

**1. Religious beliefs are declared as collected.** Play files this under Personal info as
"Political or religious beliefs" and Apple under Sensitive Info. It is tempting to say no, on
the grounds that the app never asks "what do you believe". But a member's branch, their
check-ins and above all their testimonies reveal religious belief, and `20` already treats this
as **special-category data under GDPR Art. 9**, with explicit consent captured at the compose
step. Declaring it to the stores is the same fact told to a different regulator. Saying no here
while saying yes in the privacy notice is the kind of contradiction that is easy for anyone to
find and expensive to explain.

**2. Health data is declared as NOT collected, and that is a narrower claim than it looks.**
`20` notes that healing testimonies add health data. The app has no health data TYPE: no field
asks about health, nothing is parsed out of a testimony, and nothing is passed to a health
processor. What exists is free text a member chose to write, which both stores classify as
user-generated content, and that IS declared. Declaring a "Health and fitness" collection would
imply a structured health dataset the app does not have.

**3. The YouTube embed.** Sermons play in `react-native-youtube-iframe`, a WebView around
YouTube's embedded player, so Google receives playback requests from the member's device. It is
not an SDK collecting on our behalf and we pass it no member data, but a reviewer can observe
the traffic. **Recommendation: mention it in the review notes rather than declaring a data type
for it**, since we neither collect nor receive anything from it, and check the answer again if
the player ever moves to a first-party SDK. Flagged because it is arguable, and Ayo signs the
declaration.

---

## Before submitting

- [ ] Re-run this sheet against the code if any release adds a table, a permission or a
      processor. The enumeration at the top is the check: it took one command and it is the only
      thing that makes these answers evidence rather than recollection.
- [ ] The deletion URL is reachable and the flow works (last proven 2026-09-02).
- [ ] `20`'s processor list matches what the app actually talks to.

## What the console held before this sheet was entered (2026-09-04)

The answers above were entered into Play for the first time on 2026-09-04, replacing Grace
Portal's from Jan 2026. Six of them were not merely stale but **untrue of this app**, and they
are recorded here because the shape of the error is the lesson, not the individual values:

| Declared | Reality |
|---|---|
| Approximate location collected | No location code exists in the app at all |
| Phone number collected | ADR 0014 removed the only thing that ever wanted one |
| Account creation by username and password | Email OTP; there is no password anywhere |
| Delete-account URL `agbc-web.vercel.app/data-deletion` | Dead host; ours is `www.agbcglobal.com/delete-account` |
| Privacy policy `agbc-web.vercel.app/privacy-policy` | Same dead host |
| "User data is automatically deleted within 90 days" | Nothing auto-deletes at 90 days |

**The one that could not be seen from the listing** is the sharpest. Name, Email address and
Device IDs were each declared "processed ephemerally", and Play does not show ephemeral data on
the public listing. So the store page told users the app collected neither their name nor their
email, while both are stored indefinitely. An answer that HIDES a disclosure is worse than one
that states it wrongly, because the store page looks clean and there is nothing to notice.

**And the app was declared as targeting children** (age groups 9-12 and 13-15 ticked), which put
it under the Play Families Policy and printed a "Committed to follow the Play Families Policy"
badge on a listing for an app whose sign-up refuses to submit without an "I am 16 or over" tick.
Corrected to 16-17 plus 18-and-over, at which point Play dropped the extra Families steps by
itself.

**The check that would have caught all of this** is the enumeration at the top of this file, run
against the console rather than against memory. None of it was visible from inside the repo.
