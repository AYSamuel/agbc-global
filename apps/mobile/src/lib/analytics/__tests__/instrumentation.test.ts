import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { replayGateAction } from '@/features/auth/replay';
import { queueRsvp } from '@/features/events/rsvp';
import { useGloryPress } from '@/features/family/useGlory';
import { useIntercessionPress } from '@/features/family/useIntercession';
import type { PrayerFeedItem } from '@/features/family/queries';
import { queueCheckIn } from '@/features/rhythm/useImHere';
import { useWriteQueueStore } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import {
  fakeNetwork,
  sentEvents as decodeSent,
  waitForEvent as waitOnWire,
  type BatchEvent,
  type SentRequest,
} from '@/test/postHogWire';

import { shutdownAnalytics } from '../index';
import { analyticsClient } from '../client';
import { useAnalyticsConsentStore } from '../consent';

// W2.10 slice 2: the instrumented chokepoints, proven on the WIRE. The consent
// suite (analytics.test.ts) proves track()'s own contract; these prove that the
// mutation layer actually reaches it with the right event and the right
// properties, through the REAL posthog-react-native with only the network faked
// (~/.claude/standards/qa-testing.md). The derived properties are the point:
// `own_branch` and `visiting` compare against the member's HOME branch, `stage`
// follows the two-step, and the undo paths must send nothing at all.

// `client.ts` reads the key at module scope, and static imports hoist above any
// assignment this file could make. jest.mock calls hoist further still, and the
// factory runs at the module's first require: setting the env var there puts it
// in place moments before requireActual evaluates the module that reads it.
jest.mock('../client', () => {
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_instrumentation';
  /* eslint-disable-next-line @typescript-eslint/no-unsafe-return */
  return jest.requireActual('../client');
});

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return --
   documented jest.mock factory shape */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

// The optimistic halves (gloryCache, rhythmCache, rsvp) write into the app's
// one query client. gcTime 0, because every cache entry otherwise arms the
// default 5-minute GC timer, which is an open handle jest waits on (the same
// lesson the auth flow suite records).
const mockQueryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: 0 } },
});
jest.mock('@/lib/queryPersist', () => ({
  get queryClient() {
    return mockQueryClient;
  },
}));

// The replay module imports the router for its navigation executors; none of
// the kinds driven here navigate.
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const HOME_BRANCH = '00000000-0000-4000-8000-00000000b0e1';
const OTHER_BRANCH = '00000000-0000-4000-8000-00000000b0e2';

const requests: SentRequest[] = [];

async function sentEvents() {
  return decodeSent(requests);
}

async function waitForEvent(
  name: string,
  matches?: (event: BatchEvent) => boolean,
) {
  return waitOnWire(
    requests,
    async () => {
      await analyticsClient()?.flush();
    },
    name,
    matches,
  );
}

function prayer(overrides: Partial<PrayerFeedItem> = {}): PrayerFeedItem {
  return {
    id: 'p1',
    branch_id: HOME_BRANCH,
    body: "Please pray for my mother's recovery.",
    language: 'en',
    is_anonymous: false,
    answered_at: null,
    praying_count: 3,
    prayed_count: 1,
    created_at: '2026-08-01T08:00:00Z',
    author_id: 'a2',
    author_name: 'Daniel Kern',
    author_avatar_url: null,
    answer_testimony_id: null,
    my_answer_testimony_status: null,
    my_intercession_state: null,
    is_mine: false,
    ...overrides,
  };
}

beforeEach(async () => {
  requests.length = 0;
  jest.clearAllMocks();
  fakeNetwork(requests);
  mockQueryClient.clear();
  await AsyncStorage.clear();
  useWriteQueueStore.setState({
    queue: {},
    handlers: null,
    onEvicted: null,
    draining: false,
    failures: 0,
  });
  // A signed-in member whose HOME branch is known, BROWSING their own branch:
  // the standard `branch_id` reads the browsed chip, while `own_branch` and
  // `visiting` must read the profile. The tests that cross a border vary one
  // side and assert the property followed the right one.
  useAuthStore.setState({
    status: 'member',
    profile: {
      displayName: 'Ayo',
      branchId: HOME_BRANCH,
      language: 'en',
      role: 'member',
    },
  });
  useBranchStore.setState({
    branch: {
      id: HOME_BRANCH,
      slug: 'glasgow',
      name: 'AGBC Glasgow',
      timezone: 'Europe/London',
    },
  });
  useAnalyticsConsentStore.getState().grant();
});

afterEach(async () => {
  // The real SDK keeps a flush timer; left running, one test's late batch lands
  // among the next test's requests (see analytics.test.ts).
  await shutdownAnalytics();
  useAnalyticsConsentStore.getState().reset();
  jest.restoreAllMocks();
});

describe('rsvp_set at queueRsvp', () => {
  test('carries the status, and a cancellation is still an answer', async () => {
    queueRsvp('e1', 'going');
    queueRsvp('e1', 'cancelled');

    const cancelled = await waitForEvent(
      'rsvp_set',
      (event) => event.properties?.status === 'cancelled',
    );
    expect(cancelled).toBeDefined();
    const statuses = (await sentEvents())
      .filter((event) => event.event === 'rsvp_set')
      .map((event) => event.properties?.status);
    expect(statuses).toEqual(['going', 'cancelled']);
  });

  test('carries the standard properties, and no scope is null scope', async () => {
    queueRsvp('e1', 'interested');

    const event = await waitForEvent('rsvp_set');
    expect(event?.properties?.branch_id).toBe(HOME_BRANCH);
    expect(event?.properties?.role).toBe('member');
    expect(event?.properties?.environment).toBe('development');
    // No call site passed a scope, so the standard null must survive: a call
    // site spreading `scope: undefined` would erase it (lib/analytics/index).
    expect(event?.properties?.scope).toBeNull();
  });
});

describe('attendance_marked at queueCheckIn', () => {
  test('visiting compares the tapped branch with the HOME branch', async () => {
    queueCheckIn(HOME_BRANCH);
    queueCheckIn(OTHER_BRANCH);

    const away = await waitForEvent(
      'attendance_marked',
      (event) => event.properties?.visiting === true,
    );
    expect(away?.properties?.source).toBe('here_button');
    const home = (await sentEvents()).find(
      (event) =>
        event.event === 'attendance_marked' &&
        event.properties?.visiting === false,
    );
    expect(home).toBeDefined();
  });
});

describe('glory_tapped at the reaction toggle', () => {
  test('fires on the ON tap with own_branch and scope; the undo sends nothing', async () => {
    const { result, rerender } = await renderHook(
      ({ reacted }: { reacted: boolean }) =>
        useGloryPress('t1', 14, reacted, jest.fn(), {
          branchId: OTHER_BRANCH,
          scope: 'everywhere',
        }),
      { initialProps: { reacted: false } },
    );
    await act(() => {
      result.current.onPress();
    });

    const event = await waitForEvent('glory_tapped');
    // The testimony lives at another branch: the tap crossed a border, which is
    // exactly what north star 3 counts (docs/spec/22 §5).
    expect(event?.properties?.own_branch).toBe(false);
    expect(event?.properties?.scope).toBe('everywhere');

    await rerender({ reacted: true });
    await act(() => {
      result.current.onPress();
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await analyticsClient()?.flush();
    const gloryEvents = (await sentEvents()).filter(
      (event_) => event_.event === 'glory_tapped',
    );
    expect(gloryEvents).toHaveLength(1);
  });

  test('a tap on the home branch is own_branch: true', async () => {
    const { result } = await renderHook(() =>
      useGloryPress('t2', 3, false, jest.fn(), { branchId: HOME_BRANCH }),
    );
    await act(() => {
      result.current.onPress();
    });

    const event = await waitForEvent('glory_tapped');
    expect(event?.properties?.own_branch).toBe(true);
    // This surface has no scope, and inventing one is the W2.4 bug: the
    // standard null must be what arrives.
    expect(event?.properties?.scope).toBeNull();
  });
});

describe('i_prayed_tapped at the two-step', () => {
  test('names the stage each step, and the undo sends nothing', async () => {
    const { result, rerender } = await renderHook(
      ({ row }: { row: PrayerFeedItem }) =>
        useIntercessionPress(row, jest.fn(), 'branch'),
      { initialProps: { row: prayer() } },
    );
    await act(() => {
      result.current.onPress?.();
    });
    const first = await waitForEvent('i_prayed_tapped');
    expect(first?.properties?.stage).toBe('will_pray');
    expect(first?.properties?.own_branch).toBe(true);
    expect(first?.properties?.scope).toBe('branch');

    // The undo is a correction, not a tap: nothing may be sent for it.
    await act(() => {
      result.current.onUndo?.();
    });

    await rerender({ row: prayer({ my_intercession_state: 'committed' }) });
    await act(() => {
      result.current.onPress?.();
    });
    const second = await waitForEvent(
      'i_prayed_tapped',
      (event) => event.properties?.stage === 'prayed',
    );
    expect(second).toBeDefined();
    const all = (await sentEvents()).filter(
      (event) => event.event === 'i_prayed_tapped',
    );
    expect(all).toHaveLength(2);
  });

  test('a commitment across a border is own_branch: false', async () => {
    const { result } = await renderHook(() =>
      useIntercessionPress(prayer({ branch_id: OTHER_BRANCH }), jest.fn()),
    );
    await act(() => {
      result.current.onPress?.();
    });

    const event = await waitForEvent('i_prayed_tapped');
    expect(event?.properties?.own_branch).toBe(false);
  });
});

describe('gate_converted at the replay executor', () => {
  test('follows a completed replay, and only a completed one', async () => {
    await replayGateAction({ kind: 'glory', testimonyId: 't1' });
    // 'report' has no executor yet: it resolves 'noop', and a member left to
    // redo the action by hand was not converted by the gate.
    await replayGateAction({ kind: 'block' });

    const converted = await waitForEvent('gate_converted');
    expect(converted?.properties?.action_type).toBe('glory');
    const kinds = (await sentEvents())
      .filter((event) => event.event === 'gate_converted')
      .map((event) => event.properties?.action_type);
    expect(kinds).toEqual(['glory']);
  });
});

describe('before consent', () => {
  test('the instrumented paths send no data at all', async () => {
    useAnalyticsConsentStore.getState().reset();

    queueRsvp('e1', 'going');
    queueCheckIn(HOME_BRANCH);
    await replayGateAction({ kind: 'glory', testimonyId: 't1' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(requests.some((request) => request.url.includes('/batch'))).toBe(
      false,
    );
    expect(await sentEvents()).toHaveLength(0);
  });
});
