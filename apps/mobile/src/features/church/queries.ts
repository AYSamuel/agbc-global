import { useQuery } from '@tanstack/react-query';

import { PERSIST_META } from '@/lib/queryMeta';
import { supabase } from '@/lib/supabase';

// Church-screen reads (docs/spec/04): BRANCH-INFO renders the full branch row;
// CONTACT lists per-branch inboxes. The BRANCHES list itself reuses the shared
// onboarding branches query (same cache as ONB-3 and BRANCH-SWITCH).

export interface BranchLead {
  name?: string;
  role?: string;
  bio?: string;
}

export interface BranchDetail {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  is_hq: boolean;
  timezone: string;
  languages: string;
  email: string;
  lat: number;
  lng: number;
  /** Display strings only; the machine-readable schedule is branch_services. */
  service_times: { sunday?: string; classes?: string; midweek?: string };
  address: { line1?: string; line2?: string } | null;
  lead: BranchLead | null;
  leaders: BranchLead[];
  welcome: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function narrowLead(value: unknown): BranchLead | null {
  if (typeof value !== 'object' || value === null) return null;
  const { name, role, bio } = value as Record<string, unknown>;
  const lead = {
    name: asString(name),
    role: asString(role),
    bio: asString(bio),
  };
  return lead.name ? lead : null;
}

export function branchDetailQueryOptions(id: string | null) {
  return {
    queryKey: ['branch-detail', id] as const,
    queryFn: async (): Promise<BranchDetail | null> => {
      if (id === null) return null;
      const { data, error } = await supabase
        .from('branches')
        .select(
          'id, slug, name, city, country, is_hq, timezone, languages, email, lat, lng, service_times, address, lead, leaders, welcome',
        )
        .eq('id', id)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data === null) return null;
      const times =
        typeof data.service_times === 'object' && data.service_times !== null
          ? (data.service_times as Record<string, unknown>)
          : {};
      const address =
        typeof data.address === 'object' && data.address !== null
          ? (data.address as Record<string, unknown>)
          : null;
      return {
        ...data,
        lat: typeof data.lat === 'number' ? data.lat : Number(data.lat) || 0,
        lng: typeof data.lng === 'number' ? data.lng : Number(data.lng) || 0,
        service_times: {
          sunday: asString(times.sunday),
          classes: asString(times.classes),
          midweek: asString(times.midweek),
        },
        address: address
          ? { line1: asString(address.line1), line2: asString(address.line2) }
          : null,
        lead: narrowLead(data.lead),
        leaders: Array.isArray(data.leaders)
          ? data.leaders
              .map(narrowLead)
              .filter((row): row is BranchLead => row !== null)
          : [],
      };
    },
    staleTime: 5 * 60_000,
    // BRANCH-INFO paints from cache offline (docs/spec/04 offline state).
    meta: PERSIST_META,
  };
}

export function useBranchDetailQuery(id: string | null) {
  return useQuery(branchDetailQueryOptions(id));
}

export interface BranchContact {
  id: string;
  name: string;
  city: string;
  email: string;
}

// CONTACT's "email a branch directly" rows (docs/spec/04): the light list the
// shared branches query doesn't carry (email stays off the hot onboarding path).
export const branchContactsQueryOptions = {
  queryKey: ['branch-contacts'] as const,
  queryFn: async (): Promise<BranchContact[]> => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, city, email')
      .eq('status', 'active')
      .neq('email', '')
      .order('order');
    if (error) throw new Error(error.message);
    return data;
  },
  staleTime: 30 * 60_000,
  // CONTACT's branch-email fallback must survive offline: it is the only
  // non-network route to reach the church (docs/spec/04).
  meta: PERSIST_META,
};

export function useBranchContactsQuery() {
  return useQuery(branchContactsQueryOptions);
}
