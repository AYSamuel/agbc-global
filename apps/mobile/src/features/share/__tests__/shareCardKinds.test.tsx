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

import { shareCard } from '@agbc/shared/theme';

import type {
  BranchShareContent,
  EventShareContent,
  MilestoneShareContent,
  PrayerShareContent,
  SermonShareContent,
  TestimonyShareContent,
} from '../content';
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

jest.mock('react-native-qrcode-svg', () => {
  /* eslint-disable @typescript-eslint/no-unsafe-assignment --
     documented jest.mock factory shape: the value the code would encode, as text */
  const { Text: RNText } = jest.requireActual('react-native');
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  return {
    __esModule: true,
    default: ({ value }: { value: string }) => (
      <RNText testID="qr-target">{value}</RNText>
    ),
  };
});

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
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  body: 'God provided a job after 8 months of waiting. He is faithful.',
  authorName: 'Sarah O.',
  branchName: 'AGBC Glasgow',
  photoPath: null,
};

const PRAYER: PrayerShareContent = {
  kind: 'prayer',
  id: 'bbbbbbbb-0000-4000-8000-000000000002',
  body: "Please pray for my mother's surgery on Thursday.",
  authorName: 'Daniel A.',
  branchName: 'AGBC Emmen',
  anonymous: false,
};

const HIDDEN = { includeHiddenElements: true } as const;

async function renderCard(
  content:
    | TestimonyShareContent
    | PrayerShareContent
    | EventShareContent
    | SermonShareContent
    | BranchShareContent
    | MilestoneShareContent,
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

describe('the QR opens the thing that was scanned (slice 2b)', () => {
  it('encodes the testimony and the prayer request by id, on www', async () => {
    await renderCard(TESTIMONY);
    expect(screen.getByTestId('qr-target', HIDDEN)).toHaveTextContent(
      `https://www.agbcglobal.com/app/t/${TESTIMONY.id}`,
    );
  });

  it('encodes the prayer request under its own prefix', async () => {
    await renderCard(PRAYER);
    expect(screen.getByTestId('qr-target', HIDDEN)).toHaveTextContent(
      `https://www.agbcglobal.com/app/p/${PRAYER.id}`,
    );
  });
});

/** The three cards slice 3 drew: an event, a message and a branch. */
const EVENT: EventShareContent = {
  kind: 'event',
  id: 'cccccccc-0000-4000-8000-000000000003',
  title: 'Night of Worship',
  day: '24',
  month: 'Aug',
  when: 'Saturday · 7:00 PM',
  place: 'AGBC Lighthouse Berlin · Prinzenstr. 84',
  imageUrl: 'https://public.example/event-images/x.jpg',
};

const SERMON: SermonShareContent = {
  kind: 'sermon',
  id: 'dddddddd-0000-4000-8000-000000000004',
  title: 'Grace for the Journey',
  speaker: 'Pastor Esther Olayinka',
  meta: '38 min · Grace Series',
  imageUrl: null,
};

const BRANCH: BranchShareContent = {
  kind: 'branch',
  id: 'eeeeeeee-0000-4000-8000-000000000005',
  name: 'AGBC Lighthouse Berlin',
  rows: [
    { icon: 'clock', text: 'Sundays 11:00 AM', strong: true },
    { icon: 'clock', text: 'Mittwochs 19:00 Uhr', strong: false },
    { icon: 'pin', text: 'Oudenarder Str. 16, 13347 Berlin', strong: false },
  ],
};

describe('the scrim on a block that begins near the top', () => {
  it('never draws two stops at one offset (React would drop one)', async () => {
    mockSign.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/1.jpg' },
      error: null,
    });
    await renderCard({ ...TESTIMONY, photoPath: 'members/sarah/1.jpg' });
    // A tall block: its top is 20dp from the card's top, inside the 14% fade.
    await fireEvent(screen.getByTestId('share-card-middle', HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 288, height: 700 } },
    });
    await fireEvent(
      screen.getByTestId('share-card-content', HIDDEN),
      'layout',
      { nativeEvent: { layout: { x: 0, y: 20, width: 288, height: 600 } } },
    );
    const photo = await screen.findByTestId('share-card-photo', HIDDEN);
    await fireEvent(photo, 'load', {
      nativeEvent: {
        cacheType: 'none',
        source: { url: 'x', width: 10, height: 10, mediaType: 'image/jpeg' },
      },
    });
    const gradients = rendered()
      .filter((node) => node.type === 'RNSVGLinearGradient')
      .map((node) => node.props.gradient as number[]);
    // The scrim is the gradient whose last stop is fully opaque ink at 100%; with the
    // fade folded onto the top it has fewer than five stops, and every offset it does
    // have is strictly greater than the one before.
    const scrim = gradients.find(
      (stops) => stops.length >= 6 && stops.length < 10,
    );
    expect(scrim).toBeDefined();
    const offsets = (scrim ?? []).filter((_, index) => index % 2 === 0);
    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1] ?? -1);
    }
    expect(offsets[0]).toBe(0);
    expect(offsets.some((o) => Math.abs(o - 20 / CARD_RENDER_DP) < 0.002)).toBe(
      true,
    );
  });
});

describe('the event, the message and the branch (slice 3)', () => {
  it('draws the event with its date block, when and where, over its public picture', async () => {
    const onReady = jest.fn();
    await renderCard(EVENT, onReady);
    expect(screen.getByText('24', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Aug', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Night of Worship', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Saturday · 7:00 PM', HIDDEN)).toBeTruthy();
    expect(
      screen.getByText('AGBC Lighthouse Berlin · Prinzenstr. 84', HIDDEN),
    ).toBeTruthy();
    expect(screen.getByText("You're invited", HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('qr-target', HIDDEN)).toHaveTextContent(
      `https://www.agbcglobal.com/app/e/${EVENT.id}`,
    );

    // A public picture is fetched by its URL, never signed: the event-images bucket is
    // public-read and the preset already built the address.
    await measure(700, 300);
    expect(onReady).not.toHaveBeenCalled();
    const photo = await screen.findByTestId('share-card-photo', HIDDEN);
    // expo-image normalises `source` into an array on the host node.
    expect(photo.props.source).toEqual([{ uri: EVENT.imageUrl }]);
    expect(mockSign).not.toHaveBeenCalled();
    await fireEvent(photo, 'load', {
      nativeEvent: {
        cacheType: 'none',
        source: { url: 'x', width: 10, height: 10, mediaType: 'image/jpeg' },
      },
    });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('is the ink card for the common event with no picture', async () => {
    const onReady = jest.fn();
    await renderCard({ ...EVENT, imageUrl: null }, onReady);
    await measure(700, 300);
    expect(screen.queryByTestId('share-card-photo', HIDDEN)).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('draws the message with its speaker and the line under it', async () => {
    await renderCard(SERMON);
    expect(screen.getByText('Message', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Grace for the Journey', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Pastor Esther Olayinka', HIDDEN)).toBeTruthy();
    expect(screen.getByText('38 min · Grace Series', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('qr-target', HIDDEN)).toHaveTextContent(
      `https://www.agbcglobal.com/app/m/${SERMON.id}`,
    );
  });

  it('draws the branch with its rows and no by-line', async () => {
    await renderCard(BRANCH);
    expect(screen.getByText('Come and visit', HIDDEN)).toBeTruthy();
    expect(screen.getByText('AGBC Lighthouse Berlin', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Sundays 11:00 AM', HIDDEN)).toBeTruthy();
    // The branch's own words, untranslated: `02` stores what the branch wrote.
    expect(screen.getByText('Mittwochs 19:00 Uhr', HIDDEN)).toBeTruthy();
    expect(
      screen.getByText('Oudenarder Str. 16, 13347 Berlin', HIDDEN),
    ).toBeTruthy();
    expect(screen.queryByText('A member', HIDDEN)).toBeNull();
    expect(screen.getByTestId('qr-target', HIDDEN)).toHaveTextContent(
      `https://www.agbcglobal.com/app/b/${BRANCH.id}`,
    );
  });

  /**
   * The address is the one thing on this card a stranger has to act on, so it may never
   * be cut. It was, from W4.15 until 2026-09-17: the row carried `numberOfLines={1}` and
   * put an ellipsis through AGBC UK's address on every card it ever shared.
   *
   * ASSERTED ON THE PROP, NOT ON THE WORDS, and that is the whole point of this test.
   * The case above already reads the address back with `getByText` and passed happily
   * throughout, because `getByText` matches the string a `Text` was GIVEN and knows
   * nothing about the one it draws. A truncating row and a wrapping row are identical to
   * every query in this file.
   */
  it('lets a long address wrap instead of cutting it', async () => {
    const longAddress =
      'Summerlee Museum of Scottish Industrial Life, Heritage Way, Coatbridge ML5 1QD';
    await renderCard({
      ...BRANCH,
      name: 'AGBC UK',
      rows: [
        { icon: 'clock', text: 'Sundays 12:00 PM (UK time)', strong: true },
        { icon: 'pin', text: longAddress, strong: false },
      ],
    });
    const address = screen.getByText(longAddress, HIDDEN);
    expect(address.props.numberOfLines).toBeUndefined();
    // And the row hangs its icon on the first line rather than centring it between two.
    expect(address.parent?.props.style).toMatchObject({
      alignItems: 'flex-start',
    });
  });

  it('starts the three of them one rung down, as every frame draws them', async () => {
    for (const content of [EVENT, SERMON, BRANCH]) {
      await renderCard(content);
      const quote = screen.getByTestId('share-card-quote', HIDDEN);
      expect((quote.props.style as { fontSize: number }).fontSize).toBeCloseTo(
        63 * CARD_SCALE,
        5,
      );
    }
  });
});

/** The milestone (slice 4): the only gold card, signed with the full name. */
const MILESTONE: MilestoneShareContent = {
  kind: 'milestone',
  title: 'A season with us',
  line: 'With my church family at Amazing Grace Bible Church.',
  name: 'Ayo Samuel',
  branchName: 'AGBC Lighthouse Berlin',
};

describe('the milestone (slice 4)', () => {
  it('draws the gold card with the title, the line and the full name', async () => {
    const onReady = jest.fn();
    await renderCard(MILESTONE, onReady);
    expect(screen.getByText('A milestone', HIDDEN)).toBeTruthy();
    expect(screen.getByText('A season with us', HIDDEN)).toBeTruthy();
    expect(
      screen.getByText(
        'With my church family at Amazing Grace Bible Church.',
        HIDDEN,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Ayo Samuel', HIDDEN)).toBeTruthy();
    expect(screen.getByText('AGBC Lighthouse Berlin', HIDDEN)).toBeTruthy();
    // No page of its own: the code opens the app's landing page.
    expect(screen.getByTestId('qr-target', HIDDEN)).toHaveTextContent(
      'https://www.agbcglobal.com/app',
    );
    // Drawn at `.scq` (the top rung), not `.sm`.
    expect(sizeOf(screen.getByTestId('share-card-quote', HIDDEN))).toBeCloseTo(
      75 * CARD_SCALE,
      5,
    );
    await measure(700, 300);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('inverts the mark on the gold ground, and the title reads navy on it', async () => {
    await renderCard(MILESTONE);
    const monogram = screen.getByText('A', HIDDEN);
    expect((monogram.props.style as { color: string }).color).toBe(
      shareCard.ground.gold.markText,
    );
    const quote = screen.getByTestId('share-card-quote', HIDDEN);
    expect((quote.props.style as { color: string }).color).toBe(
      shareCard.ground.gold.quote,
    );
  });
});
