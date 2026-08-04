import { useQuery } from '@tanstack/react-query';

import { PERSIST_META } from '@/lib/queryMeta';
import { supabase } from '@/lib/supabase';

import { reconcileGlory } from './gloryCache';
import { prayerFeedKey, testimonyFeedKey } from './keys';
import { reconcileIntercession } from './prayerCache';

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
  /** Object path in the private `testimony-photos` bucket; a signed URL is minted
   * per view and never stored (docs/spec/02 §Storage). */
  image_path: string | null;
  glory_count: number;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
  author_avatar_url: string | null;
  /** Non-null when this testimony was born from a prayer (drives the ribbon). */
  from_prayer_id: string | null;
  /** Set only while the origin prayer is itself publicly visible: the ribbon is a
   * link when set, a static label when null but from_prayer_id is set (docs/spec/09). */
  origin_prayer_id: string | null;
  /** Whether the CALLING member has said Glory to this one. On the row rather
   * than in a second query, so a card's count and its own reaction state can
   * never disagree mid-refetch (W2.4). Always false for a guest. */
  reacted_by_me: boolean;
  /** Whether the CALLING member wrote it: which `...` menu the detail header
   * opens (W2.6). Server-answered rather than compared client-side, for the same
   * reason as above and because a prayer's author may not be on the row at all. */
  is_mine: boolean;
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
  /**
   * The AUTHOR's view of the testimony this request produced, in any state (W2.5). Null
   * for everyone else, and for an author who has not written one.
   *
   * Distinct from `answer_testimony_id` above, which waits for a leader because it drives
   * the public reverse link. This one matches `prayer_has_live_testimony()`, the guard that
   * refuses "Mark as not answered", so the screen and the database agree about whether the
   * undo is available and the confirm sheet can say why it is not.
   */
  my_answer_testimony_status:
    'pending' | 'approved' | 'rejected' | 'removed' | null;
  /** This member's own commitment: null until they tap "I will pray". On the row
   * beside the counts it belongs with, so a card cannot hold one without the
   * other (W2.4). Read by the two-step controls in slice 3. */
  my_intercession_state: 'committed' | 'prayed' | null;
  /** Whether the CALLING member wrote it (W2.6). The ONLY way the author of an
   * anonymous request is handed it back: `author_id` above is null for everyone,
   * including for them. */
  is_mine: boolean;
}

const TESTIMONY_FIELDS =
  'id, branch_id, body, language, category_key, image_path, glory_count, created_at, author_id, author_name, author_avatar_url, from_prayer_id, origin_prayer_id, reacted_by_me, is_mine';

const PRAYER_FIELDS =
  'id, branch_id, body, language, is_anonymous, answered_at, praying_count, prayed_count, created_at, author_id, author_name, author_avatar_url, answer_testimony_id, my_answer_testimony_status, my_intercession_state, is_mine';

const POST_STATUSES = ['pending', 'approved', 'rejected', 'removed'] as const;

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
    image_path: str(row.image_path),
    glory_count: num(row.glory_count),
    created_at: createdAt,
    author_id: str(row.author_id),
    author_name: str(row.author_name),
    author_avatar_url: str(row.author_avatar_url),
    from_prayer_id: str(row.from_prayer_id),
    origin_prayer_id: str(row.origin_prayer_id),
    // The view returns null for a guest; the app's answer for "has this member
    // reacted" when there is no member is simply no.
    reacted_by_me: row.reacted_by_me === true,
    // Same shape, and the same direction of failure: anything the app cannot read as
    // a definite yes is a no, so an unreadable row never opens the author's menu on
    // somebody else's post.
    is_mine: row.is_mine === true,
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
    // An unrecognised status reads as "no testimony linked", which is the direction that
    // fails safe on the screen: the author is offered the loop's next step and the
    // database, which is the one that actually decides, refuses it if a testimony does
    // exist. The opposite default would hide the offer from someone who never wrote one.
    my_answer_testimony_status: POST_STATUSES.includes(
      row.my_answer_testimony_status as (typeof POST_STATUSES)[number],
    )
      ? (row.my_answer_testimony_status as PrayerFeedItem['my_answer_testimony_status'])
      : null,
    // Anything the app does not recognise reads as "no commitment": a card that
    // cannot tell must offer the forward step, never a fulfilled one.
    my_intercession_state:
      row.my_intercession_state === 'committed' ||
      row.my_intercession_state === 'prayed'
        ? row.my_intercession_state
        : null,
    is_mine: row.is_mine === true,
  };
}

// The feed is realtime-first and polling-bounded (docs/spec/02): the family channel
// pushes changes, and a 60s refetch is the worst-case ceiling if the socket drops.
// staleTime sits under that so a focus refetch is never served a stale cache.
const FEED_STALE_TIME = 30_000;

/** A testimony category as the composer needs it: the id goes on the row, the
 * key resolves the label from the i18n bundle (docs/spec/02). */
export interface TestimonyCategory {
  id: string;
  key: string;
}

/**
 * TESTIMONY-COMPOSE's chips. Public reference data that changes about never, so
 * it is cached long and persisted: opening the composer offline still offers the
 * categories the author saw last time. A failure here hides the chip row rather
 * than blocking the post, because category is optional (docs/spec/09).
 */
export function useTestimonyCategoriesQuery() {
  return useQuery({
    // Its OWN key, deliberately outside the family tree: eight seeded rows of
    // reference data that no post and no reaction can change, and which used to
    // be refetched by every family invalidation for nothing.
    queryKey: ['testimony-categories'],
    queryFn: async (): Promise<TestimonyCategory[]> => {
      const { data, error } = await supabase
        .from('testimony_categories')
        .select('id, key')
        .eq('active', true)
        .order('sort', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 24 * 60 * 60_000,
    meta: PERSIST_META,
  });
}

export {
  PRAYER_SURFACE_KEYS,
  prayerFeedKey,
  TESTIMONY_SURFACE_KEYS,
  testimonyFeedKey,
} from './keys';

export function useTestimonyFeedQuery(
  scope: FamilyScope,
  branchId: string | null,
) {
  return useQuery({
    queryKey: testimonyFeedKey(scope, branchId),
    queryFn: async (): Promise<TestimonyFeedItem[]> => {
      // Stamped BEFORE the request leaves, so reconcileGlory can tell whether
      // this answer could have known about the member's own recent taps.
      const startedAt = Date.now();
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
      return reconcileGlory(
        data
          .map(mapTestimony)
          .filter((r): r is TestimonyFeedItem => r !== null),
        startedAt,
      );
    },
    // "My branch" with no chosen branch would silently mean Everywhere; the screen
    // keeps the toggle on Everywhere in that case, so this should never fire.
    enabled: scope === 'everywhere' || Boolean(branchId),
    staleTime: FEED_STALE_TIME,
    // Realtime keeps this fresh online; persistence lets the feed paint offline.
    meta: PERSIST_META,
  });
}

export function usePrayerFeedQuery(
  scope: FamilyScope,
  branchId: string | null,
) {
  return useQuery({
    queryKey: prayerFeedKey(scope, branchId),
    queryFn: async (): Promise<PrayerFeedItem[]> => {
      // Stamped before the request leaves: see reconcileIntercession.
      const startedAt = Date.now();
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
      return reconcileIntercession(
        data.map(mapPrayer).filter((r): r is PrayerFeedItem => r !== null),
        startedAt,
      );
    },
    enabled: scope === 'everywhere' || Boolean(branchId),
    staleTime: FEED_STALE_TIME,
    meta: PERSIST_META,
  });
}

export function useTestimonyQuery(id: string) {
  return useQuery({
    queryKey: ['family', 'testimony', id] as const,
    queryFn: async (): Promise<TestimonyFeedItem | null> => {
      const startedAt = Date.now();
      const { data, error } = await supabase
        .from('testimony_feed')
        .select(TESTIMONY_FIELDS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data === null ? null : mapTestimony(data);
      return row === null
        ? null
        : (reconcileGlory([row], startedAt)[0] ?? null);
    },
    staleTime: FEED_STALE_TIME,
    meta: PERSIST_META,
  });
}

// Home's "From the family" highlight (docs/spec/07): the single most recent
// approved testimony. Its own limit-1 query rather than reusing the 50-row feed,
// so a cold Home load fetches one row, and it is launch-warmed (docs/spec/01 §9).
export function latestTestimonyQueryOptions() {
  return {
    queryKey: ['family', 'latest-testimony'] as const,
    queryFn: async (): Promise<TestimonyFeedItem | null> => {
      const startedAt = Date.now();
      const { data, error } = await supabase
        .from('testimony_feed')
        .select(TESTIMONY_FIELDS)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data === null ? null : mapTestimony(data);
      return row === null
        ? null
        : (reconcileGlory([row], startedAt)[0] ?? null);
    },
    staleTime: FEED_STALE_TIME,
    // Home's "From the family" highlight paints offline (docs/spec/07).
    meta: PERSIST_META,
  };
}

export function useLatestTestimonyQuery() {
  return useQuery(latestTestimonyQueryOptions());
}

/**
 * One request, by id.
 *
 * `enabled` exists for the composer (W2.5), which asks for the origin prayer only when it
 * was opened from one. An id of '' is not a uuid, so firing this unconditionally would
 * spend a failing round trip on every ordinary testimony somebody writes.
 */
export function usePrayerQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: ['family', 'prayer', id] as const,
    enabled: enabled && id !== '',
    queryFn: async (): Promise<PrayerFeedItem | null> => {
      const startedAt = Date.now();
      const { data, error } = await supabase
        .from('prayer_feed')
        .select(PRAYER_FIELDS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data === null ? null : mapPrayer(data);
      return row === null
        ? null
        : (reconcileIntercession([row], startedAt)[0] ?? null);
    },
    staleTime: FEED_STALE_TIME,
    meta: PERSIST_META,
  });
}
