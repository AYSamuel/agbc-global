# 04 · Navigation Map (no dead ends)

The complete screen graph. Every screen has an **ID**, who can see it, and **where each action leads**. If an action requires an account, it opens `GATE` (see `03`) and, on success, **completes the original action**. Every list has defined **empty / loading / error** states. There are **no dead ends.**

## Global rules (apply everywhere)

- **Back:** every non-tab screen has a back affordance → previous screen. Tab-root screens have no back (Android hardware back on a tab root → Home, then exit).
- **Bottom tab bar** (persistent on the 5 roots): **Home · Watch · Family · Give · More**.
- **Gate:** a gated action → `GATE` sheet → (Sign in → `AUTH-1…4`) → original action runs → stay in place.
- **Deep links:** notifications and shares open the exact target screen (see `15`).
- **Offline:** any data screen shows a cached view or a retry state; never a blank freeze.
- **Loading:** skeletons matching the screen layout.
- **Empty:** friendly copy + a primary next action (never a bare empty list).

## Entry & onboarding

```
SPLASH (auto 1.2s)
  └─> first launch?  yes ─> ONB-1 Welcome
                     no  ─> HOME (restore last branch/lang/theme)

ONB-1 Welcome ──[Get started]──> ONB-2 Language
              └─[I'm just looking]─> HOME (guest, default HQ branch)

ONB-2 Language ──[select + Continue]──> ONB-3 Pick branch
ONB-3 Pick branch ──[select + Continue]──> HOME
```
No account is created in onboarding. Choices persist locally (branch, language, theme). Notification permission is never requested during onboarding; the OS prompt fires in context at the first value moment (see `06`).

## Tab 1: HOME (`HOME`)

Content: greeting (+name if member), **branch chip** (tap → `BRANCH-SWITCH`), **daily verse card**, **next service** card, **quick actions** (Plan a visit, Watch, Give, Academy), **latest message**, **testimony highlight**, (member) **rhythm streak** strip, **bell** (→ `NC`).

| Action | → Destination |
|--------|---------------|
| Branch chip | `BRANCH-SWITCH` (sheet) → updates Home context |
| Daily verse "Read today's devotional" | entitled + active plan → `PLAN-DAY`; else → devotional `BOOK-DETAIL` (paid model, see `10`) |
| Next service "I'm here" | attendance write (gate) → toast + streak update |
| Quick: Plan a visit | `BRANCH-INFO` (current branch) |
| Quick: Watch | `WATCH` tab |
| Quick: Give | `GIVE` tab |
| Quick: Academy | `ACADEMY` |
| Latest message | `SERMON` player |
| Testimony highlight | `TESTIMONY-DETAIL` |
| Bell | `NC` Notification center |
| Streak strip (member) | `RHYTHM` |

## Tab 2: WATCH (`WATCH`)

Content: featured hero, **Live** state (if HQ live now), rails (Recent, Series), **search**, audio-only toggle entry.

| Action | → Destination |
|--------|---------------|
| Featured / any sermon | `SERMON` |
| Live (when live) | `LIVE` player |
| Search icon | `WATCH-SEARCH` |
| Save to My List | write (gate) |
| My List entry (More) | `MY-LIST` |

### `SERMON` (player)
Video (YouTube) or audio; **resume** from last position; **audio-only** switch; background/lock-screen controls; notes; save; share.
| Action | → Destination |
|--------|---------------|
| Play/pause/seek | in-place |
| Audio-only toggle | in-place (switches to audio stream) |
| Add note | `SERMON-NOTES` (gate) |
| Save | write (gate) |
| Share | OS share / WhatsApp |
| Back | previous |

### `LIVE`
Live video + **"watching now"** count (realtime) + auto-attendance (`live_watch`). Ends → falls back to `SERMON` (replay) or WATCH.

## Tab 3: FAMILY (`FAMILY`), the wedge

Segmented sub-tabs: **Testimonies · Prayer · Map**. Scope toggle: **My branch · Everywhere**.

### Testimonies (`FAMILY` default)
| Action | → Destination |
|--------|---------------|
| Scope toggle | refilters feed in place |
| Testimony card | `TESTIMONY-DETAIL` |
| **Glory to God** | reaction write (gate) → count +1 in place |
| **Share a testimony** (FAB) | `TESTIMONY-COMPOSE` (gate) |

### `TESTIMONY-COMPOSE` → `CONSENT` → submit
Body, optional category, optional photo → **consent step** (agree to share publicly, moderation notice) → submit → `status=pending` → **`POST-PENDING`** confirmation ("Sent for a leader to review") → back to feed (shows own pending row with a "Pending" badge).

### `TESTIMONY-DETAIL`
Full testimony, Glory reactions, (if from prayer) the **"Answered prayer" ribbon** linking to the origin. Share. **`⋯` in the header** (post-actions live on the detail, NOT feed cards, decision `09`): own post → `POST-ACTIONS` (edit/delete); other member's → `REPORT` / **Block this member** (`blocked_users`).

### Prayer (`FAMILY` → Prayer)
| Action | → Destination |
|--------|---------------|
| Prayer card | `PRAYER-DETAIL` |
| **I will pray** then **I prayed** | intercession write (gate): "I will pray" commits (`praying_count` +1, starts reminders); "I prayed" fulfils (`prayed_count` +1, reminders stop). See `09` |
| **Share a request** (FAB) | `PRAYER-COMPOSE` (gate) → consent → pending → confirm |
| On own answered request | `MARK-ANSWERED` → `TESTIMONY-COMPOSE` (prefilled, linked) |

### `PRAYER-DETAIL`
Body, praying + prayed counts, the two-step **"I will pray"** then **"I prayed"**; (own) **Mark as answered** → prompts to write the testimony (the loop). **`⋯` in the header**: own → `POST-ACTIONS`; other member's → `REPORT` / Block. 

### Map (`FAMILY` → Map)
Global family map: branches as pins + recent testimony pins across nations.
| Action | → Destination |
|--------|---------------|
| Branch pin | `BRANCH-INFO` |
| Testimony pin | `TESTIMONY-DETAIL` |
| Scope | My branch highlights vs all nations |

## Tab 4: GIVE (`GIVE`)

Explains giving; **links out to web** (Stripe/PayPal/bank): see `12`. Shows currencies/accounts with copy buttons (works offline for account details).
| Action | → Destination |
|--------|---------------|
| Give by card | opens web giving (in-app browser) |
| PayPal | opens `paypal.me/agbcglobal` |
| Bank transfer | `GIVE-BANK` (copyable account fields) |
| Copy field | copies value + toast |

## Tab 5: MORE (`MORE`)

A menu (hub: never a dead list). Sections:

- **My life:** Profile, My Rhythm (`RHYTHM`), My List (`MY-LIST`), My posts (`MY-POSTS`), Notifications (`NC`).
- **Grow:** Academy (`ACADEMY`), Devotional plan (`PLAN`).
- **Read:** Bookstore (`STORE`), My Library (`LIBRARY`).
- **Church:** Branches (`BRANCHES`), Events (`EVENTS`), About (`ABOUT`), Contact (`CONTACT`).
- **Leader** (role-gated): Leader tools (`LEADER-HOME` → dashboard link/web).
- **Settings:** `SETTINGS`. Sign in/out.

Each row → its screen. Every leaf screen has back. Guest rows that need auth open `GATE` first.

### Key MORE destinations
- `ACADEMY` → `COURSE` → `REGISTER` (gate) → `REGISTER-CONFIRM`.
- `EVENTS` → `EVENT-DETAIL` → **RSVP** (gate) → status set; **Add to calendar**; **Share**.
- `STORE` → `BOOK-DETAIL` → **Buy** (web) ; owned → `READER`.
- `LIBRARY` → `READER` (resume location).
- `PLAN` (entitled owners; others → devotional `BOOK-DETAIL`) → `PLAN-DAY` → **Mark complete** → progress + possible milestone.
- `RHYTHM` → streak, milestones, attendance history.
- `SETTINGS` → Theme (Light/Dark/System), Language, Notifications prefs (`NOTIF-PREFS`), **Blocked members** (unblock list, see `16`), Profile edit, Privacy (`PRIVACY`), **Delete account** (`DELETE`), Sign out.
- `NC` (Notification center) → tap item → **deep link** to its target screen; mark read.

## Church screens (spec lives here; no feature doc owns them)

- **`BRANCH-INFO`** (destination of Home's "Plan a visit", both map pin types, and `BRANCHES`): renders one branch from `branches` + `branch_services`: next services (computed from `branch_services`, displayed with `service_times` strings), address with a Directions link (OS maps), lead + leaders, `welcome` copy, contact email. Actions: Directions, Share, "Watch this branch" (sets the browsing chip), and around service time the "I'm here" affordance (gate). Empty/edge: branch without coordinates hides the map link, never errors.
- **`BRANCHES`**: list of all branches (name, city, country, HQ badge) → `BRANCH-INFO`. Same data as onboarding's picker.
- **`ABOUT`**: the church's story + "One family · many nations" statement (static content, from the website's copy). Links to `BRANCHES` and `CONTACT`.
- **`CONTACT`**: contact form (name, message → edge function → church inbox) + direct email links per branch. Submit → confirmation; failure preserves the draft.
- **`LEADER-HOME`** (role-gated): explains the leader role and links out to the web dashboard (`17`); shows the leader's branch scope. No moderation happens in the app.

## Auth cluster
`GATE` → `AUTH-1` → `AUTH-2` → (`AUTH-3` first time) → `AUTH-4` → **return to origin action**.

## Every dead-end check (representative)
- Empty testimony feed → "Be the first to share what God has done" + compose CTA.
- No live now → Watch shows replays, not a blank live tab.
- Not-yet-owned book "Read" → routes to Buy (web), not a locked blank.
- Broken audio/video → error card with Retry + "open on YouTube."
- Guest taps any contribute action → gate → completes after sign-in.
- Course "upcoming/closed" → shows "Notify me" instead of a dead Register.
- Failed RSVP/registration submit → inline error + retry, draft preserved.

> The interactive `App Screen Map.dc.html` and `App iOS + Android.dc.html` are the living versions of this graph.
