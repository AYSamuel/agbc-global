// The design token scale from docs/spec/05, exact values. Single source of truth for
// BOTH the mobile ThemeProvider and (later) the dashboard Tailwind config, so app and
// dashboard cannot drift (docs/spec/24 §2.6). No component imports raw values.

export type ThemeName = 'light' | 'dark';

export interface ColorTokens {
  bg: string;
  alt: string;
  util: string;
  line: string;
  text: string;
  muted: string;
  card: string;
  cardline: string;
  band: string;
  bandtext: string;
  accent: string;
  blue: string;
  eye: string;
  count: string;
}

export const color: Record<ThemeName, ColorTokens> = {
  light: {
    bg: '#fbf8f3',
    alt: '#ffffff',
    util: '#f0ebe1',
    line: '#e5ddcf',
    text: '#14213d',
    muted: '#546077',
    card: '#ffffff',
    cardline: '#e8e0d0',
    band: '#14213d',
    bandtext: '#ffffff',
    accent: '#ffcf4a',
    blue: '#2f6fed',
    eye: '#2f6fed',
    count: '#2f6fed',
  },
  dark: {
    bg: '#0e1420',
    alt: '#0e1420',
    util: '#0a0f18',
    line: 'rgba(255,255,255,0.06)',
    text: '#ffffff',
    muted: '#98a1b2',
    card: '#17202f',
    cardline: 'rgba(255,255,255,0.08)',
    band: '#0a0f18',
    // 05's dark table omits bandtext; band is near-black, so white text (inferred).
    bandtext: '#ffffff',
    accent: '#ffcf4a',
    blue: '#5a9bff',
    eye: '#ffcf4a',
    count: '#ffcf4a',
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

// Motion from 05: gentle, 150-250ms ease; reduced-motion variants are mandatory.
export const motion = {
  fast: 150,
  base: 200,
  slow: 250,
} as const;

// Accessibility floor (05 + the responsiveness rules): never render tappable text below
// 12; hit targets 44 minimum, 48 preferred.
export const hitTarget = { min: 44, preferred: 48 } as const;

export const tokens = {
  color,
  fontFamily,
  typeScale,
  spacing,
  radius,
  motion,
  hitTarget,
} as const;
