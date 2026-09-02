import { color, onInk, palette, verseCard, type ThemeName } from '@agbc/shared/theme';

/**
 * The contrast contract for the design tokens (W4.7 slice 2, `05` accessibility
 * contract, WCAG 2.2 SC 1.4.3 and 1.4.11).
 *
 * WHY THIS EXISTS. Six token values shipped for months under the bar and nobody
 * could have seen it, because contrast is not what a screenshot review catches:
 * light `muted` was 3.35:1 on `alt`, light `blue` 4.17:1, light `eye` 3.06:1,
 * dark `muted` 4.41:1 on a card, `controlline` did not exist so an empty text
 * field was outlined at 1.31:1, and the daily verse card's eyebrow was 2.68:1 on
 * its own cream, which failed even the large-text bar. Every one was found by
 * computing the pairs rather than by looking at them.
 *
 * A number checked by hand is a number that drifts, so the check lives here,
 * where being wrong is a red build. It is written to FAIL: move any value in
 * `packages/shared/src/theme` below its threshold and the pair is named.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  return (
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16))
  );
}

export function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * SC 1.4.3 body text. The app renders `muted`, `blue`, `eye` and `count` at 10
 * to 14px and the eyebrow at 12px bold, so nothing here qualifies for the 3:1
 * large-text allowance (which needs 18.66px bold or 24px regular).
 */
const BODY_TEXT = 4.5;
/** SC 1.4.11: information required to identify a control or its state. */
const NON_TEXT = 3;

/** Every surface a run of text or a control can land on. */
const SURFACES = ['bg', 'card', 'alt'] as const;
const TEXT_TOKENS = ['text', 'sub', 'muted', 'blue', 'eye', 'count'] as const;

const themes: ThemeName[] = ['light', 'dark'];

describe.each(themes)('%s theme', (theme) => {
  const c = color[theme];

  // One case per pair rather than a loop inside one test: a failure then names
  // the surface, and `muted` proved that matters by passing on the page and
  // failing on a card.
  describe.each(TEXT_TOKENS)('%s as text', (token) => {
    test.each(SURFACES)('reads on %s', (surface) => {
      expect(contrast(c[token], c[surface])).toBeGreaterThanOrEqual(BODY_TEXT);
    });
  });

  test('text on the ink band', () => {
    expect(contrast(c.bandtext, c.band)).toBeGreaterThanOrEqual(BODY_TEXT);
    expect(contrast(c.accent, c.band)).toBeGreaterThanOrEqual(BODY_TEXT);
  });

  test('a primary button labels itself', () => {
    expect(contrast(c.btnText, c.btnBg)).toBeGreaterThanOrEqual(BODY_TEXT);
  });

  describe('controlline: the boundary that IS the control', () => {
    test.each(SURFACES)('is visible on %s', (surface) => {
      expect(contrast(c.controlline, c[surface])).toBeGreaterThanOrEqual(
        NON_TEXT,
      );
    });
  });

  test('a selected control is no weaker than an unselected one', () => {
    // `btnBg` fills the selected radio, checkbox and option outline. If it ever
    // dropped below the unselected state, selection would read as the fainter of
    // the two, which is backwards.
    for (const surface of SURFACES) {
      expect(contrast(c.btnBg, c[surface])).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });

  test('the OTP focus ring is visible on the field it sits in', () => {
    // `palette.blue`, not `c.blue`: the focus ring keeps the brand blue in both
    // themes, and it is a boundary rather than text, so 3:1 is its bar.
    expect(contrast(palette.blue, c.card)).toBeGreaterThanOrEqual(NON_TEXT);
  });

  /**
   * THE DELIBERATE EXEMPTION, asserted so it stays deliberate.
   *
   * `cardline` and `bandline` sit below 3:1 and stay there. 1.4.11 covers what is
   * REQUIRED to identify a component, and a card is identified by the heading,
   * body and chevron inside it. Raising these would turn a cream hairline into
   * mid-grey and re-weight every card, band, sheet and toast in the app (decided
   * with Ayo, 2026-09-02).
   *
   * Asserted the way round that matters: if somebody later points `cardline` at a
   * real control boundary and raises it to compensate, this goes red and sends
   * them to `controlline` instead.
   */
  test('the decorative hairline stays decorative', () => {
    expect(contrast(c.cardline, c.card)).toBeLessThan(NON_TEXT);
    if (c.bandline !== 'transparent') {
      expect(contrast(c.bandline, c.band)).toBeLessThan(NON_TEXT);
    }
  });
});

// The verse card is a constant cream surface in BOTH themes, so it is checked
// once, against both ends of its own gradient.
describe('the daily verse card (constant in both themes)', () => {
  test.each([verseCard.from, verseCard.to])('reads on %s', (surface) => {
    expect(contrast(verseCard.text, surface)).toBeGreaterThanOrEqual(BODY_TEXT);
    expect(contrast(verseCard.eyebrow, surface)).toBeGreaterThanOrEqual(
      BODY_TEXT,
    );
    expect(contrast(verseCard.reference, surface)).toBeGreaterThanOrEqual(
      BODY_TEXT,
    );
  });
});

// Content drawn on ink (the splash, photo heroes, the streak hero), identical in
// both themes because the surface underneath never changes.
describe('text on ink', () => {
  test.each(['body', 'sub', 'link'] as const)('%s', (token) => {
    expect(contrast(onInk[token], palette.ink)).toBeGreaterThanOrEqual(
      BODY_TEXT,
    );
  });
});
