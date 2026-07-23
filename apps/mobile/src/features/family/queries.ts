import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// Family reads (docs/spec/09). Everything here goes through the FEED VIEWS, never
// the base tables: `testimonies` and `prayers` grant anon nothing, and an anonymous
// request's author_id does not exist in prayer_feed's output at all (ADR 0013). If
// you ever find yourself reaching for .from('prayers') in the app, that is the bug.
//
// Scope (docs/spec/09): "My branch" filters on branch_id, "Everywhere" drops the
// filter. Everywhere is the default so the one-family-many-nations reality is felt.

export type FamilyScope = 'everywhere' | 'branch';

export interface TestimonyFeedItem {
  id: string;
  branch_id: string;
  body: string;
  language: string;
  category_key: string | null;
  image_url: string | null;
  glory_count: number;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  /** Set only while the origin prayer is itself publicly visible (docs/spec/09). */
  origin_prayer_id: string | null;
}

export interface PrayerFeedItem {
  id: string;
  branch_id: string;
  body: string;
  language: string;
  is_anonymous: boolean;
  answered_at: string | null;
  praying_count: number;
  prayed_count: number;
  created_at: string;
  /** NULL for anonymous requests: stripped server-side, not hidden client-side. */
  author_id: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  answer_testimony_id: string | null;
}

const TESTIMONY_FIELDS =
  'id, branch_id, body, language, category_key, image_url, glory_count, created_at, author_id, author_name, author_avatar_url, origin_prayer_id';

const PRAYER_FIELDS =
  'id, branch_id, body, language, is_anonymous, answered_at, praying_count, prayed_count, created_at, author_id, author_name, author_avatar_url, answer_testimony_id';

const FEED_LIMIT = 50;

// Postgres cannot prove NOT NULL through a view, so every column the generated
// types expose for testimony_feed / prayer_feed is `T | null`, even the ones that
// are NOT NULL in the base table (id, body, created_at, the counts). These mappers
// narrow once, here at the data boundary, so components never carry that noise. A
// row whose id or body is somehow null is dropped rather than rendered blank: it
// would be a bug in the view, not a legitimate empty state.

type TestimonyRow = Record<string, unknown>;
type PrayerRow = Record<string, unknown>;

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function mapTestimony(row: TestimonyRow): TestimonyFeedItem | null {
  const id = str(row.id);
  const branchId = str(row.branch_id);
  const body = str(row.body);
  const createdAt = str(row.created_at);
  if (!id || !branchId || !body || !createdAt) return null;
  return {
    id,
    branch_id: branchId,
    body,
    language: str(row.language) ?? 'en',
    category_key: str(row.category_key),
    image_url: str(row.image_url),
    glory_count: num(row.glory_count),
    created_at: createdAt,
    author_id: str(row.author_id),
    author_name: str(row.author_name),
    author_avatar_url: str(row.author_avatar_url),
    origin_prayer_id: str(row.origin_prayer_id),
  };
}

function mapPrayer(row: PrayerRow): PrayerFeedItem | null {
  const id = str(row.id);
  const branchId = str(row.branch_id);
  const body = str(row.body);
  const createdAt = str(row.created_at);
  if (!id || !branchId || !body || !createdAt) return null;
  return {
    id,
    branch_id: branchId,
    body,
    language: str(row.language) ?? 'en',
    is_anonymous: row.is_anonymous === true,
    answered_at: str(row.answered_at),
    praying_count: num(row.praying_count),
    prayed_count: num(row.prayed_count),
    created_at: createdAt,
    author_id: str(row.author_id),
    author_name: str(row.author_name),
    author_avatar_url: str(row.author_avatar_url),
    answer_testimony_id: str(row.answer_testimony_id),
  };
}

// The feed is realtime-first and polling-bounded (docs/spec/02): the family channel
// pushes changes, and a 60s refetch is the worst-case ceiling if the socket drops.
// staleTime sits under that so a focus refetch is never served a stale cache.
const FEED_STALE_TIME = 30_000;

export function testimonyFeedKey(scope: FamilyScope, branchId: string | null) {
  return ['family', 'testimonies', scope, scope === 'branch' ? branchId : null];
}

export function prayerFeedKey(scope: FamilyScope, branchId: string | null) {
  return ['family', 'prayers', scope, scope === 'branch' ? branchId : null];
}

export function useTestimonyFeedQuery(
  scope: FamilyScope,
  branchId: string | null,
) {
  return useQuery({
    queryKey: testimonyFeedKey(scope, branchId),
    queryFn: async (): Promise<TestimonyFeedItem[]> => {
      let request = supabase
        .from('testimony_feed')
        .select(TESTIMONY_FIELDS)
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (scope === 'branch' && branchId) {
        request = request.eq('branch_id', branchId);
      }
      const { data, error } = await request;
      if (error) throw new Error(error.message);
      return data
        .map(mapTestimony)
        .filter((r): r is TestimonyFeedItem => r !== null);
    },
    // "My branch" with no chosen branch would silently mean Everywhere; the screen
    // keeps the toggle on Everywhere in that case, so this should never fire.
    enabled: scope === 'everywhere' || Boolean(branchId),
    staleTime: FEED_STALE_TIME,
  });
}

export function usePrayerFeedQuery(
  scope: FamilyScope,
  branchId: string | null,
) {
  return useQuery({
    queryKey: prayerFeedKey(scope, branchId),
    queryFn: async (): Promise<PrayerFeedItem[]> => {
      let request = supabase
        .from('prayer_feed')
        .select(PRAYER_FIELDS)
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (scope === 'branch' && branchId) {
        request = request.eq('branch_id', branchId);
      }
      const { data, error } = await request;
      if (error) throw new Error(error.message);
      return data.map(mapPrayer).filter((r): r is PrayerFeedItem => r !== null);
    },
    enabled: scope === 'everywhere' || Boolean(branchId),
    staleTime: FEED_STALE_TIME,
  });
}

export function useTestimonyQuery(id: string) {
  return useQuery({
    queryKey: ['family', 'testimony', id] as const,
    queryFn: async (): Promise<TestimonyFeedItem | null> => {
      const { data, error } = await supabase
        .from('testimony_feed')
        .select(TESTIMONY_FIELDS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null ? null : mapTestimony(data);
    },
    staleTime: FEED_STALE_TIME,
  });
}

export function usePrayerQuery(id: string) {
  return useQuery({
    queryKey: ['family', 'prayer', id] as const,
    queryFn: async (): Promise<PrayerFeedItem | null> => {
      const { data, error } = await supabase
        .from('prayer_feed')
        .select(PRAYER_FIELDS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data === null ? null : mapPrayer(data);
    },
    staleTime: FEED_STALE_TIME,
  });
}
