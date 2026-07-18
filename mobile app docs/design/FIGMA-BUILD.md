# Figma Build: AGBC Global Design System

This is the running record of how the app's design system is structured in Figma. The Figma file is the **master design source**: foundations, components, and every screen live there. Values are mirrored from `05-DESIGN-SYSTEM.md`, `design/prototype-design-language.md`, and the `design/mockups/entry-flow.html` prototype (prototype wins on look and feel; docs win on behaviour).

## RESUME HERE (next session): build the remaining screens

**Goal:** build every screen in `SCREENS-CHECKLIST.md`, iPhone / light / phone first, then the Android-key / dark / tablet passes. **Batch B (Auth cluster) is now done** (GATE, AUTH-1/2/3/4). Next up is **Batch C: Watch** (WATCH, SERMON player, LIVE, WATCH-SEARCH, MY-LIST, SERMON-NOTES), then Batches D through J. Batch A still has two stragglers to slot in when convenient: HOME (member) and BRANCH-SWITCH.

> **Rework note (2026-07-18):** auth switched from phone-OTP to email-OTP (`03`). The built AUTH-1 (phone field + country code) and AUTH-2 (WhatsApp copy, SMS switch) frames need rework to email entry / sent-to-email copy when Figma work resumes; `design/mockups/entry-flow.html` carries the current truth until then. The PhoneInput component master becomes an EmailInput (or generic TextField use).

**At session start, refresh IDs (they are stable but re-fetch to be safe):**
- `get_pages` (screens live on `📱 Entry & Onboarding`, id `8:86`; Components `8:85`; Foundations `0:1`). Free plan caps the file at **3 pages**, so ALL screens go on `8:86`, laid out in labelled rows by feature.
- `get_local_components` (76 masters, light + `Dark/` prefixed), `get_styles` (text + effect styles), `get_variable_defs` (`AGBC Tokens` collection).

**Key reusable node/style IDs (verify at start):**
- StatusBar frames to clone: **Light `45:662`**, **Dark `46:686`** (time, Dynamic Island, signal/5G/battery).
- Elevation effect styles: **Box `S:0aefbc0b379fd483039820e93eeb8655587e3d7e,`**, **Pill `S:eb7d6c82ab8baca0f1bbfd5db76d2a4140d1fa1b,`**.
- Existing screens (row 1, y=0): Splash `24:284` (x0), ONB-1 `24:291` (x450), ONB-2 `39:463` (x900), ONB-3 `42:519` (x1350), Home guest `43:575` (x1800). Auth row (y=1120): AUTH-1 `48:722` (x0), AUTH-2 OTP `49:766` (x450), AUTH-3 Profile `50:807` (x900), AUTH-4 Success `50:852` (x1350), GATE Sheet `50:891` (x1800). **Start the next feature row (Watch) at y=2240**, x from 0 (y += ~1120 per row).

**Per-screen recipe (full rigor):**
1. Create the screen frame (390 wide, fixed 844 for standard screens or taller for long scrolls), light bg `#FBF8F3`, VERTICAL auto-layout, `counterAxisAlignItems: MIN`, corner radius **44**.
2. Clone `StatusBar/Light` (or Dark on ink screens) into it, `reorder_nodes sendToBack` to put it at the top. Reduce the first content block's top padding by ~44 to compensate.
3. Build content from the component recipes; reuse a cloned tab bar for the 5 root tabs.
4. Apply text styles to text nodes and elevation styles (`Elevation/Box` to cards/tiles/rows/sheets, `Elevation/Pill` to buttons/chips/badges). Bind key surface fills to `Light/*` variables.
5. Screens with centre/bottom-aligned content (Splash, ONB-1) need their content wrapped in a content-area child frame before the status bar can sit on top; retrofit those.

**Tooling gotchas (learned):**
- No `create_instance` on this plugin, so screens are compositions, not instances. `clone_node` on a component makes a duplicate COMPONENT, not an instance.
- `create_component` collapses a frame's fixed width to hug, and changes its node id; `resize_nodes` back and re-fetch the new id.
- `clone_node` child traversal order can put a nested icon before a sibling label, so verify child ids with `get_node` before batch-editing clones (a couple of early mix-ups came from assuming order).
- Screenshot/export (`get_screenshot`, `save_screenshots`) is unreliable (frequent timeouts); rely on Ayo's visual spot-checks. (Confirmed again in the Batch B session: every screenshot call timed out.)
- No gradients or vector icons on this plugin: icons are placeholder squares, gradients are solid fills, both deferred to a paid-plan polish pass.
- **Per-corner `set_corner_radius`** (`topLeftRadius` etc.) throws `Cannot unwrap symbol` on this plugin; only the uniform `cornerRadius` arg works. For a sheet that needs round-top / square-bottom, set a uniform radius and push the frame's bottom a few px past the 844 device edge so the device's own 44 corner-clip squares off the bottom.
- **Adding a child to a fixed-size frame can flip its sizing to hug.** The filled OTP boxes collapsed to the digit's height (56→24) the moment a text child landed. Fix: after populating, re-assert `set_auto_layout` with `primaryAxisSizingMode: FIXED` + `counterAxisSizingMode: FIXED`, then `resize_nodes` back to the intended size.
- **New text nodes hug to one line;** to wrap a paragraph inside a fixed-width column, `resize_nodes` the text to the column's inner width (it flips to fixed-width / auto-height and wraps).

**Auth-cluster build pattern (efficient, reused for AUTH-2/3/4):** clone AUTH-1 (`48:722`) → `get_node` the clone to map child ids → rename the frame, `set_text` the title/subtitle/button/fineprint, then rebuild the field block **in place** (reuse the `phone-field`/`phone-row` layout slot: delete its children, re-point its auto-layout, drop in the new inputs). Reusing the existing slot avoids any reorder (the plugin's `reorder_nodes` only does relative front/back moves, no absolute index)._AUTH-2:_ `phone-row` → horizontal `SPACE_BETWEEN` 6-box OTP (boxes 48×56 r11, first 3 filled `Display/Number`, box 4 active blue `#2f6fed`). _AUTH-3:_ `phone-field` → vertical `fields` stack of label+input groups (First/Last name + Home-branch selector row). _AUTH-4:_ recolor `authicon` to a green (`#1F8A5B`) success circle w/ white check, hide the back button, turn `phone-field` into an elevated summary card (Phone + Home branch rows). _GATE:_ built fresh: scrim rect (`#0E1420` @55%) + transparent-bg `StatusBar/Dark` clone + bottom `sheet` (grabber, gold icon, contextual title, two buttons, `Elevation/Sheet`).

### Prototype-fidelity rework (2026-07-16, same day)

Ayo reviewed the first auth pass and preferred the `mockups/entry-flow.html` prototype. Cause: I had drifted from the prototype's copy AND structure (invented my own), and the free plugin can't do the prototype's gradients / vector icons. He chose to fix on the free plan now. All 5 auth screens were realigned to the prototype exactly: **AUTH-1** "Join the family" + WhatsApp-first lead + country chevron + "No passwords" note; **AUTH-2** "Enter your code", `Sent via WhatsApp to +44 7700 •••821`, digits `4 1 9` + focused box with a **blue focus-glow** (`DROP_SHADOW` spread 3, blur 0, blue @0.18), boxes 60 tall r12, resend/`Send by SMS instead` row + `Change number` link (no Verify button); **AUTH-3** no gold icon but a centered **avatar picker** (84 circle + camera badge), single Display name, Home-branch + Language pickrows, age checkbox, `Enter`; **AUTH-4** **gold** success circle (88, navy check) with a **halo** (`DROP_SHADOW` spread 10, blur 0, gold @0.15), centered, `You're in!`, gold Continue; **GATE** centered with contextual title `Sign in to say Glory to God` + `Sign in`. Verified visually via `save_screenshots` (must write **inside the repo dir**, not the scratchpad; screenshots still time out ~50% of the time, retry).

**Lesson (locked): the prototype is the source of truth for copy AND structure, not just palette. Read the exact screen markup in `entry-flow.html` before building each screen; do not invent copy or layout.**

**Text-align gotcha:** this plugin has **no `textAlignHorizontal` control** (no tool sets it). For centered screens (GATE, AUTH-4), center the layout via `counterAxisAlignItems: CENTER` and **split multi-line paragraphs into separate hugging text nodes** so each line centers on its own. Single-line headings/buttons center fine as blocks.

**Reorder gotcha:** `reorder_nodes` is relative only. `sendBackward` moves one step toward index 0 (earlier / higher in a vertical stack); `sendToBack` jumps to index 0. To insert an appended node into the middle of an auto-layout, `sendBackward` N times (verify the returned `index`).

**New-text-wrap gotcha:** a fresh `create_text` hugs to a single line and will overflow the frame. After setting long copy, `resize_nodes` the text to the column inner width (342 here) so it wraps.

**Component masters vs the rework:** screens are compositions, not instances, so the screen rework did NOT touch the masters (and never propagates either way). AUTH-4's success halo and AUTH-3's avatar picker are screen-only, not components.

**Full component audit (all 76 masters, 2026-07-16 → 07-17):** ran a read-only drift audit of every master against the prototype (delegated to a subagent; report in that session). **No HIGH drifts; the library is largely prototype-faithful.** Fixed drifts (light + dark twins): OTP focus-glow added (`31:193`/`35:418`); `Glory/On` label #8a6a12→#14213d (`30:99`); `StreakStrip` big number 20→22 via Display/Number (`31:168`/`35:399`); `PrayerCard` meta de-eyebrowed to plain muted Meta, sentence case (`30:103`/`35:350`); `Dark/StreakStrip` surface #14213d→#0e1420 (`35:396`); `Dark/Eyebrow` #b98600→#ffcf4a (`35:395`); `MenuRow` mic radius 0→10 (`31:138`/`35:379`); `FAB` label 14→15.5 via Button style (`29:21`/`35:266`); `Button/Ghost` fill made transparent (`29:25`/`35:258`); `TabBar` inactive placeholder icons → muted `#8a7f6a`/`#7c8698` (light `14:258/260/262/264`, dark `35:303/306/309/312`); `QuickTile` L/R padding 0→4 and `TabBar` L/R padding 15→8, **bound to `Space/4` & `Space/8` variables** (set_auto_layout rejects COMPONENT roots; bind_variable_to_node works). **Left as-is (LOW, no matching token style so not worth recreating the node):** Card/Verse ref weight 700 vs 800 (`29:44`/`35:295`); StreakStrip ring number 16 vs 14px (`31:170`/`35:402`); AppHeader bell notification dot absent (intentional "no unread" default). **Unverifiable by read tools:** `get_node`/`get_nodes_info` do NOT serialize `effects` or stroke weight, so elevation-applied and 1px/2px stroke widths could not be confirmed programmatically; spot-check shadows visually in Figma (build log says elevation was applied to 60 masters in an earlier session).

## Batch C: Watch (started 2026-07-17)

Prototype references exist for **WATCH** (`entry-flow.html` ~line 552), **SERMON** (~1067), **LIVE** (~1094). No prototype for WATCH-SEARCH, MY-LIST, SERMON-NOTES (extrapolate from the design language). New **Watch feature row at y=2240**.

**WATCH · light `59:945` DONE.** Pattern for tab-root screens: frame 390x844 FIXED, VERTICAL, `primaryAxisAlignItems: SPACE_BETWEEN` with two children (a hug-height `content` column + the tab bar) so the tab bar pins to the bottom with content at top. Reused chrome by cloning `StatusBar/Light` (`45:662`) into content and the **Home tabbar composition** (`44:641`) into the frame, then recoloring the active tab (Watch blue `#2f6fed`, others muted `#8a7f6a`; also fixed the cloned tabbar's inactive icons from the old light `#f0ece3` to muted). Content = stitle (Display/Title + search btn), mediahero (LIVE badge, gold playc, HQ/title/watching), sectitle (Display/Section + See all), 3 rrows (rthumb + title/speaker).

**Gradient decision (Ayo, 2026-07-17): use gradient IMAGES** (stay on free plugin). Technique: `scratchpad/gradgen.py` generates small linear-gradient PNGs (pure-stdlib, no deps) as base64; `import_image` places them. **`import_image` gotcha:** it drops the image as a rectangle child and only honors x/y when the parent is a **NONE-layout** frame; in an auto-layout parent the rect gets auto-arranged (fought the centered play button on the small thumbnails). So: large heroes / player-videos (NONE-layout containers) get the real gradient image at 0,0 + `sendToBack`; **tiny thumbnails use a navy-blue solid `#1e3a6b`** (gradient imperceptible at 120x72 and not worth breaking layout). WATCH hero gradient = `#33507f`->`#0e1420` applied via `import_image` into mediahero `61:1004`. Gradient specs to reuse: player video `#22375f`->`#0e1420` (160deg), thumb `#14213d`->`#2f6fed` (135deg).

**SERMON player · light `67:1016` (x450) DONE; LIVE player · light `70:1072` (x900) DONE.** Full-screen player pattern (no tab bar): frame 390x844 with `StatusBar/Light` + a `player-content` frame (794 tall, VERTICAL, `SPACE_BETWEEN`) holding a `top-col` (pl-top, pl-video, meta, scrub, transport) and a `bottom-col` (3 option tiles + note) so the tiles pin to the bottom (prototype `margin-top:auto`). `pl-video` is a NONE-layout 346x216 r16 frame with the player gradient image (`import_image` + `sendToBack`) and a centered gold play circle. **LIVE was cloned from SERMON** (`clone_node` preserved the gradient image fill) then adapted: removed the video play button + transport + times, swapped the "Now playing" label for a red `live-badge`, changed the speaker line to a `watching` row (red dot + "342 ... watching now"), set the scrubber to red (track `#E0342C`@0.3, fill 100% `#E0342C`), and relabeled tiles to Audio only / Who's here / Share. **WATCH-SEARCH · light `70:1134` (x1350), MY-LIST · light `71:1184` (x1800), SERMON-NOTES · light `73:1224` (x2250): DONE.** No prototype refs, so extrapolated from the design language (pushed sub-screens: back button, no tab bar). WATCH-SEARCH = search field (icon + "grace" + Cancel) + filter chips (All active + Sermons/Series/Speakers) + "3 results" + 3 result rows (**cloned WATCH rrows `60:978/979/980` + `find_replace_text`** to retitle). MY-LIST = back + "My List" + "12 saved" + 3 cloned saved rows. SERMON-NOTES = back + "Sermon notes" + Save, an elevated sermon-context strip, a "MY NOTES" notes card with 2 timestamped entries (gold `#FBF1D6` stamp chips), and an "Add a note..." input with a navy + button. Cloning finished rrows + `find_replace_text` is the fast way to populate list screens.

**Gradient-over-text gotcha:** a hero's inner text block (the `.in` group) must have a **transparent fill** when it sits over a gradient image; a solid fill (even matching the old solid hero color) shows as a visible rectangle once the bg is a gradient. Set `set_fills ... opacity 0`. Also `resize_nodes` any single-line note text to the column width so it wraps instead of overflowing.

**Whole Batch C (6 screens) visually verified** once the plugin export recovered mid-session: WATCH (gradient hero), SERMON + LIVE (gradient videos), WATCH-SEARCH, MY-LIST, SERMON-NOTES all confirmed via screenshot. Batch C DONE.

## Real icons via raster import (2026-07-17)

Ayo flagged that icons were placeholder squares (search etc.). **Fix (same free-plan path as gradients): render the prototype's exact SVG icons to transparent PNG and `import_image` them.** Pipeline in scratchpad: `npm i @resvg/resvg-js` (prebuilt, no system deps; network is available), `iconrender.js` renders each icon SVG (verbatim from `entry-flow.html`) to `ic-<name>.b64` files. Render on a **padded viewBox `-3 -3 30 30` at 120px** (not a tight `0 0 24 24`), so strokes at the glyph edge are not shaved.

**CRITICAL import gotcha (root cause of "blank / half-missing" icons): `import_image` with `scaleMode: "FIT"` is broken in this plugin (it crops/scales the image instead of fitting it), so icons whose content reaches the edges (headphones, home, share, download) render blank or as a top fragment, while center-heavy ones (heart, dots, notes) happen to survive. Use `scaleMode: "FILL"` instead** (the same mode the gradients used). For a square PNG in a square node FILL = exact fit, full icon, no crop. This was diagnosed by decoding the `.b64` back to PNG (source was perfect) and confirmed by re-importing one slot with FILL (headphones went from blank to complete) and re-verifying the WATCH tab bar (home regained its floor). **All Batch C + auth icons were re-imported with FILL.**

**Placement per slot: delete the placeholder rect, `import_image` the icon (scaleMode FILL, sized to display px) into the slot frame, then `sendToBack`** if the frame is a center auto-layout with a label below/beside (tab = icon above label; search-field = icon left of text). Single-child slots (icon buttons) just center on import, no reorder. **Paste-corruption gotcha (the real second bug behind "blank" icons): a base64 string can pick up stray spaces on the read/paste round-trip (base64 never contains spaces), producing an invalid PNG that imports as a blank/garbage rectangle.** The source `.b64` files on disk are all clean and valid (verified by decoding); corruption enters only in the read into context or the reproduction into the tool arg, and it is intermittent (higher odds on longer strings and on later entries in a multi-import message). Symptom: icons whose content reaches the edges look blank/fragmentary; center-heavy ones survive. **Reliable process: (1) strip whitespace from every `.b64` into `clean-*.b64` and validate each decodes to a real PNG (`scratchpad` one-liner does this); (2) `Read` the clean file fresh right before importing; (3) do ONE `import_image` per message; (4) screenshot-verify.** This was demonstrated: notes/skip-back/skip-fwd went from blank to perfect after a clean re-import. Also `import_image` into a **NONE-layout** parent places the image at **(0,0), not centered** (this is how avatar `53:941` landed the person top-left); `resize_nodes` + `move_nodes` to center it afterward.

**Icons DONE (FILL + clean base64):** WATCH tab bar (home/watch-blue/family/give/more) + header search; WATCH-SEARCH field search; SERMON share + 3 tiles + skip-back/skip-fwd/pause; LIVE share + audio/who's-here/share tiles; AUTH-1 phone, AUTH-2 whatsapp, AUTH-3 avatar person (centered 40px), GATE glory-spark. **Every slot was re-imported from a freshly-read `clean-*.b64` file.** Verified visually: WATCH tab bar (all 5 crisp, home complete), SERMON headphones/download/notes/skip-back/skip-fwd. The rest used the identical proven clean-read process; a final visual pass is pending the plugin export recovering (it was timing out at the end of the session). **Icons STILL TODO (placeholder squares remain):** Home-guest screen (`43:575`) bell + 4 quick tiles + its tab bar; ALL component masters (TabBar `29:53`, IconButton, etc.); any future screens. Text-glyph "icons" (▶ play, ‹ › chevrons, ✓ check, + add) were LEFT AS-IS since they render as correct shapes. resvg-js is a scratchpad tool only (not added to the repo).



## Connection & plan

- Built via the **figma-mcp-go** plugin against the live desktop file.
- The file is on the **free Figma plan**, which caps variable collections at **1 mode**, so native Light/Dark variable modes are unavailable. We use the **theme-prefix workaround** (see Tokens). Upgrading to Figma Professional later would allow collapsing `Light/*` plus `Dark/*` into one collection with Light/Dark modes (moderate rework).
- Known limitation: the plugin's **screenshot/export currently times out**, so visual review happens by viewing the file directly in Figma.

## Page structure

- `🎨 Foundations`: token specimen (colours, type, spacing/radius, elevation).
- `🧩 Components`: the component library.
- `📱 Entry & Onboarding`: first screen set (Splash, Onboarding, Home).
- Further `📱 …` pages per feature area are added as screens are built.

## Tokens (collection: **AGBC Tokens**, single mode)

Because only one mode is allowed, semantic colours are duplicated per theme and prefixed. Bind **Light frames to `Light/*`** and **Dark frames to `Dark/*`**.

- `Brand/*`: theme-independent. gold `#FFCF4A`, navy `#14213D`, ink `#0E1420`, blue `#2F6FED`, green `#1F8A5B`, red-live `#E0342C`, red-danger `#C0392B`, white.
- `Scripture/*`: verse card. bg-from `#FBF3DD`, bg-to `#F5E8CE`, border `#EEDDB5`, eye `#B98600`, text `#2B2517`, ref `#7A5B12`.
- `Light/*`: bg, card, text, sub, muted, border, alt, btnBg, btnText, eye, util, mapsea.
- `Dark/*`: same names, dark values.
- `Space/*`: 4, 8, 12, 16, 20, 24, 32, 40, 56 (FLOAT).
- `Radius/*`: otp 11, chip 12, button 14, menu 16, card 18, hero 22, pill 100 (FLOAT).

Translucent tokens (framestroke, mapland, dark cardline) are applied as node-level opacity rather than variables.

## Text styles (Bricolage Grotesque display + Hanken Grotesk body)

`Display/Hero` 30/800, `Display/H1` 28/800, `Display/Title` 26/800, `Display/H2` 23/800, `Display/Section` 18/800, `Display/Number` 22/800, `Display/Quote` 20/700, `Display/Verse` 17/700: all Bricolage, -2% tracking (Verse -1%).
`Body/Large` 16/400, `Body/Regular` 15/400, `Body/Medium` 15/500, `Body/Strong` 15/700, `Label/Row` 14.5/600, `Meta` 12.5/500, `Eyebrow` 11/800 (+14%, set text UPPERCASE), `Button` 15.5/800: all Hanken.

## Effect styles

Original foundation set (kept): `Elevation/Toggle`, `Elevation/Card`, `Elevation/FAB`, `Elevation/Sheet`, `Elevation/Device`.

### Elevation direction change (2026-07-16): app-y raised surfaces

The original spec was deliberately near-shadowless (depth from 1px hairline borders). Ayo asked for a more native, "app-y" feel, so boxes and pills now carry a **subtle raised shadow**. Two shared effect styles drive this so intensity is tunable from one place:

- `Elevation/Box`: DROP_SHADOW y2, blur 10, spread -2, navy `#14213D`, opacity 0.09. Applied to cards, tiles, selection rows, sheets (the "boxes").
- `Elevation/Pill`: DROP_SHADOW y1, blur 6, spread -1, navy, opacity 0.10. Applied to pills, chips, badges, buttons, icon circles.

Decisions locked: **individual boxes raised** (no wrapping content sections into larger elevated panels), **softer** intensity. Hairline borders are retained under the shadow.

Propagation: applied to the entry-flow screens (Home, ONB-2, ONB-3, ONB-1 button). Still TODO: apply to the 76 component masters (both themes) and bake into every remaining screen as it is built.

## Component recipes (source of truth: entry-flow.html)

- Primary button: navy fill, white label, radius 14, padding 16, full width.
- Gold button: gold fill, navy label. Outline: card fill plus 1px `border`. Ghost: transparent, muted 13.5/700.
- Standard card: card fill, 1px `border`, radius 18, padding 18, no shadow.
- Tab bar: card fill, 1px top hairline, 5 tabs, active = blue (light) / gold (dark), inactive muted.
- Verse card: cream **gradient** `#FBF3DD` to `#F5E8CE` (135deg). NOTE: the plugin sets solid fills only, so gradient fills need to be applied manually in Figma or approximated with a solid until a gradient method is available.

## Component library (Light): 38 real components, DONE

All are true Figma COMPONENT nodes (slash-grouped in the Assets panel), on the `🧩 Components` page in the "Component Library · Light" board, organized into 9 sections:

- **Actions (7):** Button/Primary, Button/Gold, Button/Outline, Button/Ghost, IconButton, BackButton, FAB
- **Containers (3):** Card/Standard, Card/Band, Card/Verse
- **Navigation (4):** TabBar, AppHeader/Home, SegmentedControl, ScopePills
- **Family (4):** TestimonyCard, PrayerCard, Glory/On, Glory/Off
- **Content (5):** SermonCard, EventRow, QuickTile, MenuRow, LiveBadge
- **Chips & Badges (4):** BranchChip, FilterChip, HQBadge, Eyebrow
- **Rhythm (2):** StreakStrip, MilestoneBadge
- **Inputs (5):** TextField, PhoneInput, OTP, Checkbox, SelectionRow
- **Feedback & States (4):** GateSheet, EmptyState, Toast, Skeleton

Note on `create_component`: converting a frame to a component collapses fixed widths to hug, so each conversion is followed by a `resize_nodes` back to the intended width.

## Build phases & status

1. Foundations tokens + styles: **done**.
2. Foundations specimen page: **done**.
3. Component library, Light (38 components): **done**.
4. Dark component set (38 parallel masters, `Dark/` prefixed, on the "Component Library · Dark" board): **done**. Total local components now 76 (38 Light + 38 Dark). Theme-independent components (gold buttons, band/verse cards, HQ/Live/Milestone badges, StreakStrip, Toast, Glory/On, Eyebrow) were cloned as-is; the rest were recolored to `Dark/*` values (surfaces, text, borders; navy primary buttons and selected states become gold).
5. Variable-binding pass (wire component fills/text to the token variables so global edits propagate): **pending** (optional; free-plan single-mode variables give no theme-switch, so this is convenience only).
6. Entry flow screens (Splash, Onboarding, Home), full matrix (light + dark, phone + tablet): **pending** (Splash + Welcome light built earlier on the Entry page).
7. Remaining feature screens (Watch, Family, Give, More, Auth, Events/Academy/Store, Settings, etc.): **pending**.

Deferred to a later polish pass (needs paid Figma plan / official MCP): real vector line-icons (currently placeholder squares) and true gradients (verse card, photo scrims currently solid).

Coverage decision: **full matrix** (light + dark, phone + tablet). Sequencing: **slice-first**, meaning foundations + component library + entry flow, then review, then the rest.

## Screen build plan & decisions (2026-07-16)

How screens are built and the variant matrix, agreed with Ayo:

- **Not instances.** The free `figma-mcp-go` plugin has no create-instance capability, so screens are built as **compositions** (frames + text) using the component recipes, with **full rigor**: fills bound to colour variables, text bound to text styles, elevation via effect styles, and shared blocks (status bar, tab bar, headers) reused via cloning. Global token/style edits still cascade; only structural edits do not. True instances would need a paid Figma plan + the official MCP.
- **Phone shells.** Every screen is phone-shaped, not a bare rectangle: rounded device corners (44px for iPhone) and a **status bar** at the top. Reusable shells built: `StatusBar/Light` (dark content on cream) and `StatusBar/Dark` (light content on ink), each with time, Dynamic Island, signal/5G/battery. Cloned into each screen and reordered to the top. Screens with top-aligned content (Home, ONB-2, ONB-3) take the status bar directly; centre/bottom-aligned screens (Splash, ONB-1) need their content wrapped in a content-area frame first (pending).
- **Platform scope:** build **all ~50 screens on iPhone** (the canonical set); show **Android chrome on ~8 representative screens** (Splash, Home, Watch, Family, a player, Give, Settings) since content is shared and only the chrome differs (Android = punch-hole camera, ~28px corners, gesture nav bar). Android chrome built by cloning a finished screen and swapping the shell.
- **Build order:** finish **iPhone / light / phone** for every screen first (canonical), then layer Android (key screens), then the **dark** pass (clone + recolour), then **tablet** for the list-heavy screens that actually reflow.
- **Scroll:** the plugin cannot set scroll-overflow; screens are built as tall frames showing the whole screen. Interactive scroll is a one-click toggle in Figma (Overflow: Vertical scrolling).

### Outstanding before/while building the rest
- ~~Apply elevation to the component masters~~ **done**: 60 components (30 light + 30 dark) linked to `Elevation/Box` / `Elevation/Pill`; transparent wrappers (ghost buttons, headers, tab bars, eyebrows, inputs) left flat.
- Wrap Splash + ONB-1 content and add their phone shells.
- Batch B (Auth cluster) is done. Continue Batches C through J (see `SCREENS-CHECKLIST.md`) in iPhone light, then the variant passes. Batch A leftovers HOME (member) and BRANCH-SWITCH still to slot in.
