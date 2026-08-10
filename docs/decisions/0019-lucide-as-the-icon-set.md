# 0019 · Lucide as the icon set, delivered as SVG behind one facade

- Status: accepted
- Date: 2026-08-11
- Spec: `docs/spec/05-DESIGN-SYSTEM.md` §Iconography
- Touches: `apps/mobile/src/components/ui/icons.tsx`, `apps/mobile/src/components/ui/Menu.tsx`, `docs/spec/design/mockups/entry-flow.html`

## Context

The app drew its glyphs two different ways, and neither was a system.

Most were hand-authored `react-native-svg` components in `icons.tsx`, traced one screen
at a time from the mockup. The menu-row tiles on MORE and SETTINGS were **emoji**, which
the mockup also specified.

Both had been growing for months and the costs had become measurable rather than
theoretical.

**The hand-drawn set was drifting.** The mockup carried 59 distinct glyphs for what were
really 45 icons: three different checkmarks (`M20 6L9 17l-5-5`, `M5 12l5 5 9-11`,
`M5 12.5l4.5 4.5L19 7`), two bells differing only in an arc sweep flag, three clocks
differing only in radius. Nobody decided any of that. Each was a separate tracing on a
separate day. Hand-drawing every new glyph guarantees more of it.

**The emoji were not ours to control.** Emoji are supplied by the operating system, so
the same row rendered in Apple's set on iOS, Samsung's on One UI and Noto's on a Pixel.
They cannot take a theme token: on dark, the graduation cap sank into its own tile while
the pin and calendar fired saturated red through a navy and gold palette. Their artwork
changes on an OS update. `ℹ️` and `✉️` are text-presentation codepoints forced to emoji
with a variation selector, and fall back to monochrome glyphs on some Android font
stacks. For a screen that is nine rows of glyph-plus-label, that was the whole visual
identity of the screen outside the design system.

The decisive finding came from comparing path data rather than reasoning about it: the
hand-drawn glyphs were **already Feather's**. `check`, the three chevrons, `plus`,
`minus` and `x` were byte-identical to it. Whoever drew the mockup was working from
Feather's vocabulary without naming it.

## Decision

**Adopt Lucide (ISC), consumed as SVG, as the app's single icon set.** Lucide is
Feather's maintained successor: same 24px grid, same round caps, same `currentColor`
stroke language, ~1,700 glyphs against Feather's 287.

Three rules hold it together.

1. **One facade.** Every glyph is a named export of
   `apps/mobile/src/components/ui/icons.tsx`, wrapped by a single `houseStyle()` helper
   that applies 05's 1.8 stroke and the 20px default. Screens import `XIcon` from there
   and never from `lucide-react-native` directly, so the house geometry lives in one
   place and the underlying pack stays swappable.
2. **Deep imports only** (`lucide-react-native/icons/<kebab-name>`). Metro does not
   tree-shake the package barrel, so importing from the package root would pull all
   ~1,700 icons into the bundle. The package publishes `./icons/*` for this.
3. **No emoji in chrome.** Emoji stay fine in CONTENT (a member's testimony). They are
   not a UI glyph.

The mockup moved in the same change. `entry-flow.html` is the design source of truth, so
leaving it on the old glyphs would have inverted that: 418 inline SVGs and 24 `.mic`
tiles were rewritten, and `05` was synced.

## Consequences

**Good.**

- One vocabulary. The 59-into-45 collapse happened as a side effect: there is now exactly
  one checkmark, one bell, one clock.
- Professionally drawn geometry with consistent optical weight, instead of per-day
  tracings.
- Both themes and every size come free: the glyphs take `currentColor` from tokens.
- Adding a glyph is now a decision about which glyph, not an afternoon of drawing one.
- No native module. `lucide-react-native` is pure JS over `react-native-svg`, which was
  already linked, so this did **not** trip the dev-client native fence and needed no EAS
  rebuild. Verified on device.

**Costs and risks.**

- A third-party dependency now owns the app's visual vocabulary. The facade is the
  mitigation: swapping packs is one file, not sixty.
- `MenuRow`'s `icon` prop changed from `string` to `ComponentType<IconProps>`. A breaking
  change to a shared component, taken deliberately so the row owns size and colour.
- Twenty-nine glyphs changed appearance. Most are refinements; the visible ones are the
  Home tab (gains a door), the Watch tab (play triangle outlined rather than filled) and
  the church (gains a cross). Reviewed on device in both themes before landing.
- Lucide's `absoluteStrokeWidth` is deliberately NOT used. It holds stroke at a constant
  screen width across sizes, which is heavier than the mockup, whose SVGs scale stroke
  with the glyph. Leaving it off is what keeps the identical glyphs pixel-identical.
- Jest needed a `moduleNameMapper`: `jest-expo` does not transform ESM from
  `node_modules`, so the deep `.mjs` imports broke 27 suites until tests were pointed at
  the package's CJS build.

## Alternatives considered

**Keep hand-drawing.** Rejected: this is the status quo that produced three checkmarks,
and it scales with screens built rather than with glyphs needed.

**An icon font, e.g. `@expo/vector-icons`.** Rejected, and `icons.tsx` had already
written the rule down before this ADR ("never import an icon font"). The whole font ships
for eight glyphs; glyphs sit on a text baseline so vertical centring is permanently
fiddly; they scale with `fontSize`; no partial fill; tofu before the font loads.

**Material Symbols.** A good set, and usable in React Native as SVG. Rejected on fit:
Material is Google's design language, geometric and heavier, and adopting it would mean
redrawing all 419 glyphs in the mockup rather than converging on what it already was.
(`@mui/icons-material` was never an option: it renders DOM `<svg>` and cannot run in
React Native.)

**Copy Lucide's path data in rather than depending on the package.** Genuinely close.
Rejected because the facade already gives the isolation that a copy would buy, while a
real dependency keeps ~1,700 glyphs available for screens not yet built, and tree-shakes
to the same bundle either way.

## Follow-ups

- Icon SIZES are still ad hoc: 14 distinct values across the call sites, several traced
  from arbitrary mockup numbers (13, 15, 17, 19). A token scale is the obvious next step
  and is deliberately NOT in this change, because snapping them is a visual change to the
  mockup rather than a mechanical one.
