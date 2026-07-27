import { QueryClient } from '@tanstack/react-query';

import { applyGloryToCaches } from '../gloryCache';
import { testimonyFeedKey, type TestimonyFeedItem } from '../queries';

// `applyGloryToCaches` is the single place a Glory changes what is on screen, so
// it is tested against a REAL QueryClient seeded with the keys the app actually
// uses. A hand-rolled stand-in for the cache would only prove that the code does
// what I believe setQueriesData does, rather than that setQueriesData does it,
// and the distance between those two is where the flicker lived.

// `mock` prefix so the jest.mock factory may close over it.
const mockClient = new QueryClient();

// queries.ts pulls in the Supabase client at module scope; this suite only needs
// its key builders.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

jest.mock('@/lib/queryPersist', () => ({
  // A getter, not a value: imports are hoisted above the const, so reading it
  // eagerly hands the module under test an undefined client.
  get queryClient() {
    return mockClient;
  },
}));

const ROW: TestimonyFeedItem = {
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

const FEED = testimonyFeedKey('everywhere', null);

function feed(): TestimonyFeedItem[] | undefined {
  return mockClient.getQueryData<TestimonyFeedItem[]>(FEED);
}

beforeEach(() => {
  mockClient.clear();
});

test('it reaches the feed under its real, fully-qualified key', () => {
  // ['family','testimonies','everywhere',null] has to be matched by a caller
  // that only names ['family','testimonies'].
  mockClient.setQueryData(FEED, [ROW]);
  applyGloryToCaches('t1', true);
  expect(feed()?.[0]).toMatchObject({ glory_count: 5, reacted_by_me: true });
});

test('and the branch feed, the detail screen and Home together', () => {
  // One testimony is cached under several surfaces; a member who reacts on one
  // must not find another disagreeing when they navigate to it.
  mockClient.setQueryData(testimonyFeedKey('branch', 'b1'), [ROW]);
  mockClient.setQueryData(['family', 'testimony', 't1'], ROW);
  mockClient.setQueryData(['family', 'latest-testimony'], ROW);

  applyGloryToCaches('t1', true);

  expect(
    mockClient.getQueryData<TestimonyFeedItem[]>(
      testimonyFeedKey('branch', 'b1'),
    ),
  ).toEqual([expect.objectContaining({ reacted_by_me: true })]);
  expect(mockClient.getQueryData(['family', 'testimony', 't1'])).toMatchObject({
    reacted_by_me: true,
  });
  expect(mockClient.getQueryData(['family', 'latest-testimony'])).toMatchObject(
    {
      reacted_by_me: true,
    },
  );
});

test('other testimonies are untouched', () => {
  // The rule this whole slice turns on: reacting to one post must not reach
  // another.
  mockClient.setQueryData(FEED, [ROW, { ...ROW, id: 't2', glory_count: 9 }]);
  applyGloryToCaches('t1', true);
  expect(feed()?.[1]).toMatchObject({
    id: 't2',
    glory_count: 9,
    reacted_by_me: false,
  });
});

test('applying the same answer twice does not double the count', () => {
  // A tap, a refusal revert, and a refetch that already agreed can all run over
  // the same row; the count must not drift with how many times this happens.
  mockClient.setQueryData(FEED, [ROW]);
  applyGloryToCaches('t1', true);
  applyGloryToCaches('t1', true);
  expect(feed()?.[0].glory_count).toBe(5);
});

test('taking it back returns the count exactly', () => {
  mockClient.setQueryData(FEED, [ROW]);
  applyGloryToCaches('t1', true);
  applyGloryToCaches('t1', false);
  expect(feed()?.[0]).toMatchObject({ glory_count: 4, reacted_by_me: false });
});

test('a count already at zero cannot be driven negative', () => {
  mockClient.setQueryData(FEED, [
    { ...ROW, glory_count: 0, reacted_by_me: true },
  ]);
  applyGloryToCaches('t1', false);
  expect(feed()?.[0].glory_count).toBe(0);
});

test('a query holding no data yet is left alone, not filled with a stray row', () => {
  mockClient.setQueryData(FEED, undefined);
  applyGloryToCaches('t1', true);
  expect(mockClient.getQueryData(FEED)).toBeUndefined();
});
