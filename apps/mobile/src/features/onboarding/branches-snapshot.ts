// Bundled read-only branch snapshot (docs/spec/06): first-launch-offline fallback for
// ONB-2. SAME data as supabase/seeds/00-common.sql (ids included, so a selection made
// offline references the real row once connectivity returns). The server stays
// authoritative; this is a stale-tolerant day-one cache: update it whenever the seed
// changes (checked in review, not by tooling).

export interface BranchSummary {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  is_hq: boolean;
  order: number;
}

export const BRANCHES_SNAPSHOT: BranchSummary[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'glasgow',
    name: 'AGBC Glasgow',
    city: 'Glasgow',
    country: 'Scotland, UK',
    is_hq: true,
    order: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    slug: 'berlin',
    name: 'AGBC Lighthouse Berlin',
    city: 'Berlin',
    country: 'Germany',
    is_hq: false,
    order: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    slug: 'emmen',
    name: 'AGBC Emmen',
    city: 'Emmen',
    country: 'Netherlands',
    is_hq: false,
    order: 3,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    slug: 'ogbomosho',
    name: 'Miracle center Ogbomosho',
    city: 'Ogbomosho',
    country: 'Nigeria',
    is_hq: false,
    order: 4,
  },
];

// The "I'm just looking" and "Not sure yet" default (docs/spec/06): HQ.
export const HQ_BRANCH = BRANCHES_SNAPSHOT[0];
