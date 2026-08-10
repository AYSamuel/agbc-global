import { useQuery } from '@tanstack/react-query';

import { PERSIST_META } from '@/lib/queryMeta';
import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import { narrowLocalizedText, type LocalizedText } from '@/lib/localizedJson';

// The Academy reads (docs/spec/13, ADR 0017). The catalog and its regional fees
// are public reads and persist for offline browsing; a member's registrations
// and interest are facts about a person (rsvp.ts's reasoning) and never persist.
//
// course_registrations columns are NAMED one by one and this is load-bearing,
// not tidy: `linked_by` is column-revoked (the moderation_note precedent) and a
// select('*') fails through PostgREST for every caller. Only what the screens
// draw is pulled; the row also holds the registrant's city and country, and a
// query has no business fetching what no screen shows.

export interface CourseFormat {
  key: 'intensive' | 'part_time';
  duration: LocalizedText;
}

export interface Course {
  id: string;
  slug: string;
  name: string;
  level: string;
  levelName: string;
  /** The COURSE hero eyebrow ('Level One · Start here'); '' falls back to levelName. */
  step: string;
  summary: LocalizedText | null;
  /** The ACADEMY pathway card's own blurb (docs/spec/02); falls back to summary. */
  pathwaySummary: LocalizedText | null;
  /** Topic titles only are drawn (docs/spec/13 "numbered topics"). */
  outlineTitles: string[];
  gains: LocalizedText[];
  formats: CourseFormat[];
  prereqSlug: string | null;
  feeMinor: number | null;
  feeCurrency: string | null;
  feeNote: LocalizedText | null;
  upcoming: boolean;
}

export interface RegionalFee {
  courseId: string;
  countryCode: string;
  feeMinor: number;
  currency: string;
}

export interface RegistrationRow {
  id: string;
  /** The website's content slug; old website rows may have courseId null. */
  course: string;
  courseId: string | null;
  /** The website form's free text ('Intensive (2 weeks)'), English by design. */
  format: string;
  /** Branch display name as the website stored it; often null. */
  branch: string | null;
  /** Stripe minor units + lowercase ISO code, straight off the row. */
  amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  createdAt: string;
}

// --- narrowing at the data boundary (the give/parseAccounts pattern) ---------

function narrowOutlineTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const title = (item as { title?: unknown }).title;
    return typeof title === 'string' && title !== '' ? [title] : [];
  });
}

function narrowGains(value: unknown): LocalizedText[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const text = narrowLocalizedText(item);
    return text === null ? [] : [text];
  });
}

/** {intensive, part_time} → ordered array; a missing/malformed side just drops. */
function narrowFormats(value: unknown): CourseFormat[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  return (['intensive', 'part_time'] as const).flatMap((key) => {
    const duration = narrowLocalizedText(record[key]);
    return duration === null ? [] : [{ key, duration }];
  });
}

interface CourseRow {
  id: string;
  slug: string;
  name: string;
  level: string;
  level_name: string;
  step: string;
  summary: unknown;
  pathway_summary: unknown;
  outline: unknown;
  gains: unknown;
  formats: unknown;
  prereq_slug: string | null;
  fee_minor: number | null;
  fee_currency: string | null;
  fee_note: unknown;
  upcoming: boolean;
}

function mapCourse(row: CourseRow): Course {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    level: row.level,
    levelName: row.level_name,
    step: row.step,
    summary: narrowLocalizedText(row.summary),
    pathwaySummary: narrowLocalizedText(row.pathway_summary),
    outlineTitles: narrowOutlineTitles(row.outline),
    gains: narrowGains(row.gains),
    formats: narrowFormats(row.formats),
    prereqSlug: row.prereq_slug,
    feeMinor: row.fee_minor,
    feeCurrency: row.fee_currency,
    feeNote: narrowLocalizedText(row.fee_note),
    upcoming: row.upcoming,
  };
}

// --- the catalog (public, persisted) -----------------------------------------

// One literal (never concatenated): supabase-js parses the literal TYPE to
// infer the row, and a built string collapses it to `string`.
const COURSE_FIELDS =
  'id, slug, name, level, level_name, step, summary, pathway_summary, outline, gains, formats, prereq_slug, fee_minor, fee_currency, fee_note, upcoming';

export function coursesQueryOptions() {
  return {
    queryKey: ['academy', 'courses'] as const,
    queryFn: async (): Promise<Course[]> => {
      const { data, error } = await supabase
        .from('courses')
        .select(COURSE_FIELDS)
        .order('order', { ascending: true });
      if (error) throw new Error(error.message);
      return data.map(mapCourse);
    },
    staleTime: 5 * 60_000,
    meta: PERSIST_META,
  };
}

export function useCoursesQuery() {
  return useQuery(coursesQueryOptions());
}

export function regionalFeesQueryOptions() {
  return {
    queryKey: ['academy', 'regional-fees'] as const,
    queryFn: async (): Promise<RegionalFee[]> => {
      const { data, error } = await supabase
        .from('course_fees_regional')
        .select('course_id, country_code, fee_minor, currency');
      if (error) throw new Error(error.message);
      return data.map((row) => ({
        courseId: row.course_id,
        countryCode: row.country_code,
        feeMinor: row.fee_minor,
        currency: row.currency,
      }));
    },
    staleTime: 5 * 60_000,
    meta: PERSIST_META,
  };
}

export function useRegionalFeesQuery() {
  return useQuery(regionalFeesQueryOptions());
}

// --- the member's own rows (personal, never persisted) -----------------------

export const registrationsQueryKey = ['academy', 'registrations'] as const;

export function registrationsQueryOptions(enabled: boolean) {
  return {
    queryKey: registrationsQueryKey,
    queryFn: async (): Promise<RegistrationRow[]> => {
      const { data, error } = await supabase
        .from('course_registrations')
        .select(
          'id, course, course_id, format, branch, amount, currency, status, created_at',
        )
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data.map((row) => ({
        id: row.id,
        course: row.course,
        courseId: row.course_id,
        format: row.format,
        branch: row.branch,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        createdAt: row.created_at,
      }));
    },
    enabled,
    staleTime: 60_000,
  };
}

export function useRegistrationsQuery(enabled: boolean) {
  return useQuery(registrationsQueryOptions(enabled));
}

export function invalidateRegistrations(): void {
  void queryClient.invalidateQueries({ queryKey: registrationsQueryKey });
}

export const interestQueryKey = ['academy', 'interest'] as const;

export function interestQueryOptions(enabled: boolean) {
  return {
    queryKey: interestQueryKey,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('course_interest')
        .select('course_id');
      if (error) throw new Error(error.message);
      return data.map((row) => row.course_id);
    },
    enabled,
    staleTime: 60_000,
  };
}

export function useInterestQuery(enabled: boolean) {
  return useQuery(interestQueryOptions(enabled));
}

export function invalidateInterest(): void {
  void queryClient.invalidateQueries({ queryKey: interestQueryKey });
}

// --- derivations -------------------------------------------------------------

/**
 * The member's LIVE registration for a course, or null. Matching is by
 * course_id OR by the website slug, because old website rows may carry
 * course_id null (docs/spec/02); cancelled rows leave no trace here by design
 * (docs/spec/13: re-registering is a new row).
 */
export function liveRegistrationFor(
  rows: readonly RegistrationRow[] | undefined,
  course: Pick<Course, 'id' | 'slug'>,
): RegistrationRow | null {
  if (rows === undefined) return null;
  return (
    rows.find(
      (row) =>
        row.status !== 'cancelled' &&
        (row.courseId === course.id || row.course === course.slug),
    ) ?? null
  );
}
