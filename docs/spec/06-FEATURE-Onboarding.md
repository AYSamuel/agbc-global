# 06 · Feature: Onboarding

## Purpose
Get a first-time user oriented and personalized in under a minute, **without an account**. Capture the two things that shape the whole app experience: **home branch** and **language**. Notification permission is deliberately NOT requested here (see below): a prompt before the app has shown any value is routinely denied, and iOS never re-prompts.

## User stories
- As a visitor, I can start using the app immediately without signing up.
- As a member, the app knows my branch and language from the first screen.
- As anyone, I understand what the app is before I'm asked for anything.

## Screens & flow
`SPLASH → ONB-1 Welcome → ONB-2 Language → ONB-3 Branch → HOME`
(See `04-NAVIGATION-MAP.md` for the full graph. Language comes FIRST, decision
2026-07-20: choosing it up front means the branch step, and everything after,
already reads in the user's language.)

### `SPLASH`
- Logo lockup + "One family · many nations · one amazing grace."
- Auto-advances after ~1.2s. First launch → `ONB-1`; returning → `HOME` (restores saved branch/language/theme).

### `ONB-1` Welcome
- Short value statement (belonging / family across nations). Photo background.
- **[Get started]** → `ONB-2`.
- **[I'm just looking]** → `HOME` as guest with default branch = HQ (Glasgow).

### `ONB-2` Language
- English · Deutsch · Nederlands · Français (from supported UI locales).
- Preselect from device locale if it matches; else English.
- Applies UI language immediately (the rest of onboarding renders localized).
- **[Continue]** → `ONB-3`.

### `ONB-3` Pick your branch
- List of branches from `branches` table (name, city, country; HQ badge on Glasgow).
- **Never a loading wait** (decision 2026-07-20): the bundled snapshot paints the list instantly while the fetch resolves (same ids as the seed, so the server result swaps in without disturbing a selection); the offline notice appears only when the fetch actually fails.
- Single select → **[Continue]** → `HOME`.
- Copy: "Which family are you part of? You can change this anytime."
- Default preselect: none (force a conscious choice), but Continue enabled only after select. Optional "Not sure yet" → HQ.

### Notification permission: in context, not in onboarding
The OS notification prompt never appears during onboarding. It is triggered at the first value moment instead:
- first **"I'm here"** or first **RSVP** ("Want a reminder before service / this event?"),
- turning on any toggle in Settings → Notifications,
- right after first sign-in, framed around member activity (see `15`).

A short pre-permission sheet explains the value BEFORE the OS dialog fires (the OS prompt is one-shot on iOS; never waste it). Declining degrades gracefully: the action itself still completes, and Settings shows how to enable later.

## Data
- Local persist (no account yet): `branch_id`, `language`, `theme_pref` default `system`.
- On later sign-in, these seed `AUTH-3` profile creation.
- Push tokens are registered only for signed-in members, after an in-context permission grant (v1 push is member-oriented, see `15`). No token work happens during onboarding.

## States / edge cases
- **Skip everything:** "I'm just looking" → guest Home, HQ branch, device language, no push. Fully functional browse.
- **Permission denied (whenever asked in context):** the triggering action still completes (the RSVP records, attendance counts); Settings shows "Notifications off: enable in system settings."
- **First launch offline (no cache exists yet):** `ONB-3` needs branches from the backend; ship a bundled read-only branch snapshot (the same versioned seed data) as fallback, refreshed and reconciled on next connectivity. The server stays authoritative; the bundle is a stale-tolerant day-one cache. Same treatment for one evergreen daily verse. (Online, the list is already warmed at launch: see the prefetch inventory, `01` §9.)
- **Returning user, branch removed:** if saved branch no longer exists, fall back to HQ + toast.
- **Re-run onboarding:** available via Settings ("Change branch/language"): not forced again.

## Permissions
- No auth required. Everything here is guest-level.

## Acceptance criteria
- [ ] A user can reach Home as a guest in ≤3 taps with branch + language set.
- [ ] Choices persist across app restarts.
- [ ] The OS notification prompt never appears during onboarding; it fires only at in-context value moments, preceded by a pre-permission explainer.
- [ ] Language selection immediately localizes all UI.
