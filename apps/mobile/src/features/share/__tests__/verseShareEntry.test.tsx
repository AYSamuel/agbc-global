import '@/i18n';

import { render, screen, userEvent } from '@testing-library/react-native';

import { VerseCard } from '@/features/home/VerseCard';
import { ThemeScope } from '@/theme';

/**
 * The daily verse's Share button on a build that HAS the two native modules (W4.15 slice
 * 1). The other half of this decision, a dev client that does not, is its own file:
 * `PICTURE_SHARE_LINKED` is read once when the module is first required, so the two
 * builds cannot be simulated in one suite.
 */

jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('react-native-view-shot', () => ({
  captureRef: () => new Promise<string>(() => undefined),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => Promise.resolve(true),
  shareAsync: () => Promise.resolve(),
}));
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

it('opens the preview sheet rather than sending anything straight away', async () => {
  const user = userEvent.setup();
  await render(
    <ThemeScope name="light">
      <VerseCard verse={VERSE} />
    </ThemeScope>,
  );

  await user.press(screen.getByLabelText('Share this verse'));

  // A picture of what you are about to send, never a silent hand-off (plan §2).
  expect(await screen.findByText('Share this verse')).toBeOnTheScreen();
  expect(screen.getByText('Send as text instead')).toBeOnTheScreen();
});
