# Design Language (from the prototype)

Build reference reverse-engineered from `App iOS + Android.dc.html` / `AppFull.dc.html`. Screens must match this, not a generic reinvention. Docs win on behavior; the prototype wins on look and feel.

## Tokens (exact)

| Token | Role | Light | Dark |
|---|---|---|---|
| `--bg` | app background | `#fbf8f3` | `#0e1420` |
| `--card` | card / tab bar fill | `#ffffff` | `#18212f` |
| `--text` | primary text | `#14213d` | `#eef2f8` |
| `--sub` | secondary text | `#546077` | `#aab4c6` |
| `--muted` | meta / tertiary text | `#8a7f6a` (warm taupe) | `#7c8698` |
| `--border` | hairline borders | `#e8e0d0` (sand) | `#28323f` |
| `--alt` | icon chips, seg track, subtle fills | `#f0ece3` | `#141d2a` |
| `--btnBg` | primary button fill | `#14213d` (navy) | `#ffcf4a` (gold) |
| `--btnText` | primary button label | `#ffffff` | `#14213d` |

Fixed brand colors (theme-independent): gold `#ffcf4a` (accent, always a FILL carrying navy text), navy `#14213d`, ink `#0e1420` (splash/player/gate/band bg), action blue `#2f6fed` (links + active tab ONLY, never a button fill), green `#1f8a5b` (prayer / answered / success / toggle-on), live red `#e0342c`, danger red `#c0392b`. Gold-ink text on cream: `#2b2517` / `#7a5b12` / `#b98600`.

## What makes it polished (do these)
- Warm neutrals, never pure grey. The `#fbf8f3` / `#e8e0d0` / `#8a7f6a` warmth is essential.
- Two typefaces: **Bricolage Grotesque** 700/800 with `letter-spacing:-0.02em` for ALL headings, numbers, verses; **Hanken Grotesk** 400-700 for body/UI/buttons.
- The **eyebrow**: uppercase, weight 800, `letter-spacing:0.12-0.24em`, ~11px, gold on dark surfaces / `--muted` on light. Used on nearly every section.
- Depth from **1px warm hairline borders + inverted ink/navy "band" cards**, NOT drop shadows (app is near-shadowless; only toggles/active-segments get a 1px shadow).
- **Cream scripture card** for verses: `linear-gradient(135deg,#fbf3dd,#f5e8ce)`, border `#eeddb5`, gold-ink text.
- **Photography under navy scrims**: `object-fit:cover` in fixed aspect boxes under `linear-gradient(180deg, rgba(14,20,32,0.15), rgba(14,20,32,0.9))`; home hero drops the photo to `opacity:0.32` over navy. (In artifacts we can't load the real JPEGs; use a navy gradient placeholder and note real photos go there.)
- Gold is the single energy color, used sparingly (CTAs in dark, live states, scripture accents, play buttons).

## Radii
buttons 14 · small buttons/OTP 11-12 · icon chips 11 · standard cards 18 · settings/menu cards 16 · home/hero cards 20-22 · pills/chips/badges/toggles 100 · avatars 50%.

## Component recipes
- **Primary button**: `width:100%; border-radius:14px; padding:16px; font:800 15.5px Hanken; background:var(--btnBg); color:var(--btnText); border:none`. (Navy in light, gold in dark.)
- **Outline/secondary**: `background:var(--card); border:1px solid var(--border); color:var(--text); border-radius:14px; padding:15px; font-weight:700`.
- **Ghost** ("I'm just looking"): `background:none; border:none; color:var(--muted); font-weight:700; 13.5px`.
- **Standard card**: `background:var(--card); border:1px solid var(--border); border-radius:18px; padding:18px`. No shadow.
- **Band card** (emphasis): ink `#0e1420` / navy `#14213d` bg, white text, gold eyebrow, `#9aa6bd` sub.
- **Verse card**: cream gradient above; eyebrow "VERSE OF THE DAY" `#b98600`; verse Bricolage 17px/700 lh1.45 `#2b2517`; reference 13px/800 `#7a5b12`; Save pill.
- **Tab bar**: `background:var(--card); border-top:1px solid var(--border); padding:9px 8px 30px; grid 5col`. 22px line icons stroke currentColor; label 10.5px/700; active `#2f6fed`, inactive `--muted`. Only on the 5 roots (Home Watch Family Give More).
- **Scope pills / segmented**: track `background:var(--alt); border-radius:100px/13px; padding:3-4px`; active = `--btnBg` fill (pills) or `--card`+1px shadow (seg); inactive transparent `--muted`.
- **Glory pill**: off `background:var(--alt); border:1px solid var(--border); color:var(--sub)`; on `background:#fff4d6; border:1px solid #ffcf4a; color:#8a6a12`; radius 100px; 12.5px/700.
- **Home header**: greeting 13px/500 `--sub` + "AGBC {branch}" Bricolage 20px/800 + blue chevron; right = bell (40px `--alt` circle, red dot with card-colored ring) + avatar (40px `linear-gradient(135deg,#2f6fed,#14213d)` white initial).
- Screen top padding starts at 52px (clears status bar); cards use 16px side gutters, text 20-22px.

## Guest vs member (per `03` matrix): enforce
- **Streak / rhythm / milestones / attendance**: member-only. Guests see NO streak strip and NO personalized data.
- **Greeting**: guest = "Good morning"; member = "Good morning, {name}".
- **Home layout is otherwise identical** guest vs member (no dedicated "Join" card on Home).
- **Gate on action, not on screen**: a guest can browse everything; tapping a member-only action (Glory, I prayed, compose, RSVP, save, notes, I'm here) opens the `GATE` sheet, then completes the action after sign-in.
- **Give** is guest-allowed (links out to web, no account).
- **Profile (guest)** = empty state ("You're browsing as a guest" + Sign in); **Settings** shows Sign in vs Sign out.
- Auth is **email-OTP only** in v1 (no Google/Apple; decision 2026-07-18, `03`). No consent screen or notification prompt during onboarding.

## Flow order (build top to bottom)
`SPLASH → ONB-1 Welcome → ONB-2 Branch → ONB-3 Language → HOME (guest)` → tabs (Watch, Family, Give, More) → gated flows (Auth, compose) → member states.
