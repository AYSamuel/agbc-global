import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';
import { Share } from 'react-native';

import { VerseCard } from '@/features/home/VerseCard';
import { ThemeScope } from '@/theme';

/**
 * THE DEV-CLIENT FENCE, proved rather than promised (W4.15 slice 1).
 *
 * `react-native-view-shot` and `expo-sharing` are native modules, so a dev client built
 * before this item throws "Cannot find native module" the moment either is imported, which
 * would take the whole route down. The guard in `capture.ts` catches that and the Share
 * button falls back to the text share the app has sent for a year.
 *
 * The mock below throws FROM THE FACTORY, which is what a missing native module actually
 * does at require time; a factory returning an empty object would prove something easier
 * and less true. `PICTURE_SHARE_LINKED` is read at first require, so this lives in its own
 * file rather than beside the linked-build test.
 */

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

jest.mock('react-native-view-shot', () => {
  throw new Error("Cannot find native module 'RNViewShot'");
});
jest.mock('expo-sharing', () => {
  throw new Error("Cannot find native module 'ExpoSharing'");
});
jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock(
  'react-native-safe-area-context',
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- documented jest.mock factory shape
  () => require('react-native-safe-area-context/jest/mock').default,
);

const VERSE = {
  date: '2026-09-12',
  reference: 'Philippians 4:19',
  text: 'And my God will supply every need of yours',
  translation: 'WEB',
};

it('sends words, and never opens a sheet in order to apologise', async () => {
  const shareSpy = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction' });
  const user = userEvent.setup();
  await render(
    <ThemeScope name="light">
      <VerseCard verse={VERSE} />
    </ThemeScope>,
  );

  await user.press(screen.getByLabelText('Share this verse'));

  expect(shareSpy).toHaveBeenCalledWith({
    message:
      '“And my God will supply every need of yours”\nPhilippians 4:19 · WEB',
  });
  expect(screen.queryByText('Send as text instead')).not.toBeOnTheScreen();
  // No preference was expressed, so it is not recorded as one.
  expect(mockTrack).toHaveBeenCalledWith('content_shared', {
    content_kind: 'verse',
    sent_as: 'text_after_failure',
  });
});
