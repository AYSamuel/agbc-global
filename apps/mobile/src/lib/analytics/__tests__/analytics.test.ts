import AsyncStorage from '@react-native-async-storage/async-storage';

// The consent gate, which is the one thing in W2.10 that must not be wrong: an event sent
// before somebody agreed is a GDPR failure, not a bug to fix next week (docs/spec/20).
//
// These drive the REAL posthog-react-native and fake only what it talks to, the network
// (~/.claude/standards/qa-testing.md: a hand-rolled stand-in for a library proves the code
// matches your belief about the library, not that it works). Every assertion is therefore
// about HTTP: nothing leaves the device before consent, and what leaves after it carries the
// event, the standard properties, and no identity.
//
// Reading the wire needs two things the SDK does not advertise, both found by instrumenting
// rather than guessing: it posts a GZIPPED Blob (a string body only for small payloads), and
// it batches, so a test that flushes once immediately can look before anything has been
// queued. `waitForEvent` flushes and re-reads until the event shows up, so the tests neither
// sleep on a guessed duration nor race the batcher.

// The analytics module reads `role` from the auth store, which imports the Supabase client,
// which throws without EXPO_PUBLIC_* config. Mocked at the client exactly as the family
// tests do: nothing here calls Supabase, the import just has to not explode.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      getSession: () => Promise.resolve({ data: { session: null } }),
    },
  },
}));

const fetchHost = globalThis as unknown as { fetch: typeof fetch };

interface Sent {
  url: string;
  body: BodyInit | null | undefined;
}

interface BatchEvent {
  event?: string;
  properties?: Record<string, unknown>;
}

let requests: Sent[] = [];

function fakeNetwork() {
  return jest
    .spyOn(fetchHost, 'fetch')
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      requests.push({ url, body: init?.body });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{}'),
      } as Response);
    });
}

/** Just enough of node's zlib to gunzip, typed locally: @types/node is not in this app. */
interface Zlib {
  gunzipSync: (input: Uint8Array) => { toString: (encoding: string) => string };
}

function parseOrNull(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Decodes one request body: plain JSON, or the gzipped Blob the SDK prefers. */
async function decode(body: BodyInit | null | undefined): Promise<unknown> {
  if (typeof body === 'string') return parseOrNull(body);
  if (!(body instanceof Blob)) return null;

  const bytes = new Uint8Array(await body.arrayBuffer());
  const raw = new TextDecoder().decode(bytes);
  if (raw.startsWith('{')) return parseOrNull(raw);
  /* eslint-disable-next-line @typescript-eslint/no-require-imports */
  const zlib = require('zlib') as Zlib;
  return parseOrNull(zlib.gunzipSync(bytes).toString('utf8'));
}

/** Every event actually posted, flattened out of the SDK's batches. */
async function sentEvents(): Promise<BatchEvent[]> {
  const all: BatchEvent[] = [];
  for (const request of requests) {
    const payload = (await decode(request.body)) as {
      batch?: BatchEvent[];
    } | null;
    all.push(...(payload?.batch ?? []));
  }
  return all;
}

/** Flush and re-read until the event appears, or give up. Returns it, or undefined. */
async function waitForEvent(
  client: { analyticsClient: () => { flush: () => Promise<void> } | null },
  name: string,
): Promise<BatchEvent | undefined> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    await client.analyticsClient()?.flush();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const hit = (await sentEvents()).find((event) => event.event === name);
    if (hit) return hit;
  }
  return undefined;
}

// `require` rather than a dynamic import: this Jest runs without --experimental-vm-modules,
// and the modules must be re-evaluated per test so the env var and the module-level
// singleton are read fresh each time.
/* eslint-disable @typescript-eslint/no-require-imports */
function loadAnalytics(key: string | null = 'phc_test') {
  jest.resetModules();
  if (key === null) {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  } else {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = key;
  }
  return {
    analytics: require('../index') as typeof import('../index'),
    consent: require('../consent') as typeof import('../consent'),
    client: require('../client') as typeof import('../client'),
  };
}

/** The modules the current test loaded, so the SDK can be stopped before the next one. */
let loaded: ReturnType<typeof loadAnalytics> | null = null;

describe('analytics consent gate', () => {
  beforeEach(async () => {
    requests = [];
    jest.clearAllMocks();
    fakeNetwork();
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    // The real SDK keeps a flush timer. Left running, one test's late batch lands among the
    // next test's captured requests and the failure appears in the wrong place.
    await loaded?.analytics.shutdownAnalytics();
    loaded = null;
    jest.restoreAllMocks();
  });

  test('nothing reaches the network until consent is granted', async () => {
    loaded = loadAnalytics();
    const { analytics } = loaded;

    analytics.track('map_opened');
    analytics.track('prayer_posted');
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Not "no event": no HTTP AT ALL. Without consent the client is never constructed, so
    // there is also no queue on disk and no device id for somebody who has not answered.
    expect(requests).toHaveLength(0);
  });

  test('an unanswered store means no consent, so the gate fails closed', async () => {
    loaded = loadAnalytics();
    const { analytics, consent } = loaded;

    expect(consent.useAnalyticsConsentStore.getState().consent).toBe('unasked');
    expect(consent.hasAnalyticsConsent()).toBe(false);

    analytics.track('prayer_posted');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(requests).toHaveLength(0);
  });

  test('after consent the event is sent, to the EU host', async () => {
    loaded = loadAnalytics();
    const { analytics, consent, client } = loaded;
    consent.useAnalyticsConsentStore.getState().grant();

    analytics.track('glory_tapped', { own_branch: false, scope: 'everywhere' });

    expect(await waitForEvent(client, 'glory_tapped')).toBeDefined();
    // Residency is a docs/spec/20 requirement, so it is asserted on the wire rather than
    // trusted from a constructor argument.
    expect(
      requests.every((request) => request.url.includes('.i.posthog.com')),
    ).toBe(true);
    expect(
      requests.some((request) =>
        request.url.includes('eu.i.posthog.com/batch'),
      ),
    ).toBe(true);
  });

  test('the sent event carries the standard properties and no identity', async () => {
    loaded = loadAnalytics();
    const { analytics, consent, client } = loaded;
    consent.useAnalyticsConsentStore.getState().grant();

    analytics.track('prayer_posted');
    const event = await waitForEvent(client, 'prayer_posted');

    expect(event?.properties?.branch_id).toBeNull();
    expect(event?.properties?.scope).toBeNull();
    expect(event?.properties?.role).toBe('guest');
    expect(typeof event?.properties?.locale).toBe('string');
    // The fifth standard property (ADR 0020 amendment): one PostHog project holds dev and
    // production, so every event has to say which it is or the north stars include our own
    // testing. Jest runs with __DEV__ true, which is exactly the case that must be tagged.
    expect(event?.properties?.environment).toBe('development');
    // ADR 0020: analytics identity is the device and nothing else. Whatever else the SDK
    // decorates an event with, none of these may ever appear.
    const keys = Object.keys(event?.properties ?? {});
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('profile_id');
    expect(keys).not.toContain('$user_id');
    // $device_name is regularly a person's own name, which is why the app supplies its own
    // app properties rather than letting expo-device fill them in.
    expect(keys).not.toContain('$device_name');
    // Geo enrichment off, asserted where it actually shows up (docs/spec/20 minimisation).
    expect(event?.properties?.$geoip_disable).toBe(true);
  });

  test('a scoped call site sets scope; nothing else invents it', async () => {
    loaded = loadAnalytics();
    const { analytics, consent, client } = loaded;
    consent.useAnalyticsConsentStore.getState().grant();

    analytics.track('map_opened', { scope: 'branch' });

    expect((await waitForEvent(client, 'map_opened'))?.properties?.scope).toBe(
      'branch',
    );
  });

  test('the app-open event exists, because MAU needs a denominator', async () => {
    loaded = loadAnalytics();
    const { consent, client } = loaded;
    consent.useAnalyticsConsentStore.getState().grant();
    // Construction alone: north star 1 is a share OF MAU, so opening the app has to count
    // even when the member does nothing (see client.ts on captureAppLifecycleEvents).
    client.analyticsClient();

    expect(await waitForEvent(client, 'Application Opened')).toBeDefined();
  });

  test('withdrawing consent stops the sending', async () => {
    loaded = loadAnalytics();
    const { analytics, consent, client } = loaded;
    consent.useAnalyticsConsentStore.getState().grant();
    analytics.track('map_opened');
    expect(await waitForEvent(client, 'map_opened')).toBeDefined();

    consent.useAnalyticsConsentStore.getState().deny();
    await analytics.shutdownAnalytics();
    requests = [];

    analytics.track('prayer_posted');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await sentEvents()).toHaveLength(0);
  });

  test('consent without a project key is still silent, and never throws', async () => {
    loaded = loadAnalytics(null);
    const { analytics, consent } = loaded;
    consent.useAnalyticsConsentStore.getState().grant();

    expect(() => {
      analytics.track('map_opened');
    }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 300));
    // No DATA, rather than no HTTP. An earlier test's SDK instance schedules a remote-config
    // GET at construction that `shutdown()` does not cancel, so it can land here a second
    // later; the claim under test is that a missing key sends nothing, which is what these
    // two assertions say. The pre-consent tests above keep the stronger no-HTTP-at-all form,
    // where nothing has run before them to leave anything in flight.
    expect(requests.some((request) => request.url.includes('/batch'))).toBe(
      false,
    );
    expect(await sentEvents()).toHaveLength(0);
  });

  test('a network failure never breaks the tap that caused it', () => {
    jest.restoreAllMocks();
    jest
      .spyOn(fetchHost, 'fetch')
      .mockRejectedValue(new Error('transport exploded'));
    loaded = loadAnalytics();
    const { analytics, consent } = loaded;
    consent.useAnalyticsConsentStore.getState().grant();

    expect(() => {
      analytics.track('map_opened');
    }).not.toThrow();
  });

  test('the answer survives a restart, so nobody is asked twice', async () => {
    loaded = loadAnalytics();
    const store = loaded.consent.useAnalyticsConsentStore;
    store.getState().deny();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The answer is on disk, under the key a real launch reads. Read through the SAME module
    // instance the store wrote with: `loadAnalytics` resets the registry, so this file's
    // top-level AsyncStorage import is a different object with a different in-memory map.
    const storage = (
      require('@react-native-async-storage/async-storage') as {
        default: typeof AsyncStorage;
      }
    ).default;
    const persisted = await storage.getItem('agbc-analytics-consent');
    expect(persisted).toContain('denied');

    // Second half: a fresh launch that finds exactly that payload on disk restores it.
    //
    // Two dead ends are worth recording, because both look like they work. Re-requiring the
    // module resets the AsyncStorage mock too, so the "next launch" reads an empty disk.
    // And setting the store back to 'unasked' before rehydrating overwrites the answer,
    // because the persist middleware writes on EVERY state change: the restore then
    // correctly restores 'unasked'. So the payload the real `deny()` wrote is replayed into
    // a fresh registry instead, which is what a real second launch does.
    jest.resetModules();
    const freshStorage = (
      require('@react-native-async-storage/async-storage') as {
        default: typeof AsyncStorage;
      }
    ).default;
    await freshStorage.setItem('agbc-analytics-consent', persisted as string);
    const relaunched = require('../consent') as typeof import('../consent');

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (relaunched.useAnalyticsConsentStore.getState().hydrated) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(relaunched.useAnalyticsConsentStore.getState().consent).toBe(
      'denied',
    );
    expect(relaunched.hasAnalyticsConsent()).toBe(false);
  });
});
