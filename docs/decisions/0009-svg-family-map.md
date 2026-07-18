# 0009 · SVG world map for the Family tab

- Status: accepted
- Date: 2026-07-12 (backfilled 2026-07-18, W0.2)
- Spec: `docs/spec/09-FEATURE-Family.md`, `docs/spec/01-ARCHITECTURE.md`

## Context

The global family map (branch pins + testimony pins) could use a native map SDK (Google/Apple/Mapbox: API keys, billing, network tiles) or a stylized vector map.

## Decision

`react-native-svg` rendering bundled topojson. No map vendor, no tiles, no keys, works offline, themes with the design tokens in both light and dark.

## Consequences

- Zero cost and offline-safe; the map is decorative-informative, not navigational (no zoom-to-street, which we don't need).
- Projection/pin math is ours; lat/lng come from the branch seed augmentation map (`02`).
