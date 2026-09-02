// The design token scale from docs/spec/05, exact values. Single source of truth for
// BOTH the mobile ThemeProvider and (later) the dashboard Tailwind config, so app and
// dashboard cannot drift (docs/spec/24 §2.6). No component imports raw values.

export type ThemeName = 'light' | 'dark';

// Fixed brand constants from the mockup's :root; theme-independent. Gradients and
// on-dark elements (tiles, HQ pill text, splash logo) compose from these.
export const palette = {
  ink: '#0e1420',
  gold: '#ffcf4a',
  /** The deeper gold the mockup uses where gold must sit on a light surface
   * (.av gradient, --eye in light). Distinct from `gold`, which fails contrast
   * on cream (05 contrast rule). */
  goldDeep: '#b98600',
  navy: '#14213d',
  blue: '#2f6fed',
  green: '#1f8a5b',
  red: '#e0342c',
} as const;

// Categorical pin colours for the Family map: one per branch so nations read
// apart at a glance (docs/spec/09). Chosen to stay distinct on BOTH the cream
// (light) and near-black (dark) map sea; each pin also carries a stroke for
// contrast. Cycles if there are ever more branches than colours.
export const mapPinPalette = [
  palette.gold,
  palette.blue,
  palette.green,
  '#8b5cf6', // violet: the fourth distinct hue, absent from the brand set
] as const;

// Avatar gradient top colours, one per branch, in the SAME order as
// mapPinPalette so a member's avatar hue matches their map pin (belonging made
// visible, docs/spec/09). The gold slot is the deeper gold, not the bright pin
// gold: avatars carry white initials, and bright gold fails that contrast (see
// palette.goldDeep). The other hues are dark enough for white as-is.
export const branchAvatarPalette = [
  palette.goldDeep,
  palette.blue,
  palette.green,
  '#8b5cf6',
] as const;

// Tonal washes for the action pills (mockup .glory.on, .praybtn.on,
// .praybtn.committed): a translucent tint plus a matching border, layered over
// whatever card surface is underneath, so one set works in both themes.
export const tonal = {
  gold: {
    bg: 'rgba(255,207,74,0.20)',
    border: palette.gold,
  },
  goldSoft: {
    bg: 'rgba(185,134,0,0.14)',
    border: 'rgba(185,134,0,0.42)',
  },
  green: {
    bg: 'rgba(31,138,91,0.14)',
    border: 'rgba(31,138,91,0.40)',
  },
  /** NC's transactional icon disc (mockup `.nci.txn`), the frame's value verbatim. */
  blue: {
    bg: 'rgba(47,111,237,0.12)',
    border: palette.blue,
  },
  /** NC's unread-row wash (mockup `.ncrow.unread`), the frame's value verbatim. */
  blueFaint: {
    bg: 'rgba(47,111,237,0.05)',
    border: 'transparent',
  },
  /** The answered-prayer card (mockup .answered). */
  greenCard: {
    bg: 'rgba(31,138,91,0.10)',
    border: 'rgba(31,138,91,0.35)',
  },
  /**
   * The mockup's `.pill.changes` (MY-POSTS): something is waiting on the author.
   *
   * The frame writes its foreground as `#d0483b`, a hair off `palette.red`. The wash below
   * is the frame's verbatim; the text uses the palette rather than minting a fifth red for
   * a difference nobody can see.
   */
  red: {
    bg: 'rgba(192,57,43,0.14)',
    border: 'rgba(192,57,43,0.40)',
  },
  /**
   * The mockup's `.actrow.danger` (W2.6): the destructive row in a bottom sheet, Delete
   * or Block this member. `palette.red` at 10%, the frame's value verbatim.
   *
   * A second red wash rather than a reuse of the one above, because they are drawn from
   * different reds at different alphas in the mockup and they sit on different things:
   * that one is a small status pill carrying its own text, this one is the full width of
   * a row a thumb is about to land on. It carries no border, because the frame draws
   * none: an `.actrow` is a filled row, never an outlined one.
   */
  redRow: {
    bg: 'rgba(224,52,44,0.10)',
  },
  /**
   * The mockup's `.atrow.live .ad` (W2.8): the icon disc on an attendance row
   * that was credited by watching live. `palette.red` at 12%, the frame's value
   * verbatim, and a wash rather than a fill because it is a quiet marker on a
   * list row, not a warning.
   *
   * Distinct from `redRow` above by two points of alpha, which nobody can see,
   * and kept separate anyway because they mean different things: that one says a
   * row will destroy something, this one says a Sunday was kept from a distance.
   * They will drift the day one of them changes for its own reason.
   */
  redSoft: {
    bg: 'rgba(224,52,44,0.12)',
  },
} as const;

// Colors for content sitting on ink or on a photo (splash, photo heroes). Identical
// in both themes because the surface underneath never changes.
export const onInk = {
  text: '#ffffff',
  /** Body copy on ink, a shade below white: the mockup's `.streakhero .hl`, the
   * encouraging sentence under a streak. Softer than a heading without dropping
   * to `sub`, which is a meta line rather than something to read. */
  body: '#e6ebf3',
  sub: '#9aa6bd',
  link: '#8db4ff',
  scrimTop: 'rgba(14,20,32,0.15)',
  scrimBottom: 'rgba(14,20,32,0.92)',
  /** Flat scrim for controls and status drawn ON a photo: the compose photo's
   * remove disc and its "preparing" overlay (mockup `.shotbox .rm` / `.busy`).
   * Unlike the pair above this is not a gradient stop; it is one wash dark
   * enough for white text and a white glyph to clear contrast over any photo. */
  scrimSolid: 'rgba(14,20,32,0.62)',
} as const;

// The SERMON player's media constants (mockup `.pl-scrub .bar` and `.pl-art`, the
// W3.1 audio frames). Grouped like onInk because none of them sits on a themed
// surface: the scrub track is a neutral grey the mockup keeps identical in both
// themes precisely so the unfilled half reads on cream AND on near-black (a themed
// surface token disappears into one of the two), and the artwork values are drawn
// over an image or over ink. Values are the frames' literals verbatim.
export const media = {
  /** `.pl-scrub .bar` background, behind the gold progress fill. */
  track: 'rgba(128,128,128,0.28)',
  /** `.pl-art.none`: the fallback artwork for a message that was never on
   * YouTube and therefore has no thumbnail at all. */
  artFrom: '#22375f',
  artTo: palette.ink,
  /** `.pl-art .scrim`: the wash over a real thumbnail, which is a VIDEO frame
   * with no video playing. Tuned ON A DEVICE against a real photo, not against
   * the mockup's flat placeholder: 58% made it indistinguishable from the
   * no-thumbnail fallback, and 30% did not read as dimmed at all once a bright
   * thumbnail was behind it. */
  artScrim: 'rgba(14,20,32,0.45)',
  /** `.pl-art .tag`: the pill behind the "Listening" label. */
  tagBg: 'rgba(14,20,32,0.72)',
} as const;

// The scripture card is a CONSTANT cream/gold surface in both themes: the
// mockup's .verse carries no dark override, and the design language names the
// "cream scripture card" as a signature element. Grouped like onInk because the
// surface never changes; values are the mockup's literals verbatim.
export const verseCard = {
  from: '#fbf3dd',
  to: '#f5e8ce',
  border: '#eeddb5',
  text: '#2b2517',
  // W4.7: was #b98600, and at 2.68:1 on the darker end of its own gradient it was
  // the WORST text contrast in the app, on the daily verse card that Home leads
  // with. It failed even the 3:1 large-text bar, and the eyebrow is 12px anyway.
  // Darkened to 4.65 worst. This card is a constant cream surface in both themes,
  // so unlike `color.light.eye` there is no second palette to satisfy.
  eyebrow: '#866100',
  reference: '#7a5b12',
  chipBg: 'rgba(255,255,255,0.72)',
  chipBorder: '#e6d3a4',
} as const;

export interface ColorTokens {
  bg: string;
  /** Alt surface: segmented tracks, icon circles, skeleton base (mockup --alt). */
  alt: string;
  text: string;
  /** Secondary text (mockup --sub). */
  sub: string;
  /** Tertiary/meta text: steps, timestamps, city lines (mockup --muted). */
  muted: string;
  card: string;
  /** The DECORATIVE hairline: a card's edge, a list separator, the bar above the
   * tab bar. It stays deliberately delicate (1.24 to 1.42:1) because a card is
   * identified by its CONTENT, so nothing depends on seeing this line. Where a
   * boundary does carry meaning, use `controlline` instead. */
  cardline: string;
  /** The boundary that IS the control, or its state.
   *
   * Split out of `cardline` at W4.7 (2026-09-02) because one token was doing two
   * jobs across 66 usages, and only one of them carries WCAG 1.4.11's 3:1 for
   * "visual information required to identify user interface components and
   * states". An empty text field, an unchecked checkbox, an unselected radio or
   * chip, an outline button and an OFF switch have nothing but this line to say
   * what they are; at `cardline`'s 1.31:1 on a card they were very nearly not
   * drawn at all. The switch is the sharpest case, because there the token is a
   * FILL rather than a border: `on ? green : this`, so the whole difference
   * between on and off rested on a colour at 1.31:1.
   *
   * Measured to 3:1 against every surface a control sits on (`bg`, `card` and
   * `alt`): worst case 3.03:1 light, 3.00:1 dark. Do not reach for it to make a
   * card stand out; that is what content is for. */
  controlline: string;
  /** Elevated chip on an alt track (the segmented control's active state). In
   * light this IS card (white on beige reads raised by itself); dark needs a
   * genuinely lighter surface, because card on alt is a 3-point difference and
   * the mockup's 10%-alpha shadow is invisible there (fixed 2026-07-21, Ayo's
   * report; mockup + 05 synced in the same change). */
  raised: string;
  band: string;
  bandtext: string;
  /** The hairline that gives a band its edge. `band` is ink in BOTH themes, and
   * in dark the page behind it is the same ink (`bg` and `palette.ink` are both
   * `#0e1420`), so an unbordered band stops reading as a surface and becomes
   * floating text. `05` already states the rule this answers: in dark, borders
   * carry separation, not shadows. Transparent in light, where the ink inverts
   * against a cream page and needs no help; always applied, so a band measures
   * identically in both themes and only its colour changes.
   *
   * Promoted to a token on 2026-08-15 (W3.3 slice 1). It was found twice before
   * that and patched in place twice, in `StatusPanel` (seen on the phone
   * 2026-08-08) and `StreakHero`, while the two other surfaces that needed it,
   * the guest sign-in card and the `Toast`, had no such patch. The splash and
   * the player's media box draw on ink too and are deliberately left without
   * one: the first is full-screen with nothing behind it, and the second always
   * has a player, artwork or the branded gradient inside it. */
  bandline: string;
  accent: string;
  blue: string;
  eye: string;
  count: string;
  /** Primary button + selected-state fill (mockup --btnBg/--btnText). */
  btnBg: string;
  btnText: string;
  /** Family map ocean + landmass (mockup --mapsea/--mapland). The land is a
   * translucent wash over the sea so it reads soft in both themes. */
  mapSea: string;
  mapLand: string;
}

// Values are the mockup's t-light/t-dark CSS variables verbatim (entry-flow.html,
// the design source of truth); 05's tables are kept in sync with these.
export const color: Record<ThemeName, ColorTokens> = {
  light: {
    bg: '#fbf8f3',
    alt: '#f0ece3',
    text: '#14213d',
    sub: '#546077',
    // W4.7: was #8a7f6a, which is 3.35:1 on `alt` where 4.5 is the bar. `muted`
    // carries meta lines, timestamps and city lines at 10 to 14px, so there is no
    // large-text exemption to hide behind. Same hue darkened to 4.66 worst case.
    muted: '#716857',
    card: '#ffffff',
    cardline: '#e8e0d0',
    controlline: '#8c877d',
    raised: '#ffffff',
    band: palette.ink,
    bandtext: '#ffffff',
    bandline: 'transparent',
    accent: palette.gold,
    // A literal rather than `palette.blue`, the way dark already does it. The brand
    // constant stays #2f6fed and goes on carrying map pins, the OTP focus ring and
    // the tonal washes; what moves is only blue AS TEXT on a light page, which was
    // 4.29:1 and is every "See all" link at 12.5px. Now 4.65.
    blue: '#2963d4',
    // W4.7: was #b98600 (palette.goldDeep) at 3.06:1, and `Eyebrow` renders it at
    // 12px bold uppercase, which is not large text. Darkened to 4.63. Deliberately
    // NOT palette.goldDeep any more: that constant still tops the avatar gradient,
    // where it sits under white initials and answers a different question.
    eye: '#896300',
    count: '#896300',
    btnBg: palette.navy,
    btnText: '#ffffff',
    mapSea: '#f4efe4',
    mapLand: 'rgba(20,33,61,0.10)',
  },
  dark: {
    bg: '#0e1420',
    alt: '#141d2a',
    text: '#eef2f8',
    sub: '#aab4c6',
    // W4.7: was #7c8698, which passes on the page (5.02) and fails on a CARD at
    // 4.41, which is where most meta text actually sits. Lightened to 4.65 worst.
    muted: '#808a9c',
    card: '#18212f',
    cardline: '#28323f',
    controlline: '#646b74',
    raised: '#28323f',
    band: palette.ink,
    bandtext: '#ffffff',
    // Same value as `cardline`, and deliberately its own name rather than a
    // reference: a card's hairline and a band's hairline answer to different
    // surfaces and either may move without the other.
    bandline: '#28323f',
    accent: palette.gold,
    // Mockup keeps --blue #2f6fed in dark; 05 deliberately lightens it for contrast
    // on dark cards. Keeping 05's correction (flagged in 05).
    blue: '#5a9bff',
    eye: palette.gold,
    count: palette.gold,
    btnBg: palette.gold,
    btnText: palette.navy,
    mapSea: '#0b111b',
    mapLand: 'rgba(255,255,255,0.07)',
  },
};

// Contrast rule from 05: in LIGHT mode, active states and hero titles are navy/blue,
// never gold-on-light (fails contrast); gold carries accents on dark or navy surfaces.

// Font family names = the ttf PostScript names (files in apps/mobile/assets/fonts are
// named identically), so Android (filename) and iOS (embedded name) agree.
export const fontFamily = {
  display: {
    bold: 'BricolageGrotesque-Bold',
    extraBold: 'BricolageGrotesque-ExtraBold',
  },
  body: {
    regular: 'HankenGrotesk-Regular',
    medium: 'HankenGrotesk-Medium',
    semiBold: 'HankenGrotesk-SemiBold',
    bold: 'HankenGrotesk-Bold',
    // The mockup's font-weight:800 on body text (tags, the Glory/WhatsApp pills,
    // primary buttons, map avatars). Body's Bold is 700, so 800 needs its own file.
    extraBold: 'HankenGrotesk-ExtraBold',
  },
} as const;

// 05 gives ranges (hero 30-36, section 22-26, card 17-19, body 15-16, label 12-13);
// these are the canonical mid-values. Deviate per screen only within the 05 range.
export const typeScale = {
  hero: { fontFamily: fontFamily.display.extraBold, fontSize: 32 },
  section: { fontFamily: fontFamily.display.extraBold, fontSize: 24 },
  cardTitle: { fontFamily: fontFamily.display.bold, fontSize: 18 },
  body: { fontFamily: fontFamily.body.regular, fontSize: 15 },
  bodyMedium: { fontFamily: fontFamily.body.medium, fontSize: 15 },
  bodySemiBold: { fontFamily: fontFamily.body.semiBold, fontSize: 15 },
  label: {
    fontFamily: fontFamily.body.bold,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
} as const;

// Spacing scale from 05: 4, 8, 12, 16, 20, 24, 32, 40, 56. gutter = horizontal screen
// padding (05: 18-20).
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  x2l: 24,
  x3l: 32,
  x4l: 40,
  x5l: 56,
  gutter: 20,
  /** Gap between the status bar (safe-area bottom) and a screen's first row.
   * The mockup's .stitle/.chead sit 88px from the FRAME top (36px stylized
   * status bar + 52px padding). A real status inset is ~50-60px, so it already
   * covers most of that: inset + these 16 + the title row's own 12 lands the
   * title at ~80-88px from the screen top, matching the mockup's geometry.
   * (Tuned 2026-07-21: 0 felt glued to the bar, a literal +52 doubled it.) */
  screenTop: 16,
} as const;

// Radius from 05 (cards 16-22, pills/buttons 12-14, full for chips/avatars); named by
// use, values match the mockup's per-component radii.
export const radius = {
  control: 12,
  button: 14,
  cardTight: 16,
  card: 18,
  cardHero: 22,
  full: 999,
} as const;

/**
 * Icon sizes (05 §Iconography, added 2026-08-11).
 *
 * Derived from what the mockup already drew, not invented: 18 and 20 carried 205 of
 * its 323 icon SVGs, and the rest fell into four clusters. Before this, call sites
 * used FOURTEEN distinct sizes (12, 13, 14, 15, 16, 17, 18, 19, 20, 26, 28, 30, 40,
 * 42), several traced one screen at a time from arbitrary CSS values. 13 vs 14 vs 15
 * is not a design decision anybody made; it is drift, and it reads as "slightly off"
 * long before anyone can point at which glyph is wrong.
 *
 * A glyph picks the token for its ROLE. Sizes never appear as raw numbers in a screen.
 */
export const icon = {
  /** Inline meta and badge glyphs sitting in a line of text. */
  xs: 12,
  /** Dense rows, pills, small counters. */
  sm: 14,
  /** Compact controls. */
  md: 16,
  /** THE DEFAULT: menu-row tiles, buttons, the tab bar. */
  lg: 18,
  /** Headers, nav, primary controls. */
  xl: 20,
  /** Feature disc: the auth header, branch tiles, the notification ask. */
  x2l: 26,
  /** Empty states, the avatar picker, the player's primary transport. */
  x3l: 30,
  /** Hero status: success, post-pending, the update gate. */
  x4l: 40,
} as const;

// Motion from 05: gentle, 150-250ms ease; reduced-motion variants are mandatory.
export const motion = {
  fast: 150,
  base: 200,
  slow: 250,
} as const;

// Accessibility floor (05 + the responsiveness rules): never render tappable text below
// 12; hit targets 44 minimum, 48 preferred.
export const hitTarget = { min: 44, preferred: 48 } as const;

/**
 * The toggle knob (mockup `.switch i`), CONSTANT in both themes like the verse card's
 * surface above: the track carries the state (green on, hairline off) and the knob reads as
 * a physical thing sliding on it, so theming it would make the control ambiguous rather
 * than consistent. Track colours come from `palette.green` and the theme's `cardline`.
 */
export const control = {
  knob: '#ffffff',
  knobShadow: 'rgba(0,0,0,0.25)',
} as const;

export const tokens = {
  palette,
  onInk,
  verseCard,
  control,
  color,
  fontFamily,
  typeScale,
  spacing,
  radius,
  icon,
  motion,
  hitTarget,
} as const;
