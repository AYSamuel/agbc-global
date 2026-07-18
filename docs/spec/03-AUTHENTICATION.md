# 03 · Authentication & Account Gates

## Principle: guest-first, contribute-to-join

The app is **fully browsable without an account.** An account is only required to *contribute or personalize*. This keeps the visitor front-door open while giving members a reason to sign in.

## Auth method: email-OTP (typed code, no passwords)

**Decision (2026-07-18, supersedes the phone-OTP decision of 2026-07-12): email address + one-time code (OTP), delivered by email.** The member types the 6-digit code from the email into the app: no magic links, no passwords.

### Why email-OTP (and why the change)
- **Cost.** Phone OTP required the full Twilio cluster: a paid account, per-code fees, Meta business verification for the WhatsApp channel, and NCC sender-ID registration for Nigeria. Email OTP runs on the Resend free tier the church website already uses: zero cost at church scale.
- **Nigeria reliability.** SMS to Nigerian numbers is unreliable (DND filtering silently swallows OTP SMS). Email has no DND problem; to NG it is MORE reliable than SMS, not less.
- **Universality with a known trade-off.** Every smartphone member has an email account (their app store requires one), but some rarely check it and OTP mail can land in spam. Mitigations: SPF + DKIM on the sending domain, the code repeated in the subject line, a check-spam hint on `AUTH-2`, and support copy after repeated failures.
- No password reset flows, no credential leaks.
- Supported natively by Supabase Auth: email OTP with `{{ .Token }}` in the template, so the email carries the code itself, never a magic link.
- Removes two multi-week external fuses (Meta business verification, NCC registration) from the launch critical path. Meta verification remains a prerequisite for Phase 3 WhatsApp broadcasts ONLY (`15`, `24`).
- **Reversible.** Phone/WhatsApp OTP can be added post-v1 as a second sign-in method without members losing accounts (Supabase supports linking a phone identity to an existing user).

### Delivery
- **Production/preview:** Resend wired as Supabase Auth custom SMTP on the church domain, SPF + DKIM aligned and DMARC at enforcement (`20`/`21`; auth now depends on deliverability, so domain email posture is a launch item, not polish). Supabase's built-in sender is 2 emails/hour, dev-only: never ship on it.
- **Local dev:** `supabase start` captures all auth emails in the local Mailpit inbox; no SMTP setup needed for the daily loop.
- **Template:** church-branded, plain HTML, the 6-digit code large in the body AND in the subject line; localized to the user's chosen language (EN/DE/NL/FR).
- **Volume:** Resend free tier is 3,000 emails/month, 100/day; sessions are long-lived (below) so OTP volume is low. Usage alert + upgrade trigger live in `21` §9.

### Optional secondary (post-v1)
- Phone/WhatsApp OTP (the original plan) when finances allow: added as a second identity, no account migration.
- Apple Sign In (required by App Store *if* you offer other social logins: with email-OTP-only you're compliant), Google Sign In. Not needed for v1.

## The OTP flow (screens: `AUTH-1` … `AUTH-4`)

1. **`AUTH-1` Sign-in prompt**: reached from any gated action or Settings. Explains why ("Join the family to post, react, RSVP, and track your rhythm"). Field: email address (email keyboard, OS autofill enabled). Buttons: **Send code**, **Not now** (returns to prior screen as guest).
2. **`AUTH-2` Enter code**: 6-digit typed input (`autocomplete="one-time-code"` so OS code suggestions work where the platform offers them), resend timer (30s), sent-to indicator with the address partially masked ("Sent to a•••@gmail.com"), a **check your spam folder** hint appearing after ~20s, **Change email** link. Errors: invalid code, expired code, too many attempts (rate-limited).
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
| **"I will pray"** commit (then "I prayed") | ❌ gate | ✅ | ✅ | ✅ |
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

- OTP rate-limiting (per email address + per device + per IP), attempt lockout, code expiry (~10 min). Resend timer is UX; the security limits are server-side. ALL auth email goes via the custom SMTP provider (`20`/`21`), never Supabase's dev-only default sender. The identity email is verified by definition, so the Payhip restore-purchase flow (`14`) needs no separate email-verification step.
- **Email abuse controls:** send-rate caps per address and per IP (Supabase Auth rate limits) so the sign-in form cannot be used to bomb an inbox or burn the send quota; the send-code response is identical whether the address is new or existing (no account enumeration); a Resend monthly-volume alert (`21` §9) so a spike pages someone instead of silently exhausting the free tier; if abuse appears, Supabase Auth's Turnstile captcha switches on for OTP sends (the web deletion page already uses Turnstile, `16`). (The SMS toll-fraud surface of the phone-OTP design disappears with the channel.)
- All writes validated server-side (RLS + edge-function checks): never trust client role claims.
- User-generated content is **`pending` → leader-approved** before public (moderation is the anti-abuse backbone; see `09`/`17`).
- Report + block flows for testimonies/prayers.
- Account deletion (see `16`) is a first-class, self-service flow (App Store requirement).
- **Store-review bypass (hardened):** exactly one allowlisted review email address accepts a long random fixed code, checked server-side only. The test account is pinned to `role='member'`; its posts are born `pending` like any member's (so the reviewer sees the honest "a leader will review this" flow, the correct demo for a moderation-first app), are **excluded from all moderation queues and can never be approved** (the moderation UPDATE policy refuses rows authored by the review account), and are purged when the flag turns off. Flag is per environment: **enabled on dev/preview** (the nightly E2E suite signs in with it, no alerting) and **disabled in production** except from submission until approval + 7 days; every production use is logged and alerts. Runbook note: Apple/Google re-review apps unprompted (post-OTA checks, complaints), so re-enabling on a re-review request is a documented one-step action. Documented in the review notes at submission (see `18`).

## Edge cases (must handle)

- **No code received** → resend after timer; the `AUTH-2` spam-folder hint; fall back to "try a different email"; support email surfaced after 2 failures.
- **Total OTP outage (email provider down):** `AUTH-2` shows "Codes aren't being delivered right now: please try again in a little while." Existing sessions are unaffected (silent refresh does not involve OTP); guests browse as always. Detection: the ministry-wide OTP alarm in `21` §6.
- **Email changed / lost** → re-auth with the new address creates/needs re-link; v1: new email = new profile (document limitation), admin can merge on request.
- **Airplane/offline during OTP** → clear error, retry.
- **Guest hits gate repeatedly** → don't nag; gate sheet is dismissible and remembers "Not now" for the session for that action type.
- **Deleted account signs in again** → treated as new profile (prior content already anonymized/removed per `16`).
