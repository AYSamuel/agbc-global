import '@/i18n';

import { render, screen } from '@testing-library/react-native';

import { ThemeScope, type ThemeName } from '@/theme';

import type { VerseShareContent } from '../content';
import { CARD_RENDER_DP } from '../geometry';
import { SHARE_ORIGIN } from '../links';
import { ShareCard } from '../ShareCard';

/**
 * The verse card itself (W4.15 slice 1), and the three rules on it that a later session
 * could undo without noticing.
 *
 * The card's LOOK is not tested here and cannot be: this renders an element tree, not
 * pixels, and the frame it is built from is `entry-flow.html`'s `CARD · daily verse`,
 * diffed by eye against a render. What is here is the handful of decisions that have a
 * consequence a diff would not show.
 */

jest.mock('react-native-qrcode-svg', () => {
  const { Text: RNText } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({ value }: { value: string }) => (
      <RNText testID="qr-target">{value}</RNText>
    ),
  };
});

// The card can carry a testimony photo, which reaches the storage client. The verse has
// none; the mock only stops the import constructing a real client (src/lib/supabase throws
// without EXPO_PUBLIC_* config).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const VERSE: VerseShareContent = {
  kind: 'verse',
  text: 'And my God will supply every need of yours',
  reference: 'Philippians 4:19',
  translation: 'WEB',
};

async function renderCard(theme: ThemeName = 'light') {
  await render(
    <ThemeScope name={theme}>
      <ShareCard content={VERSE} onReady={() => undefined} />
    </ThemeScope>,
  );
}

/**
 * The card hides itself from assistive tech, so every query here has to ask for hidden
 * elements. That is not a testing inconvenience to route around: the card exists to be
 * rasterised and is never read by anybody, and the first test below asserts it.
 */
const HIDDEN = { includeHiddenElements: true } as const;

/**
 * Every node in the rendered tree, read off `toJSON()`.
 *
 * The two tests below are about a property of the WHOLE card rather than of one element,
 * and RNTL v14 has no by-type query to reach for. The rendered JSON is public API and does
 * not depend on the library's internals. The node shape is declared here rather than
 * imported from `react-test-renderer`, whose types this workspace does not install.
 */
interface RenderedNode {
  type: string;
  props: Record<string, unknown>;
  children: (RenderedNode | string)[] | null;
}

function everyNode(node: RenderedNode | string): RenderedNode[] {
  if (typeof node === 'string') return [];
  return [node, ...(node.children ?? []).flatMap(everyNode)];
}

function rendered(): RenderedNode[] {
  const tree = screen.toJSON() as RenderedNode | RenderedNode[] | null;
  if (tree === null) throw new Error('nothing rendered');
  return Array.isArray(tree) ? tree.flatMap(everyNode) : everyNode(tree);
}

describe('the verse share card', () => {
  it('carries the scripture, its reference and the way back to us', async () => {
    await renderCard();

    expect(screen.getByText('Verse of the day', HIDDEN)).toBeTruthy();
    expect(
      screen.getByText('“And my God will supply every need of yours”', HIDDEN),
    ).toBeTruthy();
    expect(screen.getByText('Philippians 4:19 · WEB', HIDDEN)).toBeTruthy();
    expect(screen.getByText('AGBC Global', HIDDEN)).toBeTruthy();
  });

  it('is invisible to a screen reader, because it is a thing to be rasterised', async () => {
    await renderCard();

    // Without the default query finding nothing, there would be a hidden card in the
    // element tree that assistive tech could wander into while the member is looking at a
    // sheet about something else.
    expect(screen.queryByText('Verse of the day')).toBeNull();
  });

  it('prints the address the QR opens, and the QR opens the app page', async () => {
    await renderCard();

    // THE ONE ELEMENT A RECIPIENT CAN ACT ON, and the printed line beside it, are one
    // fact: the label is derived from `SHARE_ORIGIN` rather than typed a second time,
    // so a card can never advertise one address and scan to another. The verse has no
    // page of its own, so its code opens the app's landing page (links.ts), and it does
    // so on `www`: the apex 308-redirects and can never open the app.
    expect(screen.getByTestId('qr-target', HIDDEN)).toHaveTextContent(
      'https://www.agbcglobal.com/app',
    );
    expect(screen.getByText('agbcglobal.com', HIDDEN)).toBeTruthy();
    expect(SHARE_ORIGIN).toBe('https://www.agbcglobal.com');
  });

  it('never follows the device font scale', async () => {
    await renderCard();

    // Every other surface in this app scales to 200% and must. This one is a fixed 1080
    // canvas, and at 200% the words would simply leave the picture (plan §6). One Text
    // left scaling is enough to push the footer off a card, so the rule is asserted over
    // ALL of them rather than on the quote alone.
    // The QR stand-in at the top of this file renders a Text of its own; it is scaffolding,
    // not part of the card.
    const texts = rendered().filter(
      (node) => node.type === 'Text' && node.props.testID !== 'qr-target',
    );
    expect(texts.length).toBeGreaterThan(3);
    for (const node of texts) {
      expect(node.props.allowFontScaling).toBe(false);
    }
  });

  it('looks identical in dark, because it leaves the app', async () => {
    await renderCard('light');
    const light: unknown = screen.getByText('Philippians 4:19 · WEB', HIDDEN)
      .props.style;

    await screen.rerender(
      <ThemeScope name="dark">
        <ShareCard content={VERSE} onReady={() => undefined} />
      </ThemeScope>,
    );
    const dark: unknown = screen.getByText('Philippians 4:19 · WEB', HIDDEN)
      .props.style;

    // NOT THEME-AWARE, and the rule most likely to be "fixed" by a later session. A share
    // card is a PNG in somebody else's chat app, under somebody else's theme.
    expect(dark).toEqual(light);
  });

  it('renders at the size that lands on a 1080 picture', async () => {
    await renderCard();

    // The card is rendered at exactly the dp that rasterises to 1080 real pixels on this
    // device, which is why the capture takes no resize option at all.
    const sized = rendered().filter(
      (node) =>
        (node.props.style as { width?: number } | undefined)?.width ===
        CARD_RENDER_DP,
    );
    expect(sized).toHaveLength(1);
  });
});
