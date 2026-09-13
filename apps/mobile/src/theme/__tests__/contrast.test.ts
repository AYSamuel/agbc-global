import {
  color,
  onInk,
  palette,
  shareCard,
  verseCard,
  type ThemeName,
} from '@agbc/shared/theme';

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

/**
 * A translucent colour laid over an opaque one, as the hex it actually becomes.
 *
 * Needed since W4.15: a share card's footer address is `rgba(255,255,255,0.62)`, and an
 * alpha is not a colour until something is behind it. Measuring the stated value instead
 * would report white's contrast and pass everything.
 */
function over(translucent: string, background: string): string {
  const parts = /rgba?\(([^)]+)\)/.exec(translucent);
  if (!parts) return translucent;
  const [r, g, b, a = '1'] = parts[1].split(',').map((v) => v.trim());
  const bg = background.replace('#', '');
  const mix = (channelValue: string, index: number) =>
    Math.round(
      Number(channelValue) * Number(a) +
        parseInt(bg.slice(index * 2, index * 2 + 2), 16) * (1 - Number(a)),
    )
      .toString(16)
      .padStart(2, '0');
  return `#${mix(r, 0)}${mix(g, 1)}${mix(b, 2)}`;
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

/**
 * THE SHARE CARDS (W4.15), and the reason they need their own block: they are not
 * theme-aware and never will be, so `color[theme]` says nothing about them. A card is a
 * PNG that leaves the app and is read in somebody else's chat, at thumbnail size, which
 * makes this the one surface where poor contrast cannot be fixed after it ships.
 *
 * FOUR OF THESE VALUES ARE CONTRAST CORRECTIONS and this is what stops them being tidied
 * back: measured against the darker end of their own gradient, `gold.kickerLabel` was
 * 3.33:1, `gold.attributionSub` and `gold.url` 3.77 and `cream.url` 3.72 when the frames
 * were first drawn. A gold ground is the brightest surface in the app and looks more
 * legible than it measures, which is exactly why a human pass keeps missing it.
 */
describe('the share cards (constant, because they leave the app)', () => {
  const grounds = [
    ['cream', shareCard.ground.cream],
    ['ink', shareCard.ground.ink],
    ['gold', shareCard.ground.gold],
  ] as const;

  describe.each(grounds)('%s', (_name, ground) => {
    // Every hex text colour on this ground, against both ends of its gradient.
    //
    // The exclusions are not text on the ground: `from`/`to` ARE the ground, `border` and
    // `footLine` are hairlines (decorative, the `cardline` argument above), `kickerIcon`
    // is a glyph beside a label that says the same words, and the mark tile paints its own
    // surface, so both of its colours are measured against each other in their own test.
    // `url` on ink is translucent and is handled below, where the compositing is spelled
    // out.
    const texts = Object.entries(ground).filter(
      ([key, value]) =>
        value.startsWith('#') &&
        ![
          'from',
          'to',
          'border',
          'footLine',
          'kickerIcon',
          'markBackground',
          'markText',
        ].includes(key),
    );

    test.each(texts)(
      '%s reads on both ends of the gradient',
      (_key, colour) => {
        expect(contrast(colour, ground.from)).toBeGreaterThanOrEqual(BODY_TEXT);
        expect(contrast(colour, ground.to)).toBeGreaterThanOrEqual(BODY_TEXT);
      },
    );
  });

  test('the translucent address on ink still reads', () => {
    // `rgba(255,255,255,0.62)` is not a colour until it is over something, so it is
    // composited onto the ground first. The lighter end of the gradient is the harder of
    // the two for white to sit on.
    expect(
      contrast(
        over(shareCard.ground.ink.url, shareCard.ground.ink.from),
        shareCard.ground.ink.from,
      ),
    ).toBeGreaterThanOrEqual(BODY_TEXT);
  });

  test('the QR is a machine-readable target, not a themed element', () => {
    // Navy on white whatever card it sits on, which is the lesson commit 4278341 paid for
    // when the dashboard's MFA QR took the dark surface behind it and stopped scanning.
    expect(
      contrast(shareCard.qrModules, shareCard.qrBackground),
    ).toBeGreaterThanOrEqual(7);
  });

  test('the mark tile labels itself on both of its grounds', () => {
    expect(
      contrast(shareCard.onAccent, shareCard.accent),
    ).toBeGreaterThanOrEqual(BODY_TEXT);
    expect(
      contrast(
        shareCard.ground.gold.markText,
        shareCard.ground.gold.markBackground,
      ),
    ).toBeGreaterThanOrEqual(BODY_TEXT);
  });

  /**
   * THE PHOTO GROUND IS NOT ASSERTED HERE, and the reason is worth more than an
   * assertion would be: its ground is a photograph nobody has vetted, so no pair of
   * tokens can be measured. What protects the words is the SCRIM, and the scrim is
   * measurable: at the foot, where all of a photo card's text sits, it is 94% ink, so
   * even over pure white the attribution reads at 9.89:1 and the address at 8.06:1.
   *
   * ONE PLACE THAT IS NOT TRUE, measured 2026-09-12 and left for W4.15 slice 2 to answer
   * rather than fixed here: the KICKER sits at the TOP, where the scrim is only 30%. Over
   * a bright photograph (a white wall, an overexposed sky) the gold kicker measures
   * 1.35:1. The frames could not show this because they render the photo grounds as a
   * flat placeholder.
   */
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
