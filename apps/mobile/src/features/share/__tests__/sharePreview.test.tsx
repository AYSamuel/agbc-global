import '@/i18n';

import {
  fireEvent,
  render,
  screen,
  userEvent,
} from '@testing-library/react-native';
import { Share, StyleSheet, type ViewStyle } from 'react-native';

import { ThemeScope } from '@/theme';

import { SharePreviewSheet } from '../SharePreviewSheet';

/**
 * SHARE-PREVIEW's three states and the four ways out of them (W4.15 slice 1).
 *
 * WHAT THIS SUITE CANNOT PROVE, said up front because the whole item turns on it: the
 * capture is faked here, so every assertion below would pass against any PNG at any path,
 * or against a blank one. That is exactly W4.8's placeholder-icon shape, and the acceptance
 * test is therefore a real send from the physical device, opened in WhatsApp and read at
 * thumbnail size in a chat list (plan §10). What IS proved here is ours: which state the
 * sheet is in, which buttons that state offers, that the preview shows the CAPTURED FILE
 * rather than a second render of the card, and which of the three `sent_as` values each
 * road records.
 */

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

// The reporter this sheet did not call until W4.20. Everything here is local work, so a
// failure leaves no server trace at all: if the app does not say what threw, nobody can
// ever answer "why could this member not share the verse?".
const mockCapture = jest.fn();
jest.mock('@/lib/sentry', () => ({
  captureHandledError: (...args: unknown[]) => {
    mockCapture(...args);
  },
}));

const mockCaptureRef = jest.fn<Promise<string>, unknown[]>();
jest.mock('react-native-view-shot', () => ({
  captureRef: (...args: unknown[]) => mockCaptureRef(...args),
}));

const mockIsAvailable = jest.fn<Promise<boolean>, []>();
const mockShareAsync = jest.fn<Promise<void>, unknown[]>();
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailable(),
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

// The QR is a third-party encoder; what is OURS is that it is pointed at the same address
// the card prints. Standing in for it exposes that wiring to an assertion and keeps an SVG
// path matrix out of a unit test.
jest.mock('react-native-qrcode-svg', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({ value }: { value: string }) => <Text>{value}</Text>,
  };
});

jest.mock(
  'react-native-safe-area-context',
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- documented jest.mock factory shape
  () => require('react-native-safe-area-context/jest/mock').default,
);

// The card can carry a testimony photo, which reaches the storage client through
// useSignedPhotoUrl. The verse here has none, so nothing signs anything; the mock exists
// only so importing the card does not construct a real client (src/lib/supabase throws
// without EXPO_PUBLIC_* config).
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const VERSE = {
  kind: 'verse',
  text: 'And my God will supply every need of yours',
  reference: 'Philippians 4:19',
  translation: 'WEB',
} as const;

const FALLBACK = '"And my God will supply every need of yours"';

// Held in a variable rather than asserted through `Share.share`: reading a method off its
// object to pass to `expect` is what `unbound-method` exists to stop.
let shareSpy: jest.SpyInstance<ReturnType<typeof Share.share>>;

function sheet(visible: boolean, onClose: () => void) {
  return (
    <ThemeScope name="light">
      <SharePreviewSheet
        visible={visible}
        content={VERSE}
        fallbackText={FALLBACK}
        onClose={onClose}
      />
    </ThemeScope>
  );
}

// RNTL v14: render and events are async (React 19 act semantics); always await.
async function renderSheet(onClose: () => void = jest.fn()) {
  await render(sheet(true, onClose));
  return onClose;
}

/**
 * The capture is kicked off when the card says it is composed, and the card decides that
 * from its own layout events, which nothing fires under Jest, so the suite fires them:
 * the middle has room, the words fit inside it, and the card announces itself. Deliberately
 * NOT a shortcut past the mechanism: driving it through the same events the device uses is
 * what lets the re-capture test below prove that a second opening really does compose a
 * second card.
 */
async function layOutTheCard() {
  // The card hides itself from assistive tech (it exists to be rasterised), so the
  // queries have to ask for hidden elements.
  const hidden = { includeHiddenElements: true } as const;
  await fireEvent(screen.getByTestId('share-card-middle', hidden), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 288, height: 700 } },
  });
  await fireEvent(screen.getByTestId('share-card-content', hidden), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 288, height: 300 } },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockResolvedValue(true);
  mockCaptureRef.mockResolvedValue('/tmp/agbc-share.png');
  mockShareAsync.mockResolvedValue();
  shareSpy = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction' });
});

describe('SHARE-PREVIEW', () => {
  it('shows the card it captured, not a second render of it', async () => {
    await renderSheet();
    await layOutTheCard();

    const preview = await screen.findByTestId('share-preview-image');
    // THE PREVIEW IS THE OUTPUT. The uri under the Image is the one the capture returned,
    // which is what makes it impossible for the preview to drift from what is sent.
    expect(preview.props.source).toEqual({ uri: '/tmp/agbc-share.png' });
  });

  it('hides Share while the picture is being made, and keeps the text way out', async () => {
    // Never resolves: the sheet stays in `preparing` for the whole test.
    mockCaptureRef.mockReturnValue(new Promise(() => undefined));
    await renderSheet();
    await layOutTheCard();

    expect(screen.getByText('Getting it ready…')).toBeOnTheScreen();
    // Hidden, not dimmed (the 2026-07-20 rule): no dead button under a skeleton.
    expect(screen.queryByText('Share')).not.toBeOnTheScreen();
    expect(screen.getByText('Send as text instead')).toBeOnTheScreen();
  });

  it('sends the captured file and records it as an image share', async () => {
    const user = userEvent.setup();
    const onClose = await renderSheet();
    await layOutTheCard();
    await screen.findByTestId('share-preview-image');

    await user.press(screen.getByText('Share'));

    // `file://` is prepended: expo-sharing wants the scheme and captureRef does not always
    // give one (react-native-view-shot's own README says so).
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///tmp/agbc-share.png',
      expect.objectContaining({ mimeType: 'image/png' }),
    );
    expect(mockTrack).toHaveBeenCalledWith('content_shared', {
      content_kind: 'verse',
      sent_as: 'image',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('records a chosen text share as a preference, never as a failure', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await layOutTheCard();
    await screen.findByTestId('share-preview-image');

    await user.press(screen.getByText('Send as text instead'));

    expect(shareSpy).toHaveBeenCalledWith({ message: FALLBACK });
    expect(mockTrack).toHaveBeenCalledWith('content_shared', {
      content_kind: 'verse',
      sent_as: 'text',
    });
  });

  it('says the picture could not be made, and offers the words instead', async () => {
    mockCaptureRef.mockRejectedValue(new Error('out of space'));
    const user = userEvent.setup();
    await renderSheet();
    await layOutTheCard();

    expect(
      await screen.findByText(
        "We couldn't make the picture this time. You can still send it as words, and nothing is lost.",
      ),
    ).toBeOnTheScreen();
    // The way out is promoted to the primary button: the member came here to share
    // something and they still can.
    await user.press(screen.getByText('Send as text'));

    expect(shareSpy).toHaveBeenCalledWith({ message: FALLBACK });
    // The value that exists to monitor a failure mode no test here can see. If it is
    // anything but rare in the field, the capture is broken on real devices.
    expect(mockTrack).toHaveBeenCalledWith('content_shared', {
      content_kind: 'verse',
      sent_as: 'text_after_failure',
    });
  });

  it('reports what actually threw, so the next report is answerable', async () => {
    // THE POINT OF THIS CHANGE. The member's line is the same for a full disk, an OEM
    // that refuses the capture and an OS with nowhere to send a file; the only way to
    // tell them apart afterwards is for the app to have said so at the time.
    const thrown = new Error('ENOSPC: no space left on device');
    mockCaptureRef.mockRejectedValue(thrown);
    await renderSheet();
    await layOutTheCard();

    await screen.findByText(/couldn't make the picture/);
    expect(mockCapture).toHaveBeenCalledWith(thrown);
  });

  it('reports the OS having nowhere to send a file, which throws nothing', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await renderSheet();
    await layOutTheCard();

    await screen.findByText(/couldn't make the picture/);
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('does not claim the picture was never made when only the sending failed', async () => {
    // The member is looking at the picture. Telling them it could not be made
    // contradicts the thing on their screen.
    mockShareAsync.mockRejectedValue(new Error('no activity found'));
    const user = userEvent.setup();
    await renderSheet();
    await layOutTheCard();
    await screen.findByTestId('share-preview-image');

    await user.press(screen.getByText('Share'));

    expect(
      await screen.findByText(
        "The picture is ready, but it couldn't be sent this time. Try again, or send it as words instead.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/couldn't make the picture/)).toBeNull();
    expect(mockCapture).toHaveBeenCalled();
  });

  it('keeps the sheet open when even the words could not be sent', async () => {
    shareSpy.mockRejectedValue(new Error('no activity found'));
    const user = userEvent.setup();
    const onClose = await renderSheet();
    await layOutTheCard();
    await screen.findByTestId('share-preview-image');

    await user.press(screen.getByText('Send as text instead'));

    // Nothing left the app, so nothing is recorded and nothing is dismissed: closing on
    // the way past a failure would look exactly like success.
    expect(mockTrack).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Send as text instead')).toBeOnTheScreen();
  });

  it('fails when the OS has no share sheet at all, rather than capturing into nothing', async () => {
    mockIsAvailable.mockResolvedValue(false);
    await renderSheet();
    await layOutTheCard();

    expect(await screen.findByText('Try the picture again')).toBeOnTheScreen();
    expect(mockCaptureRef).not.toHaveBeenCalled();
  });

  it('takes a fresh picture when the sheet is opened again', async () => {
    const onClose = jest.fn();
    await renderSheet(onClose);
    await layOutTheCard();
    await screen.findByTestId('share-preview-image');
    expect(mockCaptureRef).toHaveBeenCalledTimes(1);

    await screen.rerender(sheet(false, onClose));
    // The fresh layout the second capture depends on is React Native's, not ours: a hidden
    // `Modal` renders nothing at all, so the card is gone while the sheet is closed and a
    // new one mounts when it opens. Asserted rather than assumed, because everything below
    // rests on it.
    expect(screen.queryByTestId('share-card-host')).toBeNull();

    await screen.rerender(sheet(true, onClose));
    await layOutTheCard();

    // A stale preview would be a picture of yesterday's verse. What could produce one is
    // the once-per-attempt guard: this component outlives the sheet, so a guard that only
    // remembered "already captured" would block every later opening.
    await screen.findByTestId('share-preview-image');
    expect(mockCaptureRef).toHaveBeenCalledTimes(2);
  });

  /**
   * THE FRAME MUST STAY SQUARE ON A WIDE SHEET (W4.17, found 2026-09-15 in the iPad store
   * captures, and live on every Android tablet in 1.0.2). The frame is 68% of the sheet,
   * capped, and square by `aspectRatio`. Yoga derives the height from the percentage width
   * BEFORE it applies a max: on a sheet wider than ~412dp the width stopped at the cap while
   * the height stayed at 68%, and the picture filled a tall frame with both sides cut off.
   * A phone never reaches the cap, which is why W4.15's phone matrix passed.
   *
   * WHAT THIS CAN AND CANNOT PROVE. Jest has no layout engine, so no size is ever computed
   * here and a clipped preview cannot be observed; the tablet is the acceptance test. What
   * this pins is the one rule whose absence produced the bug: whatever caps the width caps
   * the height by the same amount, so the aspect ratio has nothing left to stretch.
   */
  it('caps the preview frame on both axes, so a wide sheet cannot stretch it tall', async () => {
    await renderSheet();
    await layOutTheCard();
    await screen.findByTestId('share-preview-image');

    const frame = StyleSheet.flatten(
      screen.getByTestId('share-preview-frame').props.style as ViewStyle,
    );
    expect(frame.aspectRatio).toBe(1);
    expect(frame.maxWidth).toEqual(expect.any(Number));
    expect(frame.maxHeight).toBe(frame.maxWidth);
  });
});
