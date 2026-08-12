import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { hasAnalyticsConsent } from './consent';

// The PostHog client (docs/spec/01 §7, `22` §5, `20`; ADR 0020).
//
// Three properties this module is built to have, in order of importance:
//
// 1. **It does not exist until somebody says yes.** The client is constructed lazily on
//    the first capture AFTER consent, so a member who declines has no queue on disk, no
//    stored device id, and no network calls. Our consent store is the ONE mechanism, and
//    deliberately not two: an earlier version also passed `defaultOptIn: false` as belt and
//    braces, which silently swallowed the first event of every session, because `optIn()`
//    is async and the capture that triggered construction ran before it resolved. Two
//    owners of one fact, and the quieter one won (the W2.4 lesson, in a new place). The
//    test that proves nothing is sent before consent asserts on HTTP, so it holds this
//    invariant without a second flag inside the SDK.
// 2. **No key means no analytics, silently and safely.** Local dev and CI have no key,
//    and that must be a no-op rather than a crash or a warning nobody can act on.
// 3. **No native module.** Every native-ish peer of posthog-react-native is optional, so
//    passing our own storage and app properties keeps this JS-only, which is why the dev
//    clients on the devices survive it (only Sentry needs the rebuild). The require is
//    still guarded, because a package that reaches for a missing optional module at
//    import time would otherwise take a route down with it.

interface PostHogCustomStorage {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
}

interface PostHogClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  optIn: () => Promise<void>;
  optOut: () => Promise<void>;
  reset: () => void;
  flush: () => Promise<void>;
  shutdown: (timeoutMs?: number) => Promise<void>;
}

interface PostHogConstructor {
  new (
    apiKey: string,
    options: {
      host: string;
      customStorage: PostHogCustomStorage;
      customAppProperties: Record<string, string | null>;
      captureAppLifecycleEvents: boolean;
      enableSessionReplay: boolean;
      disableGeoip: boolean;
      preloadFeatureFlags: boolean;
      disableRemoteConfig: boolean;
      disableSurveys: boolean;
    },
  ): PostHogClient;
}

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
/** EU cloud is not the SDK default, and residency is a `20` requirement, not a preference. */
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

function loadPostHog(): PostHogConstructor | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('posthog-react-native') as {
      default?: PostHogConstructor;
    };
    return module.default ?? null;
  } catch {
    return null;
  }
}

/**
 * What PostHog would otherwise assemble from expo-application and expo-device. Supplied
 * explicitly for two reasons: those are native modules we have not added, and the default
 * set includes `$device_name`, which on both platforms is whatever the owner typed into
 * their settings and is regularly a person's own name. An analytics payload is not the
 * place for it, and the honest way to leave it out is to stop generating it.
 */
function appProperties(): Record<string, string | null> {
  return {
    $app_version: Constants.expoConfig?.version ?? null,
    $app_name: Constants.expoConfig?.name ?? null,
    $os_name: Platform.OS === 'ios' ? 'iOS' : 'Android',
    $os_version: String(Platform.Version),
    $device_type: 'Mobile',
    $locale: getLocales()[0].languageTag,
  };
}

let client: PostHogClient | null = null;
let unavailable = false;

/**
 * The live client, or null when analytics is off for any reason (no key, no consent, the
 * package could not load). Callers never branch on why.
 */
export function analyticsClient(): PostHogClient | null {
  if (!hasAnalyticsConsent()) return null;
  if (client) return client;
  if (unavailable || !KEY) return null;

  const PostHog = loadPostHog();
  if (!PostHog) {
    unavailable = true;
    return null;
  }

  client = new PostHog(KEY, {
    host: HOST,
    customStorage: {
      getItem: (key) => AsyncStorage.getItem(key),
      setItem: (key, value) => AsyncStorage.setItem(key, value),
    },
    customAppProperties: appProperties(),
    // The MAU denominator. North star 1 is "% of MAU who posted or reacted", and without
    // an event for simply opening the app, MAU would only ever count contributors and the
    // ratio would read ~100% forever. These are the SDK's own lifecycle events (Installed,
    // Updated, Opened, Became Active, Backgrounded), not additions to `22` §5's product
    // list, and they fire only after consent like everything else here.
    captureAppLifecycleEvents: true,
    enableSessionReplay: false,
    // Location we need comes from branch_id, which is truer than an IP guess. Turning the
    // enrichment off means PostHog stores less about where a member physically is.
    disableGeoip: true,
    // This project uses PostHog for events and nothing else. Left on, the SDK also fetches
    // remote config and POSTs a flag evaluation carrying a distinct id and device
    // properties on every start (seen in the tests' captured requests, which is how this
    // was noticed). No flags, no surveys, so all three are off: fewer requests, and less
    // about a member sitting in a vendor's logs for a feature we do not use.
    preloadFeatureFlags: false,
    disableRemoteConfig: true,
    disableSurveys: true,
  });
  return client;
}

/**
 * Consent withdrawn: stop sending, and drop the device id with it. Keeping a pseudonymous
 * identifier after a member says no would leave us holding data with nothing to hold it
 * under (`20` §Consent mechanics: consent is withdrawable and the withdrawal has to reach
 * the data).
 */
export async function shutdownAnalytics(): Promise<void> {
  if (!client) return;
  const stopping = client;
  client = null;
  await stopping.optOut();
  stopping.reset();
  // Also stops the SDK's own flush timer. Without it the instance keeps ticking after a
  // withdrawal, which is both wrong in production and the reason one test's late batch used
  // to surface inside the next test.
  await stopping.shutdown();
}
