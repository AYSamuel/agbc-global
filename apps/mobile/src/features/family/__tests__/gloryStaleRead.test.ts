import { QueryClient } from '@tanstack/react-query';

import {
  applyGloryToCaches,
  reconcileGlory,
  resetLocalGlory,
} from '../gloryCache';
import { testimonyFeedKey, type TestimonyFeedItem } from '../queries';

// The last race of this family, written as a failing test first.
//
// A feed refetch can already be in flight when the member taps: it left before
// the reaction existed, so it answers with a row that predates it. If that
// answer is simply written into the cache, it silently undoes the tap and the
// card goes back to un-reacted until something else refreshes it.
//
// Nothing about this is visible to a test that patches the cache and reads it
// back. It needs two operations overlapping in time, which is the shape none of
// the earlier tests in this slice had.

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockClient = new QueryClient();

jest.mock('@/lib/queryPersist', () => ({
  get queryClient() {
    return mockClient;
  },
}));

const FEED = testimonyFeedKey('everywhere', null);

const SERVER_ROW: TestimonyFeedItem = {
  id: 't1',
  branch_id: 'b1',
  body: 'God provided',
  language: 'en',
  category_key: null,
  image_path: null,
  glory_count: 4,
  created_at: '2026-07-27T10:00:00Z',
  author_id: 'a1',
  author_name: 'Grace A.',
  author_avatar_url: null,
  from_prayer_id: null,
  origin_prayer_id: null,
  reacted_by_me: false,
};

beforeEach(() => {
  mockClient.clear();
  resetLocalGlory();
});

test('a fetch that left before the tap cannot undo it', async () => {
  mockClient.setQueryData(FEED, [SERVER_ROW]);

  // A refetch begins. It will answer with what the server knew at this moment.
  const startedAt = Date.now();
  await new Promise((resolve) => setTimeout(resolve, 5));

  // The member taps while it is still in flight.
  applyGloryToCaches('t1', true);
  expect(mockClient.getQueryData<TestimonyFeedItem[]>(FEED)?.[0]).toMatchObject(
    { glory_count: 5, reacted_by_me: true },
  );

  // Now the stale answer arrives, carrying the pre-tap truth.
  const reconciled = reconcileGlory([SERVER_ROW], startedAt);

  expect(reconciled[0]).toMatchObject({
    glory_count: 5,
    reacted_by_me: true,
  });
});

test('a fetch that left after the tap is trusted completely', async () => {
  // This one genuinely knows more than the app does: it may carry other
  // members' reactions too, so the local value must step aside.
  applyGloryToCaches('t1', true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const startedAt = Date.now();

  const fresh = { ...SERVER_ROW, glory_count: 9, reacted_by_me: true };
  expect(reconcileGlory([fresh], startedAt)[0]).toMatchObject({
    glory_count: 9,
    reacted_by_me: true,
  });
});

test('once the server agrees, the local memory of the tap is dropped', async () => {
  applyGloryToCaches('t1', true);
  await new Promise((resolve) => setTimeout(resolve, 5));

  // A fetch that started after the tap and reflects it: nothing left to hold.
  reconcileGlory(
    [{ ...SERVER_ROW, glory_count: 5, reacted_by_me: true }],
    Date.now(),
  );

  // A later fetch says the member un-reacted elsewhere. With the local value
  // forgotten, that is simply the truth and must be shown.
  const later = reconcileGlory([SERVER_ROW], Date.now());
  expect(later[0]).toMatchObject({ glory_count: 4, reacted_by_me: false });
});

test('rows the member never touched pass through untouched', () => {
  applyGloryToCaches('t1', true);
  const other = { ...SERVER_ROW, id: 't2', glory_count: 9 };
  expect(reconcileGlory([other], 0)[0]).toBe(other);
});
