import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { AnalyticsAsk } from '@/features/analytics/AnalyticsAsk';
import { useNotificationAskStore } from '@/features/notifications/ask';
import { useCelebratedStore } from '@/features/rhythm/celebrated';
import { useAnalyticsConsentStore } from '@/lib/analytics';
import { useLaunchStore } from '@/state/launch';
import { ThemeScope } from '@/theme';

// ANALYTICS-ASK (mockup W2.10 "first-run sheet, once, over guest Home"; docs/spec/20
// §Consent mechanics, ADR 0020).
//
// What matters here is WHEN it appears and what each answer records, because the sheet is
// the only thing standing between a member and analytics they did not agree to. Consent must
// work signed out (first run has no account), a refusal must be as easy as a yes, and no
// answer may be treated as a yes.

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

async function renderAsk() {
  return render(
    <ThemeScope name="light">
      <AnalyticsAsk />
    </ThemeScope>,
  );
}

/** The normal first-run situation: onboarding done, nothing else on screen, no account. */
function firstRun() {
  useAnalyticsConsentStore.setState({ consent: 'unasked', hydrated: true });
  useLaunchStore.setState({ hasOnboarded: true });
  useCelebratedStore.setState({ showing: null });
  useNotificationAskStore.setState({ pending: null });
}

describe('ANALYTICS-ASK', () => {
  beforeEach(() => {
    firstRun();
  });

  test('appears for a guest after onboarding, and says what it will and will not do', async () => {
    await renderAsk();

    expect(screen.getByText('Help us make this better?')).toBeTruthy();
    // The two promises the sheet makes are load-bearing, not decoration: they are the
    // plain-words half of the Art. 9 consent (`20`).
    expect(screen.getByText(/never anything you write or pray/i)).toBeTruthy();
    expect(screen.getByText(/Crash reports are always sent/i)).toBeTruthy();
  });

  test('nothing is shown until the stored answer has loaded', async () => {
    useAnalyticsConsentStore.setState({ hydrated: false });
    await renderAsk();

    // Otherwise the sheet flashes at somebody who answered months ago.
    expect(screen.queryByText('Help us make this better?')).toBeNull();
  });

  test('does not appear before onboarding has finished', async () => {
    useLaunchStore.setState({ hasOnboarded: false });
    await renderAsk();

    expect(screen.queryByText('Help us make this better?')).toBeNull();
  });

  test('waits for a milestone celebration rather than piling on top of it', async () => {
    useCelebratedStore.setState({
      showing: { weeks: 4, kind: 'rhythm' } as never,
    });
    await renderAsk();

    expect(screen.queryByText('Help us make this better?')).toBeNull();
  });

  test('waits for the notification ask, which is the more urgent moment', async () => {
    useNotificationAskStore.setState({ pending: 'check_in' });
    await renderAsk();

    expect(screen.queryByText('Help us make this better?')).toBeNull();
  });

  test('yes records consent', async () => {
    await renderAsk();

    await fireEvent.press(screen.getByText("Yes, that's fine"));

    expect(useAnalyticsConsentStore.getState().consent).toBe('granted');
  });

  test('no thanks records a refusal, so it is never asked again', async () => {
    await renderAsk();

    await fireEvent.press(screen.getByText('No thanks'));

    // 'denied', not back to 'unasked': a refusal is an answer, and re-asking next launch
    // would be nagging somebody who already said no.
    expect(useAnalyticsConsentStore.getState().consent).toBe('denied');
  });

  test('once answered it does not come back', async () => {
    const view = await renderAsk();
    await fireEvent.press(screen.getByText('No thanks'));
    await view.rerender(
      <ThemeScope name="light">
        <AnalyticsAsk />
      </ThemeScope>,
    );

    expect(screen.queryByText('Help us make this better?')).toBeNull();
  });

  test('refusing is exactly as easy as accepting: one tap, both visible', async () => {
    await renderAsk();

    // Consent has to be freely given (`20`), which in a sheet means the two answers are
    // equally reachable. A hidden or nested "no" would not be consent at all.
    expect(screen.getByText("Yes, that's fine")).toBeTruthy();
    expect(screen.getByText('No thanks')).toBeTruthy();
  });
});
