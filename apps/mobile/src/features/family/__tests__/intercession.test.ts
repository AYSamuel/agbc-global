import { QueryClient } from '@tanstack/react-query';

import { useWriteQueueStore } from '@/lib/writeQueue';

import { prayerFeedKey, type PrayerFeedItem } from '../queries';
import {
  applyIntercessionToCaches,
  reconcileIntercession,
  resetLocalIntercession,
} from '../prayerCache';

// The two-step (docs/spec/09), where the counts are the part that matters: an
// author watching their request sees how many people are praying and how many
// have prayed, and "I prayed" MOVES a person between those two rather than
// adding to either. Getting that wrong shows a congregation a number that is not
// true about them.

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockClient = new QueryClient();

jest.mock('@/lib/queryPersist', () => ({
  get queryClient() {
    return mockClient;
  },
}));

const P = 'c3333333-3333-4333-8333-333333333333';
const FEED = prayerFeedKey('everywhere', null);

const ROW: PrayerFeedItem = {
  id: P,
  branch_id: 'b1',
  body: 'Please pray for my mother',
  language: 'en',
  is_anonymous: false,
  answered_at: null,
  praying_count: 24,
  prayed_count: 9,
  created_at: '2026-07-27T10:00:00Z',
  author_id: 'a1',
  author_name: 'Sarah O.',
  author_avatar_url: null,
  answer_testimony_id: null,
  my_answer_testimony_status: null,
  my_intercession_state: null,
  is_mine: false,
};

function row(): PrayerFeedItem {
  const rows = mockClient.getQueryData<PrayerFeedItem[]>(FEED);
  if (!rows?.[0]) throw new Error('the feed fixture is missing');
  return rows[0];
}

beforeEach(() => {
  mockClient.clear();
  mockClient.setQueryData(FEED, [ROW]);
  resetLocalIntercession();
  useWriteQueueStore.setState({ queue: {}, handlers: null, onEvicted: null });
});

describe('the counts through both steps', () => {
  test('"I will pray" adds one to praying and nothing to prayed', () => {
    applyIntercessionToCaches(P, 'committed');
    expect(row()).toMatchObject({
      my_intercession_state: 'committed',
      praying_count: 25,
      prayed_count: 9,
    });
  });

  test('"I prayed" MOVES the member: praying down, prayed up', () => {
    // Not "prayed + 1". The member stops being someone who is going to pray and
    // becomes someone who has, which is the whole point of the second step.
    applyIntercessionToCaches(P, 'committed');
    applyIntercessionToCaches(P, 'prayed');
    expect(row()).toMatchObject({
      my_intercession_state: 'prayed',
      praying_count: 24,
      prayed_count: 10,
    });
  });

  test('applying the same step twice moves nothing', () => {
    applyIntercessionToCaches(P, 'committed');
    applyIntercessionToCaches(P, 'committed');
    expect(row()).toMatchObject({ praying_count: 25, prayed_count: 9 });
  });

  test('counts never go negative on a row that disagrees', () => {
    // A stale row saying nobody is praying, plus a fulfilment: the arithmetic
    // must not render minus one people.
    mockClient.setQueryData(FEED, [
      { ...ROW, praying_count: 0, my_intercession_state: 'committed' },
    ]);
    applyIntercessionToCaches(P, 'prayed');
    expect(row()).toMatchObject({ praying_count: 0, prayed_count: 10 });
  });

  test('other requests are untouched', () => {
    mockClient.setQueryData(FEED, [ROW, { ...ROW, id: 'other' }]);
    applyIntercessionToCaches(P, 'committed');
    expect(mockClient.getQueryData<PrayerFeedItem[]>(FEED)?.[1]).toMatchObject({
      id: 'other',
      praying_count: 24,
      prayed_count: 9,
    });
  });
});

describe('taking a step back', () => {
  test('undoing a commitment removes it and returns the praying count', () => {
    applyIntercessionToCaches(P, 'committed');
    applyIntercessionToCaches(P, 'none');
    expect(row()).toMatchObject({
      my_intercession_state: null,
      praying_count: 24,
      prayed_count: 9,
    });
  });

  test('undoing a fulfilment clears it and returns the prayed count', () => {
    applyIntercessionToCaches(P, 'committed');
    applyIntercessionToCaches(P, 'prayed');
    applyIntercessionToCaches(P, 'none');
    expect(row()).toMatchObject({
      my_intercession_state: null,
      praying_count: 24,
      prayed_count: 9,
    });
  });

  test('the whole cycle and back out leaves every count where it started', () => {
    // The arithmetic has to close: an author who watches someone tap through the
    // whole thing and undo must end up seeing what they saw before.
    applyIntercessionToCaches(P, 'committed');
    applyIntercessionToCaches(P, 'prayed');
    applyIntercessionToCaches(P, 'none');
    applyIntercessionToCaches(P, 'committed');
    applyIntercessionToCaches(P, 'none');
    expect(row()).toMatchObject({
      my_intercession_state: null,
      praying_count: 24,
      prayed_count: 9,
    });
  });

  test('undoing something never committed moves nothing', () => {
    applyIntercessionToCaches(P, 'none');
    expect(row()).toMatchObject({
      my_intercession_state: null,
      praying_count: 24,
      prayed_count: 9,
    });
  });
});

describe('a read that left before the tap', () => {
  test('cannot undo the commitment', async () => {
    const startedAt = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5));
    applyIntercessionToCaches(P, 'committed');

    expect(reconcileIntercession([ROW], startedAt)[0]).toMatchObject({
      my_intercession_state: 'committed',
      praying_count: 25,
    });
  });

  test('but a read issued after it is trusted completely', async () => {
    // It may carry other members' commitments too, so the local value steps
    // aside rather than fighting a server that knows more.
    applyIntercessionToCaches(P, 'committed');
    await new Promise((resolve) => setTimeout(resolve, 5));

    const fresh = {
      ...ROW,
      praying_count: 30,
      my_intercession_state: 'committed' as const,
    };
    expect(reconcileIntercession([fresh], Date.now())[0]).toMatchObject({
      praying_count: 30,
    });
  });

  test('and once the server agrees, the local memory is dropped', async () => {
    applyIntercessionToCaches(P, 'committed');
    await new Promise((resolve) => setTimeout(resolve, 5));
    reconcileIntercession(
      [{ ...ROW, my_intercession_state: 'committed', praying_count: 25 }],
      Date.now(),
    );

    // A later read showing the answered/withdrawn state is then simply the truth.
    expect(reconcileIntercession([ROW], Date.now())[0]).toMatchObject({
      my_intercession_state: null,
      praying_count: 24,
    });
  });
});
