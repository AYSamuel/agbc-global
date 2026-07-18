# Design Spec: Family Map

The signature surface of the wedge. One glance should say **"one family, many nations."** This spec turns the 5-line Map section in `09` into something buildable, grounded in the `05` tokens and a11y contract and the resolved tech direction (react-native-svg stylized map with bundled geometry, no map tiles, no API keys, works offline).

## Where it lives
`FAMILY` (Tab 3) → **Map** sub-tab (segmented: Testimonies · Prayer · Map). Inherits the screen's persistent **scope toggle** (My branch · Everywhere, default **Everywhere**).

## Anatomy (layered, top to bottom)
1. **Family header** + segmented sub-tabs + scope toggle (shared across the three Family sub-tabs).
2. **Map canvas** (full-bleed below the controls): the stylized world + pins.
3. **Map control cluster** (overlay, bottom-right): zoom `+` / `-` and a **Find my branch** recenter button. All ≥44px.
4. **"The family, lately" sheet** (draggable bottom sheet, peek by default): a scrollable list of recent testimonies and branches. This is both a browse affordance and the accessible alternative to the map (see Accessibility).

## The map (visual)
- **Stylized SVG world**, not cartographic tiles: simplified continent geometry bundled in the app. Calm and brand-flavored, not data-dense.
- **Palette (from `05`):** sea = `bg` cream (`#fbf8f3`) in light / `#0e1420` in dark; land = a soft navy-tint raised surface (`card`/`util`); coastlines = `line` hairlines. The pins carry the color, the map stays quiet.
- No labels/graticule clutter; optional very subtle latitude lines. Geographic precision is not the point; the feeling of a connected family is.

## Pins
**Branch pins (permanent):** gold `accent` markers with a navy outline/halo (gold-on-cream fails contrast per the `05` rule, so pins always carry a navy edge to read on sea, land, and in both themes). Larger than testimony pins; labeled at closer zoom. The user's **home branch** gets a distinct ring. Source: `branches.lat/lng` from the augmentation seed (`02`/`22`).

**Testimony pins (recent, ephemeral):** smaller `blue` dots for recent **approved** testimonies (recency window ~30 days; cap the most recent ~200, cluster the rest). Positioned at the testimony's **branch/city** location with **deterministic jitter** derived from the testimony id, so multiple pins at one city fan out predictably AND an exact location is never revealed (privacy, below).

**Scope:**
- **Everywhere:** all branch pins + testimony pins; camera fits to show all nations on open.
- **My branch:** the home branch is emphasized (others dimmed), testimony pins filtered to that branch.

## Clustering
- When testimony pins overlap at the current zoom, collapse them into a **count bubble** ("12"), sized by count. Tap a cluster → zoom to expand, or open the sheet scoped to that cluster.
- **Branch pins never cluster away** (always individually visible); only testimony pins cluster.
- Rule: distance/grid-based at the current zoom; world zoom clusters per city.

## Interactions
- **Pan:** bounded to world extents (no drifting into empty space); rubber-band at edges.
- **Zoom:** pinch + double-tap; min = whole-world fit, max = city level (no street detail needed). The `+`/`-` buttons exist because pinch is inaccessible to some users.
- **Tap branch pin** → `BRANCH-INFO`.
- **Tap testimony pin** → a small **preview peek** (branch, snippet, time, Glory count) → tap through to `TESTIMONY-DETAIL`. Anonymous testimonies show "A member of {branch}", no name or avatar.
- **Tap cluster** → zoom/expand or open the scoped sheet.
- **Find my branch** recenters and briefly highlights the home-branch pin.
- **Idle delight (optional):** a soft pulse on the single most-recent testimony pin. Respect reduced motion (static highlight, no pulse).

## "The family, lately" sheet (browse + accessibility)
- Draggable bottom sheet: **peek** (handle + one row) → **half** → **full**. On tablet it becomes a persistent side panel (see Responsiveness).
- Rows: recent testimonies (branch, snippet, relative time, Glory count) interleaved with branch entries. Tapping a row focuses/opens the matching pin or detail.
- This list is the **primary assistive-technology path** through the map's content.

## States
- **Loading:** the map geometry renders instantly (bundled, offline-ready); branch pins show; the sheet shows skeleton rows while testimony pins load.
- **Empty (cold start, no testimonies yet):** branch pins still render (seeded), so the map is never bare. Copy: *"The family is gathering. Be the first to share what God has done."* + compose CTA.
- **Error (testimony pins failed):** map + branch pins remain; an inline retry chip: *"We couldn't load recent testimonies. Retry."*
- **Offline:** bundled map + branch pins + last-cached testimony pins render; quiet banner *"Offline. Showing the latest we saved."*; live updates paused.

## Realtime
- A newly approved testimony drops a pin in with a gentle animation (reduced motion: appears statically) and prepends to the sheet. Batch visual drops if several arrive at once, so it never strobes.

## Privacy & safety (load-bearing)
- Only **approved** testimonies are ever plotted (never pending).
- Location is **branch/city level with deterministic jitter**, never the member's device GPS. Testimony photo EXIF/GPS is stripped server-side (`20` A3); the map never touches user coordinates.
- **Anonymous** testimonies are plotted but the preview shows "A member of {branch}", no name, no avatar.
- **Blocked** members' pins are suppressed for the blocker (server-filtered feed, `09`/`02`).

## Responsiveness (full tablet layouts per `05`)
- **Phone:** full-bleed map; the list is a draggable bottom sheet.
- **Tablet (≥600dp):** master-detail. Map is the main canvas; "The family, lately" becomes a persistent right-hand panel (~360px). Landscape supported.
- **200% text:** list text scales freely (min-height rows, never clipped); the map leans on the list rather than cramming labels; all controls stay ≥44px.
- **Touch targets:** every pin has a ≥44px hit area even when the visual dot is small.

## Accessibility contract (per `05`)
- The map canvas is exposed as a single summarized image, not a field of focusable pins: *"The AGBC family across {n} nations, with {m} recent testimonies. Explore the list below."*
- **The sheet/list is the accessible route:** each row reads *"Testimony from {branch}, {time}: {snippet}. Double tap to open."*
- Scope toggle + sub-tabs: role tab/tablist, selected state announced.
- Reduced motion: no pin-drop or pulse; static treatments.
- Contrast: pins always carry a navy outline so gold/blue read on both sea and land, light and dark.

## Performance
- Bundled simplified geometry (small path set); zero network for the base map.
- Cap rendered testimony pins (~200 most recent); cluster the remainder; virtualize the list.
- Jitter is computed once from the testimony id (stable across renders).

## Analytics (snake_case; props: `branch_id`, `scope`, `locale`)
- `family_map_opened`
- `map_scope_changed` `{scope}`
- `map_pin_tapped` `{pin_type: branch|testimony}`
- `map_cluster_expanded`
- `map_list_opened`

## Copy
- Empty: "The family is gathering. Be the first to share what God has done."
- Offline: "Offline. Showing the latest we saved."
- Error (pins): "We couldn't load recent testimonies."
- Map summary (AT): "The AGBC family across {n} nations, with {m} recent testimonies. Explore the list below."

## Open questions to tune with real data
1. Recency window (default 30 days) and pin cap (default ~200).
2. First-open camera: recommend world-fit (Everywhere) with a Find-my-branch control, rather than auto-centering the home branch.
3. Testimonies only on the map (recommended, keeps the celebratory tone); prayers stay in the Prayer feed. Confirm you don't want prayer pins too.
