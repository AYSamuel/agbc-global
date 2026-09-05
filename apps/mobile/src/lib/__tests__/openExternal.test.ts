import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { openExternal } from '@/lib/openExternal';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const openBrowserAsync = WebBrowser.openBrowserAsync as jest.MockedFunction<
  typeof WebBrowser.openBrowserAsync
>;
let openURL: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  openURL.mockRestore();
});

/**
 * The rejection this covers is not hypothetical: production raised
 * "No matching browser activity found" on 2026-09-04, and every call site
 * answered it with silence.
 */
describe('opening a URL outside the app', () => {
  test('the custom tab is preferred, and nothing else is tried', async () => {
    openBrowserAsync.mockResolvedValue({ type: 'opened' } as never);

    await expect(openExternal('https://www.agbcglobal.com/give')).resolves.toBe(
      true,
    );
    expect(openBrowserAsync).toHaveBeenCalledWith(
      'https://www.agbcglobal.com/give',
    );
    expect(openURL).not.toHaveBeenCalled();
  });

  test('a rejected custom tab falls back to a plain VIEW intent', async () => {
    // The exact production failure. Custom Tabs needs a browser implementing
    // CustomTabsService AND visible under Android 11+ package visibility;
    // Linking.openURL needs neither, so this is a real second chance rather
    // than the same attempt repeated.
    openBrowserAsync.mockRejectedValue(
      new Error(
        "Call to function 'ExpoWebBrowser.openBrowserAsync' has been rejected. → Caused by: No matching browser activity found",
      ),
    );

    await expect(openExternal('https://www.agbcglobal.com/give')).resolves.toBe(
      true,
    );
    expect(openURL).toHaveBeenCalledWith('https://www.agbcglobal.com/give');
  });

  test('it reports failure only when BOTH routes are gone', async () => {
    openBrowserAsync.mockRejectedValue(new Error('no custom tabs'));
    openURL.mockRejectedValue(new Error('no activity'));

    await expect(openExternal('https://www.agbcglobal.com/give')).resolves.toBe(
      false,
    );
  });

  test('it never throws, because callers use it inside a press handler', async () => {
    // The bug being fixed WAS an unhandled rejection. A helper that can throw
    // would move the same failure one layer up rather than removing it.
    openBrowserAsync.mockRejectedValue(new Error('boom'));
    openURL.mockRejectedValue(new Error('boom'));

    await expect(openExternal('https://example.com')).resolves.toBe(false);
  });

  test('an empty URL is a failure, not an attempt', async () => {
    // `config.paypalUrl ?? ''` reaches here when remote config has no PayPal
    // link. Opening "" used to raise its own rejection; saying false lets the
    // caller tell the member instead.
    await expect(openExternal('')).resolves.toBe(false);
    expect(openBrowserAsync).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });
});
