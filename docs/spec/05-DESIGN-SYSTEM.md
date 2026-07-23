# 05 · Design System & Theming

The app shares the church's brand with the website but is its own, more personal surface. All values below are the real tokens used across the redesigned site and the app prototypes.

> **Design source of truth (2026-07-18):** the canonical visual and interaction reference is the HTML prototype at `design/mockups/entry-flow.html` (open it in a browser). It holds all screen frames: every phone screen in light AND dark, tablet landscape + portrait (left nav rail + two-pane on landscape; centered max-width column for forms and the reader), and the edge / in-screen states (empty, loading, error, offline, plus per-screen states like prayer commitment, course already-registered, live pre/post, removed post). It is built with the CSS-variable tokens below and inline SVG icons, so it translates directly to React Native / Flutter (flexbox to layout, CSS vars to theme, copy is final). The earlier Figma build (`design/FIGMA-BUILD.md`) is parked and historical; when the two differ, follow the HTML, not Figma.

## Color tokens

Define as theme objects (light + dark). Names mirror the web tokens (`Nav.dc.html`) so the two stay in sync.

> **Values below = the mockup's `t-light` / `t-dark` CSS variables verbatim** (updated 2026-07-20; earlier tables lagged the final mockup CSS and the implemented tokens had followed them). `packages/shared/src/theme` mirrors these exactly. Naming map: mockup `--sub` → `sub`, `--border` → `cardline`, `--btnBg`/`--btnText` → `btnBg`/`btnText`.

### Brand constants (theme-independent, mockup `:root`)
| Name | Value | Use |
|------|-------|-----|
| `ink` | `#0e1420` | splash/hero bands, scrim base |
| `gold` | `#ffcf4a` | brand gold |
| `navy` | `#14213d` | brand navy |
| `blue` | `#2f6fed` | brand blue (tile gradients) |
| `green` | `#1f8a5b` | success |
| `red` | `#e0342c` | danger |

Plus the `onInk` group for content on ink/photo surfaces (same in both themes): text `#ffffff`, sub `#9aa6bd`, link `#8db4ff`, scrim `rgba(14,20,32,0.15) → rgba(14,20,32,0.92)` (vertical).

### Light
| Token | Value | Use |
|-------|-------|-----|
| `bg` | `#fbf8f3` | app background (warm cream) |
| `alt` | `#f0ece3` | alt surface: segmented tracks, icon circles, skeleton base |
| `text` | `#14213d` | primary text (navy) |
| `sub` | `#546077` | secondary text |
| `muted` | `#8a7f6a` | tertiary/meta: steps, timestamps, city lines |
| `card` | `#ffffff` | card surface |
| `cardline` | `#e8e0d0` | card border |
| `raised` | `#ffffff` | elevated chip on an alt track (segmented active state); same as card in light, where white-on-beige reads raised by itself |
| `band` | `#0e1420` | ink bands / hero (constant across themes) |
| `bandtext` | `#ffffff` | text on band |
| `accent` | `#ffcf4a` | **gold**: highlights, key CTAs |
| `blue` | `#2f6fed` | **hopeful blue**: links, active tabs |
| `eye` / `count` | `#b98600` | eyebrows, counters (burnished gold on cream) |
| `btnBg` / `btnText` | `#14213d` / `#ffffff` | primary buttons, selected states |

### Dark
| Token | Value |
|-------|-------|
| `bg` | `#0e1420` |
| `alt` | `#141d2a` |
| `text` | `#eef2f8` |
| `sub` | `#aab4c6` |
| `muted` | `#7c8698` |
| `card` | `#18212f` |
| `cardline` | `#28323f` (solid; borders carry separation in dark) |
| `raised` | `#28323f` (elevated chip on an alt track: card-on-alt is a 3-point difference in dark and the raised shadow is invisible there, so the active segment gets a genuinely lighter surface; fixed 2026-07-21) |
| `band` | `#0e1420` |
| `accent` | `#ffcf4a` (gold holds in both themes) |
| `blue` | `#5a9bff` (deliberate deviation: the mockup keeps `#2f6fed` in dark, lightened here for contrast on dark cards) |
| `eye` / `count` | `#ffcf4a` |
| `btnBg` / `btnText` | `#ffcf4a` / `#14213d` |

> **Contrast rule learned during design:** in **light mode**, selected/active states and hero titles must **not** be gold-on-light (fails contrast). Use **navy or blue** for active nav/text in light; gold is for fills and accents on dark or navy surfaces. In dark mode, gold-on-navy is the accent.

## Typography

- **Display / headings:** **Bricolage Grotesque** (700–800). Big, warm, characterful.
- **Body / UI:** **Hanken Grotesk** (400–700). Clean, legible.
- Load via `@expo-google-fonts/bricolage-grotesque` (700/800) + `@expo-google-fonts/hanken-grotesk` (400 to 700), **embedded at build time via the expo-font config plugin** (runtime `useFonts` causes a font flash; plugin-embedded fonts also require a dev build, which is our workflow anyway). Static instances only: RN/Hermes has no variable-font axis support. Never rely on system fallback for brand screens.

### Scale (mobile)
| Role | Size / weight |
|------|---------------|
| Screen title (hero) | 30–36 / 800 Bricolage |
| Section heading | 22–26 / 800 Bricolage |
| Card title | 17–19 / 700 |
| Body | 15–16 / 400–500 Hanken |
| Meta / label | 12–13 / 700 uppercase, letter-spacing 0.02–0.24em |
| Min tappable text | never below 12px; hit targets ≥ 44px |

## Spacing, radius, elevation

- **Spacing scale:** 4, 8, 12, 16, 20, 24, 32, 40, 56 (px).
- **Radius:** cards 16–22, pills/buttons 12–14, full for chips/avatars.
- **Elevation:** soft, low shadows in light; borders (not shadows) carry separation in dark.
- **Screen padding:** 18–20px horizontal gutter.

## Components (build as themed primitives)

| Component | Notes |
|-----------|-------|
| `Screen` | Safe-area wrapper, themed bg, scroll + refresh control |
| `AppHeader` | Title, back, optional bell/branch chip |
| `TabBar` | 5 tabs, active = blue(light)/gold(dark) icon + label |
| `Button` | variants: `primary` (blue fill), `accent` (gold fill, navy text), `outline`, `ghost`; ≥44px |
| `Card` | surface + cardline; pressable variant with hover/press lift |
| `Eyebrow` | uppercase label + short rule (color = `eye`) |
| `Chip` | branch chip, filter chip, scope toggle segment |
| `SegmentedControl` | scope toggle (My branch/Everywhere), theme picker, format picker |
| `VerseCard` | daily verse: gold accent, serif-flavored reference |
| `SermonCard` / `SermonRail` | thumbnail, play overlay, progress bar (resume) |
| `TestimonyCard` | author, branch, body, **Glory to God** button + count |
| `PrayerCard` | body, praying + prayed counts, "I will pray" then "I prayed", reminder note |
| `GloryButton` | signature reaction: filled gold state when reacted, count animates |
| `StreakStrip` / `MilestoneBadge` | grace-framed, encouraging |
| `EventRow` | date block + title + branch/global tag |
| `GateSheet` | bottom sheet for auth gate |
| `EmptyState` | icon + copy + primary action (never a bare empty list) |
| `Skeleton` | loading placeholders per layout; while a surface shows skeletons, primary actions that operate on the loading data are HIDDEN, not disabled (no dead buttons under a skeleton; decision 2026-07-20) |
| `Toast` | copy-confirm, action feedback |

## Theming implementation

- A `ThemeProvider` exposes the active theme object; all components read tokens from context (no hard-coded hex in screens).
- **Setting:** `theme_pref` = `system` \| `light` \| `dark` (Settings → segmented control). `system` follows OS via `useColorScheme()`.
- Persist locally in **AsyncStorage** (theme/language/branch are not secrets; SecureStore is reserved for the auth encryption key, see `03`) **and** to `profiles.theme_pref` for members (so it follows across devices).
- **Status bar + device chrome** must match theme (light content on dark, dark content on light): set `StatusBar` style per theme. (This was a known follow-up: theme the status bars, not just content.)

## Iconography

- Stroke-based, `currentColor`, 1.8 stroke: consistent with the website's `Icon` set. Reuse the same glyph vocabulary (play, calendar, globe, heart/flame for reactions, etc.).

## Imagery

- Real photos (heroes, branches, generosity) from `agbc/src/assets/`: copied into the app assets. Use `expo-image` with blurhash placeholders.
- Avoid decorative SVG illustration; the brand is photographic + typographic.

## Motion

- Gentle: 150–250ms ease. Press states lift/scale slightly. **Glory** reaction animates a small burst + count tick. Streak increments celebrate briefly (never punish a miss).
- **Reduced motion respected:** when the OS reduce-motion setting is on, the Glory burst becomes a color/fill change only (no scale/particles) and celebrations swap to static treatments; count changes are announced via an accessibility live region.

## Accessibility contract (built into the primitives in Phase 0, audited in Phase 4)

Custom controls are semantic components, not bare views with press handlers. Per component:

| Component | Role / state / label recipe |
|-----------|------------------------------|
| `GloryButton` | role button; state selected when reacted; label "Glory to God, {count} members{, reacted}"; count updates announced via live region |
| `SegmentedControl` (scope, theme, format) | role tablist/tab; selected state; each segment labeled |
| Family sub-tabs | role tab; selected announced |
| `StreakStrip` / `MilestoneBadge` | grouped, single label ("4 week rhythm, next milestone 12 weeks") |
| `Chip` (branch) | role button; label "Current branch {name}, change branch" |
| `GateSheet` | focus trapped; dismiss announced |
| `VerseCard` / `EventRow` | text scales to 200% without clipping (min-height, never fixed height); date block reads as one phrase |
| `Toast` | announced via an accessibility live region (`announceForAccessibility`); auto-dismiss never steals focus |
| `Skeleton` | hidden from assistive tech (`accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`); the screen exposes a busy/loading state instead |
| `TabBar` | role tab per item; selected state announced; label includes the badge count where present |

Every feature's acceptance criteria include the verification matrix: small phone (~320 to 360dp), large phone, tablet width, 200% text scale, VoiceOver + TalkBack pass.

## Tablet & orientation (decision 2026-07-12: full tablet layouts in v1)

- v1 ships real tablet layouts, not just a capped column. Direction: above ~600dp width, list-heavy tabs (Watch, Family, Events, Store) move to master-detail or multi-column grids; Home caps content width (~680px) and widens the quick-action row; player and reader support landscape on all devices.
- Android 16+ ignores orientation/resizability locks on large screens, so tablet rendering is not optional; iPad support is claimed on the App Store (adds iPad screenshots to the store matrix, see `19`).
- Each feature doc's screens are designed at phone AND tablet widths during the design phase; the frontend-bootstrap component library builds responsive primitives first (`Screen` handles width classes).

## Voice & tone

- Warm, familial, grace-framed. "One family · many nations · one amazing grace."
- Encouraging, never guilt-inducing (esp. rhythm/streaks).
- Welcome copy per branch exists in branch data (e.g. Berlin: "Willkommen. You belong here in Berlin.").
