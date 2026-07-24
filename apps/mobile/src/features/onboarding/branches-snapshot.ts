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
  /** Public channel id (docs/spec/01 §4); Watch's See-more link reads it. */
  youtube_channel_id: string | null;
  /** IANA id; Home's next-service math runs in this zone (docs/spec/07). */
  timezone: string;
  /** Display address (jsonb in the DB); Home's hero shows line1. */
  address: { line1?: string; line2?: string } | null;
  /** Venue/city-level coordinates for the Family map (docs/spec/09). */
  lat: number;
  lng: number;
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
    youtube_channel_id: 'UCTwx8j2Z0DZPlUhPyqfilfA',
    timezone: 'Europe/London',
    address: {
      line1: 'Summerlee Museum of Scottish Industrial Life',
      line2: 'Heritage Way, Coatbridge ML5 1QD',
    },
    lat: 55.8622,
    lng: -4.0245,
    order: 1,
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    slug: 'berlin',
    name: 'AGBC Lighthouse Berlin',
    city: 'Berlin',
    country: 'Germany',
    is_hq: false,
    youtube_channel_id: null,
    timezone: 'Europe/Berlin',
    address: { line1: 'Oudenarder Str. 16', line2: '13347 Berlin' },
    lat: 52.5502,
    lng: 13.3563,
    order: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    slug: 'emmen',
    name: 'AGBC Emmen',
    city: 'Emmen',
    country: 'Netherlands',
    is_hq: false,
    youtube_channel_id: null,
    timezone: 'Europe/Amsterdam',
    address: { line1: 'Flintstraat 29C05', line2: '7815 RE Emmen' },
    lat: 52.7862,
    lng: 6.8917,
    order: 3,
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    slug: 'ogbomosho',
    name: 'Miracle center Ogbomosho',
    city: 'Ogbomosho',
    country: 'Nigeria',
    is_hq: false,
    youtube_channel_id: null,
    timezone: 'Africa/Lagos',
    address: {
      line1: 'Adjacent Alajikii Mosque, Tarkii',
      line2: 'Ogbomosho, Oyo State',
    },
    lat: 8.1335,
    lng: 4.2407,
    order: 4,
  },
];

// The "I'm just looking" and "Not sure yet" default (docs/spec/06): HQ.
export const HQ_BRANCH = BRANCHES_SNAPSHOT[0];
