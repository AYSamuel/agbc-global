import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ThemeScope } from '@/theme';

import type { PrayerShareContent, TestimonyShareContent } from '../content';
import { CARD_RENDER_DP, CARD_SCALE } from '../geometry';
import { PHOTO_DEADLINE_MS, ShareCard } from '../ShareCard';

/** Every node in the rendered tree, read off `toJSON()` (the same walker the verse
 * suite uses; the SVG gradient's stops have no query to reach for). */
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

/**
 * The testimony and prayer cards (W4.15 slice 2): the rules a later session could undo
 * without noticing, plus the two mechanisms that only exist because of these cards.
 *
 * THE AUTO-FIT LADDER is driven the way the device drives it, by layout events, and none
 * fire under Jest, so the suite fires them with the heights it wants the card to believe.
 * That is the point rather than a cheat: the ladder is a decision about measurements,
 * and these tests hand it measurements. What they cannot prove is that a real 1080 card
 * holds five lines at 54px; the frame was rendered for that, and the device pass reads it.
 */

jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: () => null,
}));

// The signer the photo card mints its URL through. `null` data is a refused or missing
// object, which the card treats exactly like a fetch that failed.
const mockSign = jest.fn<
  Promise<{ data: { signedUrl: string } | null; error: unknown }>,
  []
>();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrl: () => mockSign() }) },
  },
}));

const TESTIMONY: TestimonyShareContent = {
  kind: 'testimony',
  body: 'God provided a job after 8 months of waiting. He is faithful.',
  authorName: 'Sarah O.',
  branchName: 'AGBC Glasgow',
  photoPath: null,
};

const PRAYER: PrayerShareContent = {
  kind: 'prayer',
  body: "Please pray for my mother's surgery on Thursday.",
  authorName: 'Daniel A.',
  branchName: 'AGBC Emmen',
  anonymous: false,
};

const HIDDEN = { includeHiddenElements: true } as const;

async function renderCard(
  content: TestimonyShareContent | PrayerShareContent,
  onReady: () => void = () => undefined,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const tree = (
    <QueryClientProvider client={client}>
      <ThemeScope name="light">
        <ShareCard content={content} onReady={onReady} />
      </ThemeScope>
    </QueryClientProvider>
  );
  await render(tree);
  return tree as ReactElement;
}

/** The card believes its middle has `room` and its words need `needed`. */
async function measure(room: number, needed: number) {
  await fireEvent(screen.getByTestId('share-card-middle', HIDDEN), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 288, height: room } },
  });
  await fireEvent(screen.getByTestId('share-card-content', HIDDEN), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 288, height: needed } },
  });
}

async function layOutLines(texts: string[]) {
  await fireEvent(
    screen.getByTestId('share-card-quote', HIDDEN),
    'textLayout',
    {
      nativeEvent: {
        lines: texts.map((text) => ({
          text,
          x: 0,
          y: 0,
          width: 288,
          height: 20,
          ascender: 0,
          descender: 0,
          capHeight: 0,
          xHeight: 0,
        })),
      },
    },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSign.mockResolvedValue({ data: null, error: new Error('no photo') });
});

describe('a testimony card', () => {
  it('quotes the words and signs them with the author and their branch', async () => {
    await renderCard(TESTIMONY);

    // Real curly quotes in the text, the way `.testi .body` and `testimonyShareText()`
    // already mark a quotation, and nothing about a person the feed does not show.
    expect(
      screen.getByText(
        '“God provided a job after 8 months of waiting. He is faithful.”',
        HIDDEN,
      ),
    ).toBeTruthy();
    expect(screen.getByText('A testimony', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Sarah O.', HIDDEN)).toBeTruthy();
    expect(screen.getByText('AGBC Glasgow', HIDDEN)).toBeTruthy();
    // On an ink ground the kicker stays at the top of the card, a sibling of the words:
    // the foot-block rule below is for photographs, whose top is not a known colour.
    const middle = screen.getByTestId('share-card-middle', HIDDEN);
    expect(within(middle).queryByText('A testimony', HIDDEN)).toBeNull();
  });

  it('reads "A member" when the feed sent no name, never a blank', async () => {
    await renderCard({ ...TESTIMONY, authorName: null });
    expect(screen.getByText('A member', HIDDEN)).toBeTruthy();
  });

  it('announces itself once the words fit, and only once', async () => {
    const onReady = jest.fn();
    await renderCard(TESTIMONY, onReady);
    expect(onReady).not.toHaveBeenCalled();

    await measure(700, 300);
    expect(onReady).toHaveBeenCalledTimes(1);

    // A re-measure after the capture must not announce a second readiness.
    await measure(700, 300);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('steps the quote down a rung when the words overflow', async () => {
    await renderCard(TESTIMONY);
    const before = sizeOf(screen.getByTestId('share-card-quote', HIDDEN));

    await measure(700, 900);

    const after = sizeOf(screen.getByTestId('share-card-quote', HIDDEN));
    expect(after).toBeLessThan(before);
  });

  it('cuts on a word boundary at the smallest rung, and says so in gold', async () => {
    const onReady = jest.fn();
    await renderCard(TESTIMONY, onReady);

    // Two rungs down: still too tall.
    await measure(700, 900);
    await measure(700, 900);
    // At the smallest rung the card knows its lines and how much is over. The second
    // line ends INSIDE a word, the way a line does when the engine had to break a long
    // token rather than wrap at a space: the one case where "keep whole lines" is not
    // enough and the cut has to step back to a boundary on its own.
    await layOutLines([
      '“God provided a job after ',
      '8 months of waiting, faith',
      'fulness rewarded.”',
    ]);
    // Over by half a line once the cut line's own room is reserved: the card drops
    // exactly one line, keeps two, and cuts the third. Spelled out in the card's own
    // units so the arithmetic holds at whatever pixel ratio Jest reports.
    const room = 700 - 2 * 48 * CARD_SCALE;
    const reserved = (33 + 42) * CARD_SCALE;
    const lineHeight = 78.3 * CARD_SCALE;
    await measure(700, room - reserved + lineHeight * 0.5);

    const quote = screen.getByTestId('share-card-quote', HIDDEN);
    const shown = (quote.props as { children: string }).children;
    expect(shown).toBe('“God provided a job after 8 months of waiting…');
    expect(screen.getByText('Read it all in the app', HIDDEN)).toBeTruthy();

    // The cut card then fits and announces itself.
    await measure(700, 400);
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});

describe('a prayer request card', () => {
  it('is somebody asking, not a quotation, and asks the reader to pray', async () => {
    await renderCard(PRAYER);

    expect(screen.getByText(PRAYER.body, HIDDEN)).toBeTruthy();
    expect(screen.queryByText(`“${PRAYER.body}”`, HIDDEN)).toBeNull();
    expect(screen.getByText('Prayer request', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Will you pray?', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Daniel A.', HIDDEN)).toBeTruthy();
    expect(screen.getByText('AGBC Emmen', HIDDEN)).toBeTruthy();
  });

  it('drops the branch when the request is anonymous', async () => {
    await renderCard({ ...PRAYER, authorName: null, anonymous: true });

    // "A member" stays; the branch goes. On a card that gets forwarded, naming the
    // branch narrows an anonymous and possibly medical request to a few dozen people
    // (plan §5), so this is a deliberate departure from what the feed shows.
    expect(screen.getByText('A member', HIDDEN)).toBeTruthy();
    expect(screen.queryByText('AGBC Emmen', HIDDEN)).toBeNull();
  });

  it('keeps the branch for a named author whose name simply failed to load', async () => {
    await renderCard({ ...PRAYER, authorName: null, anonymous: false });
    expect(screen.getByText('A member', HIDDEN)).toBeTruthy();
    expect(screen.getByText('AGBC Emmen', HIDDEN)).toBeTruthy();
  });
});

describe('a testimony card with a photo', () => {
  const WITH_PHOTO = { ...TESTIMONY, photoPath: 'members/sarah/1.jpg' };

  it('waits for the picture before announcing itself, then keeps the kicker with the words', async () => {
    mockSign.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/1.jpg' },
      error: null,
    });
    const onReady = jest.fn();
    await renderCard(WITH_PHOTO, onReady);
    await measure(700, 300);
    // Fits, but the photo is still on its way: not ready.
    expect(onReady).not.toHaveBeenCalled();

    const photo = await screen.findByTestId('share-card-photo', HIDDEN);
    await fireEvent(photo, 'load', {
      nativeEvent: {
        cacheType: 'none',
        source: {
          url: 'https://signed.example/1.jpg',
          width: 1200,
          height: 900,
          mediaType: 'image/jpeg',
        },
      },
    });
    expect(onReady).toHaveBeenCalledTimes(1);

    // The frame's rule since 2026-09-13: words on a photograph live at the foot, so the
    // kicker moves into the block with the quote rather than sitting over the bright
    // top of a picture nobody has vetted.
    const middle = screen.getByTestId('share-card-middle', HIDDEN);
    expect(within(middle).getByText('A testimony', HIDDEN)).toBeTruthy();
  });

  it('starts one rung down, and darkens the picture from where the words begin', async () => {
    mockSign.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/1.jpg' },
      error: null,
    });
    await renderCard(WITH_PHOTO);

    // `.scq.sm`: the frame draws a photo testimony at 63, and on the device the top rung
    // floated the kicker up into the thin part of the scrim over a bright sky.
    expect(sizeOf(screen.getByTestId('share-card-quote', HIDDEN))).toBeCloseTo(
      63 * CARD_SCALE,
      5,
    );

    // The middle sits 100dp down the card, the block 200dp down the middle: the words
    // begin at 300dp, and that is where the scrim's 94% stop must land, measured on the
    // device at 2.07:1 for the gold kicker when it did not.
    await fireEvent(screen.getByTestId('share-card-middle', HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 100, width: 288, height: 700 } },
    });
    await fireEvent(
      screen.getByTestId('share-card-content', HIDDEN),
      'layout',
      {
        nativeEvent: { layout: { x: 0, y: 200, width: 288, height: 300 } },
      },
    );
    const photo = await screen.findByTestId('share-card-photo', HIDDEN);
    await fireEvent(photo, 'load', {
      nativeEvent: {
        cacheType: 'none',
        source: { url: 'x', width: 10, height: 10, mediaType: 'image/jpeg' },
      },
    });

    // react-native-svg flattens a gradient's stops into `[offset, colour, offset, ...]`
    // on the host node, offsets as fractions. The scrim is the one gradient with five
    // stops, and one of them has to sit exactly where the block begins.
    const gradients = rendered()
      .filter((node) => node.type === 'RNSVGLinearGradient')
      .map((node) => node.props.gradient as number[]);
    const scrim = gradients.find((stops) => stops.length === 10);
    expect(scrim).toBeDefined();
    const offsets = (scrim ?? []).filter((_, index) => index % 2 === 0);
    const expected = Math.round((300 / CARD_RENDER_DP) * 1000) / 1000;
    expect(offsets.some((offset) => Math.abs(offset - expected) < 0.002)).toBe(
      true,
    );
  });

  it('becomes the ink card when the picture will not load', async () => {
    mockSign.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/1.jpg' },
      error: null,
    });
    const onReady = jest.fn();
    await renderCard(WITH_PHOTO, onReady);
    await measure(700, 300);

    const photo = await screen.findByTestId('share-card-photo', HIDDEN);
    await fireEvent(photo, 'error', {
      nativeEvent: { error: 'decode failed' },
    });

    // The words are the testimony; the picture was the ground. No error, no wait.
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('share-card-photo', HIDDEN)).toBeNull();
  });

  it('becomes the ink card when the storage refuses to sign', async () => {
    const onReady = jest.fn();
    await renderCard(WITH_PHOTO, onReady);
    await measure(700, 300);

    await screen.findByText('Sarah O.', HIDDEN);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('gives up on a picture that never arrives, rather than holding the sheet forever', async () => {
    jest.useFakeTimers();
    // A mint that hangs for the whole test, then resolves on the way out so no pending
    // promise outlives the test and stalls the runner's teardown.
    let release: (() => void) | undefined;
    mockSign.mockReturnValue(
      new Promise((resolve) => {
        release = () => {
          resolve({ data: null, error: new Error('too late') });
        };
      }),
    );
    try {
      const onReady = jest.fn();
      await renderCard(WITH_PHOTO, onReady);
      await measure(700, 300);
      expect(onReady).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(PHOTO_DEADLINE_MS + 1);
        await Promise.resolve();
      });
      expect(onReady).toHaveBeenCalledTimes(1);
    } finally {
      release?.();
      jest.useRealTimers();
    }
  });
});

function sizeOf(node: { props: { style?: unknown } }): number {
  const style = node.props.style as { fontSize?: number } | undefined;
  if (!style || typeof style.fontSize !== 'number') {
    throw new Error('the quote has no font size');
  }
  return style.fontSize;
}
