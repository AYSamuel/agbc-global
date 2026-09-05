import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';

import { useToast } from '@/components/ui/Toast';

/**
 * Open a URL outside the app, and SAY whether it worked.
 *
 * WHY THIS EXISTS. Every outbound tap in the app used to be
 * `void WebBrowser.openBrowserAsync(url)`. The `void` satisfies
 * `no-floating-promises`, so it reads as deliberate and passes review, but it
 * handles nothing: a rejection becomes an unhandled promise rejection, which
 * reaches Sentry and reaches the member as NOTHING AT ALL. They tap Give, the
 * screen sits there, and the only party who finds out is us.
 *
 * Production reported exactly that on 2026-09-04:
 *
 *     Error: Call to function 'ExpoWebBrowser.openBrowserAsync' has been
 *     rejected. -> Caused by: No matching browser activity found
 *
 * Eleven call sites shared the shape: giving (the website and PayPal), the
 * legal pages on three screens, YouTube from the player and from search, and
 * the Academy handoff.
 *
 * THE FALLBACK IS NOT DECORATION, it is the point. `openBrowserAsync` opens a
 * Chrome Custom Tab, which needs a browser implementing `CustomTabsService` and
 * needs that browser to be VISIBLE to this app under Android 11+ package
 * visibility. `Linking.openURL` sends a plain VIEW intent, which a browser can
 * answer without either. So the second attempt genuinely succeeds in cases
 * where the first cannot, rather than failing again more slowly.
 *
 * The repo already knew this and only half-applied it. `features/family/share.ts`
 * checks `canOpenURL` and falls back to the OS share sheet "so the button is
 * never a dead end", and `app/branch/[id].tsx` catches `Linking.openURL` and
 * toasts. The browser calls got neither.
 *
 * DELIBERATELY NOT TOAST-AWARE. `useToast` is a React context hook and one
 * caller (`features/academy/handoff.ts`) is a plain async function with no
 * component around it. Returning a boolean lets every caller report in the way
 * its own surface allows, and keeps this testable without a renderer.
 *
 * @returns true if some app took the URL; false if nothing could open it, in
 *   which case the CALLER owes the member a message.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (url === '') return false;

  try {
    await WebBrowser.openBrowserAsync(url);
    return true;
  } catch {
    // Custom Tabs could not resolve. Fall through: a plain VIEW intent asks a
    // different question and often gets a different answer.
  }

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * The same thing, wired to a toast, for screens that have one.
 *
 * Seven screens share the "open a link, and say so if it will not open"
 * shape, and repeating the handler in each is seven chances to omit the
 * message. `features/academy/handoff.ts` deliberately does NOT use this: it is
 * a plain async function outside any component, so it reports through its
 * return value instead.
 */
export function useOpenExternal(): (url: string) => void {
  const toast = useToast();
  const { t } = useTranslation();

  return useCallback(
    (url: string) => {
      void openExternal(url).then((opened) => {
        if (!opened) toast.show(t('errors:somethingWrong'));
      });
    },
    [toast, t],
  );
}
