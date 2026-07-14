# 03 · Authentication & Account Gates

## Principle: guest-first, contribute-to-join

The app is **fully browsable without an account.** An account is only required to *contribute or personalize*. This keeps the visitor front-door open while giving members a reason to sign in.

## Auth method: phone-OTP-first (WhatsApp delivery first, SMS fallback)

**Decision: phone number + one-time code (OTP), delivered via WhatsApp first with SMS as fallback.** No passwords.

### Why phone-OTP
- The membership skews toward a **diaspora / mobile-first, WhatsApp-native** audience where phone numbers are the universal identity and passwords are friction.
- Ties naturally into the **WhatsApp** channel (same number).
- No password reset flows, no credential leaks.
- Supported by Supabase Auth (phone provider) → **Twilio Verify**, which delivers over WhatsApp and SMS.

### Why WhatsApp-first delivery (decision 2026-07-12)
- SMS to Nigerian numbers is unreliable (DND filtering silently swallows OTP SMS) and costs a multiple of the usual estimate; Ogbomosho is a core branch and diaspora members sign up with mixed numbers.
- The audience is WhatsApp-native: a WhatsApp code is both more reliable and cheaper.
- Per attempt: try WhatsApp first; the user can switch to SMS (and back) from `AUTH-2`. Delivery failures fall through to the other channel automatically where the provider reports them.
- Setup note: the WhatsApp Verify channel requires a Meta business setup and template approval; do this early (it has lead time), and register SMS sender IDs for NG/DE per current provider rules.

### Optional secondary (post-v1)
- Apple Sign In (required by App Store *if* you offer other social logins: with phone-only you're compliant), Google Sign In. Not needed for v1.

## The OTP flow (screens: `AUTH-1` … `AUTH-4`)

1. **`AUTH-1` Sign-in prompt**: reached from any gated action or Settings. Explains why ("Join the family to post, react, RSVP, and track your rhythm"). Fields: country code + phone. Buttons: **Send code**, **Not now** (returns to prior screen as guest).
2. **`AUTH-2` Enter code**: 6-digit input, auto-read on Android, resend timer (30s), channel indicator ("Sent via WhatsApp"), **Send by SMS instead** link (or "by WhatsApp instead" when SMS was used), **Change number** link. Errors: invalid code, expired code, too many attempts (rate-limited).
3. **`AUTH-3` Complete profile** (first sign-in only): display name, pick **home branch** (pre-filled from onboarding choice), confirm **language**, optional avatar, and a 16+ age confirmation (see `20-PRIVACY-COMPLIANCE.md`). Button: **Enter**.
4. **`AUTH-4` Success** → returns the user to **the exact action they were attempting** (see "gate return" below), or Home if they came from Settings.

Returning users skip `AUTH-3`. "First sign-in" has a concrete marker: `profiles.onboarded_at` is set only when `AUTH-3` completes (with `age_confirmed_at` in the same update); a session whose profile has `onboarded_at IS NULL` (the app was killed mid-flow) is routed straight back to `AUTH-3` on next launch, and write policies require it (`02`), so a half-created profile can never post, react, RSVP, or track attendance.

## Guest vs Member: capability matrix

| Capability | Guest | Member | Leader | Admin |
|-----------|:-----:|:------:|:------:|:-----:|
| Browse Home, daily verse | ✅ | ✅ | ✅ | ✅ |
| Watch sermons, live, audio | ✅ | ✅ | ✅ | ✅ |
| Resume playback / save to My List / notes | ❌ gate | ✅ | ✅ | ✅ |
| Read testimonies & prayers | ✅ | ✅ | ✅ | ✅ |
| **Glory to God** reaction | ❌ gate | ✅ | ✅ | ✅ |
| **"I prayed"** tap | ❌ gate | ✅ | ✅ | ✅ |
| Post testimony / prayer | ❌ gate | ✅ (→ pending) | ✅ | ✅ |
| Mark prayer answered → testimony | ❌ | ✅ (own) | ✅ | ✅ |
| Attendance "I'm here" / streak / milestones | ❌ gate | ✅ | ✅ | ✅ |
| Devotional plan progress | ❌ gate | ✅ entitled owners (others → devotional `BOOK-DETAIL`, see `10`) | ✅ | ✅ |
| RSVP to events | ❌ gate | ✅ | ✅ | ✅ |
| Register for a course | ❌ gate | ✅ | ✅ | ✅ |
| Give (link-out to web) | ✅ (web) | ✅ (web) | ✅ | ✅ |
| Buy a book (web) / read owned book | ✅ buy / ❌ library | ✅ | ✅ | ✅ |
| Moderate testimonies/prayers/reports | ❌ | ❌ | ✅ (own branch) | ✅ |
| Broadcast (push/WhatsApp) | ❌ | ❌ | ✅ (branch) | ✅ (ministry) |
| Manage branches / roles / global content | ❌ | ❌ | ❌ | ✅ |

> Giving links out to the web, which needs no account: so **guests can give.** This is intentional (lowest friction for generosity + avoids App Store cut in v1; see `12`).

## The account gate (`GATE`)

Any ❌-gate action triggers a lightweight **gate sheet** (bottom sheet, not a full screen), so the user never loses context:

- Title framed to the action: e.g. *"Sign in to say Glory to God"*, *"Sign in to RSVP"*, *"Sign in to track your rhythm."*
- One line of benefit copy.
- **Sign in** (→ `AUTH-1`) · **Not now** (dismiss, stay guest).
- **Gate return:** the app **remembers the pending action** and, after successful auth, **performs it automatically** (adds the Glory reaction, opens the RSVP, resumes the post draft). No dead ends, no "now do it again."
- **Gate-return security rule:** the pending action lives only in in-memory session state and replays only actions the user explicitly initiated in the current session. It is never encoded in, or reconstructable from, a deep link: deep links NAVIGATE only (open a screen in a read/confirm state); any write still requires an explicit tap after landing. Incoming deep-link routes are validated against an allowlist; unknown or write-carrying links fall back to Home.
- **Pending-action lifetime:** the pending gate-return action is cleared whenever the `GATE` sheet closes for any reason other than tapping Sign in (dismissal, deep-link or notification navigation, app backgrounded longer than 5 minutes). A sign-in NOT initiated from a gate (e.g. from Settings an hour later) replays nothing.

## Sessions

- Session storage: Supabase client `auth.storage` = the **LargeSecureStore adapter** per Supabase's Expo guide (AES-256 key held in `expo-secure-store`, AES-encrypted session in AsyncStorage). Reason: a Supabase session object routinely exceeds SecureStore's documented 2048-byte per-value limit. Never raw AsyncStorage, never the whole session in SecureStore.
- Silent refresh; session persists across launches.
- **Refresh-failure transition:** if silent refresh fails with a PERMANENT auth error (invalid/expired/revoked token, never a network error): transition to guest in place; keep guest-browsable caches; clear personal caches and the offline write queue; delete this device's `devices` row (best-effort, else mark the token stale locally so registration re-runs at next sign-in); show a non-blocking "You've been signed out, please sign in again" banner. The next gated action opens `GATE` as usual. If the account was DELETED (a write is rejected for a deleted profile, `02`): same transition, banner reads "This account no longer exists."
- **Sign out** (Settings) clears tokens + local caches of personal data (keeps guest-browsable caches).
- **Multi-device:** allowed; each device registers a push token (`devices` table).

## Roles & how they're assigned

- Default new profile = **member**.
- **leader** / **admin** are assigned by an admin in the **web dashboard** (see `17`), never self-selected in the app.
- The app reads `profiles.role` to reveal leader tools (a "Leader" section in More); RLS enforces it server-side regardless of client.

## Security & abuse controls

- OTP rate-limiting (per number + per device + per IP, on BOTH channels including the SMS fallback), attempt lockout, code expiry (~10 min). Resend timer is UX; the security limits are server-side. The optional email-verification OTP (`profiles.email`, see `02`/`14`) gets the same rate limits, sent via the custom SMTP provider (`20`/`21`), never Supabase's dev-only default sender.
- **Toll-fraud (SMS pumping) controls:** Twilio Verify **Fraud Guard stays ON**; **Verify Geo Permissions** allowlist only the countries members actually sign up from (UK, DE, NL, NG + confirmed diaspora countries); Twilio monthly spend alert + hard cap so a fraud spike pages someone instead of running a bill; optionally reject VoIP/disposable line types via Twilio Lookup at sign-up. (The NG corridor is a documented SMS-pumping target.)
- All writes validated server-side (RLS + edge-function checks): never trust client role claims.
- User-generated content is **`pending` → leader-approved** before public (moderation is the anti-abuse backbone; see `09`/`17`).
- Report + block flows for testimonies/prayers.
- Account deletion (see `16`) is a first-class, self-service flow (App Store requirement).
- **Store-review bypass (hardened):** exactly one allowlisted phone number accepts a long random fixed code, checked server-side only. The test account is pinned to `role='member'`; its posts are born `pending` like any member's (so the reviewer sees the honest "a leader will review this" flow, the correct demo for a moderation-first app), are **excluded from all moderation queues and can never be approved** (the moderation UPDATE policy refuses rows authored by the review account), and are purged when the flag turns off. Flag is per environment: **enabled on dev/preview** (the nightly E2E suite signs in with it, no alerting) and **disabled in production** except from submission until approval + 7 days; every production use is logged and alerts. Runbook note: Apple/Google re-review apps unprompted (post-OTA checks, complaints), so re-enabling on a re-review request is a documented one-step action. Documented in the review notes at submission (see `18`).

## Edge cases (must handle)

- **No code received** → resend after timer; switch channel (WhatsApp ⇄ SMS); fall back to "try a different number"; support email surfaced after 2 failures.
- **Total OTP outage (both channels down):** `AUTH-2` shows "Codes aren't being delivered right now: please try again in a little while." Existing sessions are unaffected (silent refresh does not involve OTP); guests browse as always. Detection: the ministry-wide OTP alarm in `21` §6.
- **Number changed / lost** → re-auth with new number creates/needs re-link; v1: new number = new profile (document limitation), admin can merge on request.
- **Airplane/offline during OTP** → clear error, retry.
- **Guest hits gate repeatedly** → don't nag; gate sheet is dismissible and remembers "Not now" for the session for that action type.
- **Deleted account signs in again** → treated as new profile (prior content already anonymized/removed per `16`).
