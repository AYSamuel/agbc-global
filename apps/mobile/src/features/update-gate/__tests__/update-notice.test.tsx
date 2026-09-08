import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Linking } from 'react-native';

import '@/i18n';
import { localDateKey } from '@/features/home/queries';
import { useNotificationAskStore } from '@/features/notifications/ask';
import { useCelebratedStore } from '@/features/rhythm/celebrated';
import { useVisitConfirmStore } from '@/features/rhythm/visiting';
import { useAnalyticsConsentStore } from '@/lib/analytics/consent';
import { APP_STORE_URL } from '@/lib/links';
import { useLaunchStore } from '@/state/launch';
import { ThemeScope } from '@/theme';

import {
  resetInAppUpdatesModuleForTests,
  type UpdateCheck,
} from '../inAppUpdates';
import {
  mayCheckToday,
  shouldTakeOver,
  STALE_DAYS_FOR_TAKEOVER,
  useUpdateNoticeStore,
} from '../notice';
import { UpdateNotice } from '../UpdateNotice';

// UPDATE-NOTICE (W4.10 slice 1): the app finally says that an ordinary new version
// exists, at most once a day, and hands the install to the platform.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-GB' }]),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

const mockCheck = jest.fn<Promise<UpdateCheck>, []>();
const mockStart = jest.fn<Promise<boolean>, [boolean | undefined]>();
jest.mock('expo-in-app-updates', () => ({
  checkForUpdate: () => mockCheck(),
  startUpdate: (isImmediate?: boolean) => mockStart(isImmediate),
}));

const TITLE = 'A new version is ready';

function today(): string {
  return localDateKey(new Date());
}

function renderNotice() {
  return render(
    <ThemeScope name="light">
      <UpdateNotice />
    </ThemeScope>,
  );
}

/** The sheet's own condition is the only thing under test; everything else stands aside. */
function nothingElseIsDue() {
  useLaunchStore.setState({ hasOnboarded: true });
  useCelebratedStore.setState({ known: [], showing: null });
  useNotificationAskStore.setState({ asked: true, pending: null });
  useVisitConfirmStore.setState({ pending: null });
  useAnalyticsConsentStore.setState({ consent: 'granted', hydrated: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetInAppUpdatesModuleForTests();
  useUpdateNoticeStore.setState({ lastShownDay: null, available: null });
  nothingElseIsDue();
  mockCheck.mockResolvedValue({ updateAvailable: false, storeVersion: '22' });
  mockStart.mockResolvedValue(true);
});

describe('mayCheckToday is the once-a-day promise', () => {
  test('a day already answered is not asked about again', () => {
    expect(mayCheckToday('2026-09-08', '2026-09-08')).toBe(false);
  });

  test('a new day, or a member never asked, is fair game', () => {
    expect(mayCheckToday('2026-09-07', '2026-09-08')).toBe(true);
    expect(mayCheckToday(null, '2026-09-08')).toBe(true);
  });
});

describe('the notice appears when, and only when, there is something to say', () => {
  test('a newer version in the store raises the sheet', async () => {
    mockCheck.mockResolvedValue({ updateAvailable: true, storeVersion: '23' });
    await renderNotice();

    expect(await screen.findByText(TITLE)).toBeOnTheScreen();
    // The footnote is the promise the once-a-day rule keeps.
    expect(screen.getByText("We won't ask again today.")).toBeOnTheScreen();
  });

  test('an up-to-date binary is left alone', async () => {
    await renderNotice();

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
    });
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  test('a download already running is not interrupted with the same offer', async () => {
    // Android after an earlier tap: Play is fetching it and the module installs it
    // on its own, so `updateAvailable` stays true and means nothing new.
    mockCheck.mockResolvedValue({
      updateAvailable: true,
      updateInProgress: true,
      storeVersion: '23',
    });
    await renderNotice();

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
    });
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  test('the store is not asked twice on a day already answered', async () => {
    useUpdateNoticeStore.setState({ lastShownDay: today() });
    mockCheck.mockResolvedValue({ updateAvailable: true, storeVersion: '23' });
    await renderNotice();

    expect(mockCheck).not.toHaveBeenCalled();
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  test('a check that finds nothing does NOT burn the day', async () => {
    // Otherwise a version published at lunchtime would go unmentioned until
    // tomorrow for everybody who opened the app that morning.
    await renderNotice();

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
    });
    expect(useUpdateNoticeStore.getState().lastShownDay).toBeNull();
  });
});

describe('the notice stands behind every other overlay', () => {
  test.each([
    [
      'a milestone celebration',
      () => {
        useCelebratedStore.setState({ showing: 'first_service' });
      },
    ],
    [
      'the notification ask',
      () => {
        useNotificationAskStore.setState({
          asked: false,
          pending: 'signed_in',
        });
      },
    ],
    [
      'the visiting confirm',
      () => {
        useVisitConfirmStore.setState({
          pending: { branchId: 'branch-2', branchName: 'AGBC Glasgow' },
        });
      },
    ],
    [
      'the analytics ask',
      () => {
        useAnalyticsConsentStore.setState({
          consent: 'unasked',
          hydrated: true,
        });
      },
    ],
    [
      'onboarding itself',
      () => {
        useLaunchStore.setState({ hasOnboarded: false });
      },
    ],
  ])('%s comes first', async (_label, raise) => {
    mockCheck.mockResolvedValue({ updateAvailable: true, storeVersion: '23' });
    raise();
    await renderNotice();

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
    });
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});

// W4.10 slice 2: far enough behind and the app stops asking. Play's IMMEDIATE flow takes
// the screen until the install finishes, which is why every arm of the decision reads
// Play rather than anything of ours.
describe('shouldTakeOver never fires on our say-so alone', () => {
  const stale = {
    updateAvailable: true,
    storeVersion: '25',
    immediateAllowed: true,
    daysSinceRelease: STALE_DAYS_FOR_TAKEOVER,
  };

  test('two trains of staleness is the threshold, and a day short is not', () => {
    expect(shouldTakeOver(stale)).toBe(true);
    expect(
      shouldTakeOver({
        ...stale,
        daysSinceRelease: STALE_DAYS_FOR_TAKEOVER - 1,
      }),
    ).toBe(false);
  });

  test('no staleness information means no information, never zero days', () => {
    expect(shouldTakeOver({ ...stale, daysSinceRelease: null })).toBe(false);
    expect(shouldTakeOver({ ...stale, daysSinceRelease: undefined })).toBe(
      false,
    );
  });

  test('Play must allow the immediate flow, which is also what keeps iOS out', () => {
    // iOS sets neither flag, so an iOS check can never escalate however stale.
    expect(shouldTakeOver({ ...stale, immediateAllowed: false })).toBe(false);
    expect(
      shouldTakeOver({
        updateAvailable: true,
        storeVersion: '1.1.0',
        daysSinceRelease: 400,
      }),
    ).toBe(false);
  });

  test('a release marked urgent on Play escalates without waiting', () => {
    expect(
      shouldTakeOver({
        updateAvailable: true,
        storeVersion: '25',
        immediateAllowed: true,
        serverUpdateType: 'IMMEDIATE',
      }),
    ).toBe(true);
  });

  test('nothing to install, or an install already running, escalates nothing', () => {
    expect(shouldTakeOver({ ...stale, updateAvailable: false })).toBe(false);
    expect(shouldTakeOver({ ...stale, updateInProgress: true })).toBe(false);
  });
});

describe('a member far enough behind is not asked at all', () => {
  const stale = {
    updateAvailable: true,
    storeVersion: '25',
    immediateAllowed: true,
    daysSinceRelease: STALE_DAYS_FOR_TAKEOVER,
  };

  test('Play takes the screen, and our sheet never appears', async () => {
    mockCheck.mockResolvedValue(stale);
    await renderNotice();

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledWith(true);
    });
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  test('the day is not burnt, so backing out of Play meets it again', async () => {
    // That insistence IS the point of an immediate update: the sheet's once-a-day
    // promise belongs to the offer, and this is no longer an offer.
    mockCheck.mockResolvedValue(stale);
    await renderNotice();

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalled();
    });
    expect(useUpdateNoticeStore.getState().lastShownDay).toBeNull();
  });

  test('a takeover Play refuses degrades to the ordinary sheet', async () => {
    mockCheck.mockResolvedValue(stale);
    mockStart.mockResolvedValue(false);
    await renderNotice();

    expect(await screen.findByText(TITLE)).toBeOnTheScreen();
  });
});

describe('answering it', () => {
  async function raiseSheet() {
    mockCheck.mockResolvedValue({ updateAvailable: true, storeVersion: '23' });
    await renderNotice();
    await screen.findByText(TITLE);
  }

  test('Update hands over to the platform as a FLEXIBLE flow', async () => {
    await raiseSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Update' }));

    // `true` here would be Play's immediate flow, which takes the screen. That is
    // slice 2's escalation for a member two releases behind, never this sheet.
    expect(mockStart).toHaveBeenCalledWith(false);
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  test('a platform that declines to take over still gets the member to the store', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockStart.mockResolvedValue(false);
    await raiseSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Update' }));

    // jest-expo runs as iOS.
    await waitFor(() => {
      expect(openURL).toHaveBeenCalledWith(APP_STORE_URL);
    });
    openURL.mockRestore();
  });

  test('Update burns the day too, because Play can still be cancelled', async () => {
    await raiseSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Update' }));

    expect(useUpdateNoticeStore.getState().lastShownDay).toBe(today());
  });

  test('Not now closes it for the day and starts nothing', async () => {
    await raiseSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(mockStart).not.toHaveBeenCalled();
    expect(useUpdateNoticeStore.getState().lastShownDay).toBe(today());
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  test('it does not come back on the next launch that same day', async () => {
    await raiseSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    // Unmount before rendering again, never `screen.unmount()` inside the press's
    // own act scope: that nests one act call in another and React says so.
    await cleanup();

    // A relaunch: the store is re-read, the day is not. Only `lastShownDay`
    // persists, so this is what a member who reopens the app an hour later sees.
    jest.clearAllMocks();
    mockCheck.mockResolvedValue({ updateAvailable: true, storeVersion: '23' });
    await renderNotice();

    expect(mockCheck).not.toHaveBeenCalled();
    expect(screen.queryByText(TITLE)).toBeNull();
  });
});
