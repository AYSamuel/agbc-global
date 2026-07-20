import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

// Watch reads (docs/spec/08): rails show available sermons newest-first (the
// partial index's read path); the single-sermon query includes unavailable rows
// so the rot state can render (04: never a dead end). Search matches
// title/speaker/series server-side.

export interface SermonSummary {
  id: string;
  title: string;
  speaker: string;
  youtube_id: string | null;
  audio_url: string | null;
  duration_sec: number | null;
  thumbnail_url: string;
  series: string | null;
  published_at: string;
  is_live: boolean;
  live_checked_at: string | null;
  /** Channel tab the sync sourced it from (mirrors the website, 2026-07-20). */
  kind: 'video' | 'live_replay';
  status: 'available' | 'unavailable';
}

const SERMON_FIELDS =
  'id, title, speaker, youtube_id, audio_url, duration_sec, thumbnail_url, series, published_at, is_live, live_checked_at, kind, status';

export const sermonsQueryOptions = {
  queryKey: ['sermons'] as const,
  queryFn: async (): Promise<SermonSummary[]> => {
    const { data, error } = await supabase
      .from('sermons')
      .select(SERMON_FIELDS)
      .eq('status', 'available')
      .order('published_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data;
  },
  staleTime: 5 * 60_000,
};

export function useSermonsQuery() {
  return useQuery(sermonsQueryOptions);
}

// The see-all lists: one kind, its own server-side limit, so neither section
// starves the other when the combined feed exceeds the rails query's window.
// Depth beyond the sync's window is deliberately NOT paginated: the list ends
// with a "See more on YouTube" link to the channel tab (decision 2026-07-20).
export function useSermonKindQuery(kind: SermonSummary['kind']) {
  return useQuery({
    queryKey: ['sermons', 'kind', kind] as const,
    queryFn: async (): Promise<SermonSummary[]> => {
      const { data, error } = await supabase
        .from('sermons')
        .select(SERMON_FIELDS)
        .eq('status', 'available')
        .eq('kind', kind)
        .order('published_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSermonQuery(id: string) {
  return useQuery({
    queryKey: ['sermons', id] as const,
    queryFn: async (): Promise<SermonSummary | null> => {
      const { data, error } = await supabase
        .from('sermons')
        .select(SERMON_FIELDS)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSermonSearchQuery(term: string) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: ['sermons', 'search', trimmed] as const,
    queryFn: async (): Promise<SermonSummary[]> => {
      const escaped = trimmed.replaceAll('%', '\\%').replaceAll('_', '\\_');
      const pattern = `%${escaped}%`;
      const { data, error } = await supabase
        .from('sermons')
        .select(SERMON_FIELDS)
        .eq('status', 'available')
        .or(
          `title.ilike.${pattern},speaker.ilike.${pattern},series.ilike.${pattern}`,
        )
        .order('published_at', { ascending: false })
        .limit(30);
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  });
}
