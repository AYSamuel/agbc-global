import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { authorize } from './authorize';
import { verifyStepUp } from './stepUp';

/**
 * Branches (docs/spec/17 §5, `02` §branches; frames in this PR).
 *
 * Two write paths, and the split is the whole design. An ORDINARY EDIT goes through the
 * caller's own client and meets RLS, exactly as the events module does: `branches` has
 * carried an admin INSERT and UPDATE policy since `20260820180000`, and a COLUMN grant that
 * excludes `status`, `is_hq`, `archived_at` and `archived_by`. So a form can save a name, an
 * address or a service time, and cannot reach the four columns that carry consequences.
 *
 * THE CONSEQUENTIAL ACTS GO THROUGH FUNCTIONS, because each one has preconditions this
 * layer must not be trusted to remember: closing refuses HQ, the last open branch and any
 * branch a leader still points at, and it cancels the diary and stops the post; moving the
 * headquarters has to clear before it sets. A dashboard that wrote the column directly would
 * be a second implementation of rules that already exist in SQL.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: decide whether the caller may act. Every entry
 * point awaits `authorize({ action: 'manage_branches' })`, which is admin-only, and then the
 * database decides again. What it DOES own is what the screen is told: the counts a confirm
 * screen shows, and the reason a close is blocked.
 */

type Client = SupabaseClient<Database>;

export type BranchStatus = Database['public']['Enums']['branch_status'];

/** One `{ name, role }` entry in `branches.leaders`. */
export interface BranchPerson {
  name: string;
  role: string;
}

/**
 * `branches.lead`, which `02` gives a third key the other leaders do not have.
 *
 * The bio is the sentence members read under the lead's name on the church page. It was
 * missing from the first build of this module and the frame caught it: a jsonb column with
 * no shape enforced by the database is exactly the kind of field that gets dropped silently.
 */
export interface BranchLead extends BranchPerson {
  bio: string;
}

export interface ServiceRow {
  id?: string;
  /** 0 = Sunday .. 6 = Saturday, matching `branch_services.weekday`. */
  weekday: number;
  /** 'HH:MM', branch-local wall clock. */
  startTime: string;
  kind: Database['public']['Enums']['service_kind'];
  label: string;
}

export interface BranchRow {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  isHq: boolean;
  status: BranchStatus;
  timezone: string;
  languages: string;
  youtubeChannelId: string | null;
  email: string;
  lat: number;
  lng: number;
  addressLine1: string;
  addressLine2: string;
  /** The display sentence members read; the machine-readable schedule is `services`. */
  serviceTimes: string;
  lead: BranchLead;
  leaders: BranchPerson[];
  welcome: string;
  order: number;
  archivedAt: string | null;
  /** Who closed it, when the name is one this caller may read. */
  archivedBy: string | null;
  services: ServiceRow[];
  memberCount: number;
}

interface BranchRecord {
  id: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  is_hq: boolean;
  status: BranchStatus;
  timezone: string;
  languages: string;
  youtube_channel_id: string | null;
  email: string;
  lat: number;
  lng: number;
  address: unknown;
  service_times: unknown;
  lead: unknown;
  leaders: unknown;
  welcome: string;
  order: number;
  archived_at: string | null;
  closedBy: { display_name: string } | null;
}

// Explicit columns, never select *. The embed names its foreign key because `archived_by`
// gives `branches` and `profiles` a SECOND relationship (W3.5 slice 5a), and a bare
// `profiles(display_name)` is ambiguous to PostgREST.
const COLUMNS =
  'id, slug, name, city, country, is_hq, status, timezone, languages, youtube_channel_id, ' +
  'email, lat, lng, address, service_times, lead, leaders, welcome, order, archived_at, ' +
  'closedBy:profiles!branches_archived_by_fkey(display_name)';

/**
 * The jsonb columns, read defensively.
 *
 * `address`, `lead`, `leaders` and `service_times` are jsonb with a `{}` or `[]` default and
 * no shape enforced by the database (`02` keeps them loose because the website's content
 * files are their source). So every read here treats an unexpected shape as absent rather
 * than throwing: a branch row with a malformed `lead` should render an empty field, not take
 * the branches page down for every other branch.
 */
function textAt(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) return '';
  const found = (value as Record<string, unknown>)[key];
  return typeof found === 'string' ? found : '';
}

function person(value: unknown): BranchPerson {
  return { name: textAt(value, 'name'), role: textAt(value, 'role') };
}

function lead(value: unknown): BranchLead {
  return { ...person(value), bio: textAt(value, 'bio') };
}

function people(value: unknown): BranchPerson[] {
  if (!Array.isArray(value)) return [];
  return value.map(person).filter((entry) => entry.name !== '');
}

function toRow(
  record: BranchRecord,
  services: ServiceRow[],
  memberCount: number,
): BranchRow {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    city: record.city,
    country: record.country,
    isHq: record.is_hq,
    status: record.status,
    timezone: record.timezone,
    languages: record.languages,
    youtubeChannelId: record.youtube_channel_id,
    email: record.email,
    lat: record.lat,
    lng: record.lng,
    addressLine1: textAt(record.address, 'line1'),
    addressLine2: textAt(record.address, 'line2'),
    // `02` calls this "display strings only". The website's JSON carries three keys; the
    // form edits one sentence, and `sunday` is the one members read on the church page.
    serviceTimes: textAt(record.service_times, 'sunday'),
    lead: lead(record.lead),
    leaders: people(record.leaders),
    welcome: record.welcome,
    order: record.order,
    archivedAt: record.archived_at,
    // Null when nobody closed it, when a trusted caller did (a seed, a migration), or when
    // the name is one RLS will not show this caller. The screen says "a ministry admin"
    // rather than pretending nobody did it, the same fallback the events module uses.
    archivedBy: record.closedBy?.display_name ?? null,
    services,
    memberCount,
  };
}

/**
 * Every branch, open and closed, with its schedule and its size.
 *
 * ARCHIVED BRANCHES ARE IN THIS LIST and nowhere else in the product. Every other surface
 * filters them out (`useBranches`, the map, the pickers, the reminder job), which is exactly
 * why the one screen that manages branches has to show them: a branch nobody can see is a
 * branch nobody can re-open.
 *
 * Three reads rather than one, and the reason is not laziness. `branch_services` cannot be
 * embedded and counted in the same PostgREST call, and the member counts are a grouped
 * aggregate PostgREST does not express. Bounded by the number of BRANCHES, which is four,
 * so this is three queries and not an N+1.
 */
export async function loadBranches(supabase: Client): Promise<BranchRow[]> {
  const [{ data, error }, services, counts] = await Promise.all([
    supabase.from('branches').select(COLUMNS).order('order'),
    loadServices(supabase),
    loadMemberCounts(supabase),
  ]);

  if (error) throw new Error(`branches read failed: ${error.message}`);

  return (data as unknown as BranchRecord[]).map((record) =>
    toRow(record, services.get(record.id) ?? [], counts.get(record.id) ?? 0),
  );
}

export async function loadBranch(
  supabase: Client,
  slug: string,
): Promise<BranchRow | null> {
  const { data, error } = await supabase
    .from('branches')
    .select(COLUMNS)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`branch read failed: ${error.message}`);
  if (!data) return null;

  const record = data as unknown as BranchRecord;
  const [services, counts] = await Promise.all([
    loadServices(supabase, record.id),
    loadMemberCounts(supabase, record.id),
  ]);

  return toRow(
    record,
    services.get(record.id) ?? [],
    counts.get(record.id) ?? 0,
  );
}

async function loadServices(
  supabase: Client,
  branchId?: string,
): Promise<Map<string, ServiceRow[]>> {
  const query = supabase
    .from('branch_services')
    .select('id, branch_id, weekday, start_time, kind, label')
    .order('weekday')
    .order('start_time');

  const { data, error } = branchId
    ? await query.eq('branch_id', branchId)
    : await query;

  if (error) throw new Error(`service schedule read failed: ${error.message}`);

  const byBranch = new Map<string, ServiceRow[]>();
  for (const row of data) {
    const rows = byBranch.get(row.branch_id) ?? [];
    rows.push({
      id: row.id,
      weekday: row.weekday,
      // Postgres returns `time` as 'HH:MM:SS'; the form and the mockup both speak 'HH:MM'.
      startTime: row.start_time.slice(0, 5),
      kind: row.kind,
      label: row.label,
    });
    byBranch.set(row.branch_id, rows);
  }
  return byBranch;
}

/**
 * How many people call each branch home.
 *
 * An ADMIN can read every profile (`leaders read profiles in their branch` admits an admin
 * for any branch), which is what makes this countable from here at all. It is a count of
 * live accounts and nothing else: no names are read, and none are needed.
 */
async function loadMemberCounts(
  supabase: Client,
  branchId?: string,
): Promise<Map<string, number>> {
  const query = supabase
    .from('profiles')
    .select('branch_id')
    .is('deleted_at', null);

  const { data, error } = branchId
    ? await query.eq('branch_id', branchId)
    : await query;

  if (error) throw new Error(`member count read failed: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of data) {
    counts.set(row.branch_id, (counts.get(row.branch_id) ?? 0) + 1);
  }
  return counts;
}

export interface BranchInput {
  id?: string;
  slug: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  languages: string;
  youtubeChannelId: string;
  email: string;
  lat: string;
  lng: string;
  addressLine1: string;
  addressLine2: string;
  serviceTimes: string;
  lead: BranchLead;
  leaders: BranchPerson[];
  welcome: string;
  order: string;
  services: ServiceRow[];
}

export type SaveRefusal =
  | 'refused'
  | 'name_required'
  | 'slug_required'
  | 'slug_shape'
  | 'slug_taken'
  | 'city_required'
  | 'country_required'
  | 'timezone_required'
  | 'timezone_unknown'
  | 'coordinates_required'
  | 'service_incomplete';

export type SaveResult =
  { ok: true; slug: string } | { ok: false; reason: SaveRefusal };

/** Lowercase, digits and single hyphens: the shape every existing slug already has. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Create a branch, or edit one.
 *
 * A SAVE HERE IS VISIBLE IMMEDIATELY, to members and guests alike, in onboarding, the branch
 * switcher and the family map, with no app release. That is `17`'s acceptance criterion and
 * it is why the create form says so before the fields rather than after the button.
 *
 * THE SLUG IS INSERT-ONLY, enforced by the column grant (`20260820180000`) and repeated here
 * so the refusal is a sentence rather than a 42501: it is how this branch is named in every
 * row that will ever point at it.
 *
 * THE TIMEZONE IS VALIDATED, and this is the one piece of validation that is not politeness.
 * `02` has the zone act exactly once, at attendance write time, and the reminder jobs read
 * it every quarter hour; a typo like `Europe/Amsterdaam` is accepted by a `text` column and
 * then silently produces the wrong day for every "I'm here" tap at that branch. Checked
 * against the runtime's own IANA database, which is the same one Postgres and the app agree
 * with for every zone that matters here.
 */
export async function saveBranch(
  supabase: Client,
  input: BranchInput,
  existing?: BranchRow,
): Promise<SaveResult> {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const city = input.city.trim();
  const country = input.country.trim();
  const timezone = input.timezone.trim();

  if (name === '') return { ok: false, reason: 'name_required' };
  if (slug === '') return { ok: false, reason: 'slug_required' };
  if (!SLUG.test(slug)) return { ok: false, reason: 'slug_shape' };
  if (city === '') return { ok: false, reason: 'city_required' };
  if (country === '') return { ok: false, reason: 'country_required' };
  if (timezone === '') return { ok: false, reason: 'timezone_required' };
  if (!isKnownTimezone(timezone)) {
    return { ok: false, reason: 'timezone_unknown' };
  }

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (
    input.lat.trim() === '' ||
    input.lng.trim() === '' ||
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { ok: false, reason: 'coordinates_required' };
  }

  const services = input.services
    .map((row) => ({ ...row, label: row.label.trim() }))
    .filter(
      (row) => row.label !== '' || row.startTime !== '' || row.weekday >= 0,
    );
  if (services.some((row) => row.startTime.trim() === '')) {
    return { ok: false, reason: 'service_incomplete' };
  }

  const verdict = await authorize(supabase, { action: 'manage_branches' });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  const payload = {
    name,
    city,
    country,
    timezone,
    languages: input.languages.trim(),
    youtube_channel_id: input.youtubeChannelId.trim() || null,
    email: input.email.trim(),
    lat,
    lng,
    address: {
      line1: input.addressLine1.trim(),
      line2: input.addressLine2.trim(),
    },
    service_times: { sunday: input.serviceTimes.trim() },
    lead: {
      name: input.lead.name.trim(),
      role: input.lead.role.trim(),
      bio: input.lead.bio.trim(),
    },
    leaders: input.leaders
      .map((entry) => ({ name: entry.name.trim(), role: entry.role.trim() }))
      .filter((entry) => entry.name !== ''),
    welcome: input.welcome.trim(),
    order: Number(input.order) || 0,
  };

  if (existing) {
    // `slug` is absent from the payload on purpose: it is not in the UPDATE column grant, so
    // naming it at all would be a 42501 rather than a no-op.
    if (slug !== existing.slug) return { ok: false, reason: 'slug_shape' };

    const { error } = await supabase
      .from('branches')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw new Error(`branch save failed: ${error.message}`);

    await syncServices(supabase, existing.id, services, existing.services);
    return { ok: true, slug: existing.slug };
  }

  const { data, error } = await supabase
    .from('branches')
    .insert({ ...payload, slug })
    .select('id, slug')
    .single();

  // 23505 is the unique index on `slug`, which is the one refusal a person can cause by
  // typing. Everything else is a stack problem and should be loud.
  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'slug_taken' };
    throw new Error(`branch create failed: ${error.message}`);
  }

  await syncServices(supabase, data.id, services, []);
  return { ok: true, slug: data.slug };
}

/**
 * Make the schedule rows match what the form submitted.
 *
 * Delete-then-insert rather than a diff, deliberately: `branch_services` has no dependent
 * rows (the reminder job derives its work from the CURRENT schedule at every tick, and
 * records what it sent in `notifications` rather than against a service id), so a row's
 * identity carries no meaning worth preserving. A diff here would be cleverness with nothing
 * to protect. The dedupe key the job mints is `branch + date + local time`, chosen in W3.4
 * for exactly this reason: "a service row deleted and recreated at the same hour does not
 * re-announce itself".
 */
async function syncServices(
  supabase: Client,
  branchId: string,
  next: ServiceRow[],
  current: ServiceRow[],
): Promise<void> {
  if (current.length > 0) {
    const { error } = await supabase
      .from('branch_services')
      .delete()
      .eq('branch_id', branchId);
    if (error)
      throw new Error(`service schedule clear failed: ${error.message}`);
  }

  if (next.length === 0) return;

  const { error } = await supabase.from('branch_services').insert(
    next.map((row) => ({
      branch_id: branchId,
      weekday: row.weekday,
      start_time: row.startTime,
      kind: row.kind,
      label: row.label,
    })),
  );
  if (error) throw new Error(`service schedule save failed: ${error.message}`);
}

/**
 * Is this a zone the runtime knows?
 *
 * `Intl.DateTimeFormat` throws a RangeError for an unknown timeZone, which is the cheapest
 * honest check available and needs no table of our own to go stale.
 */
function isKnownTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export interface CloseImpact {
  /** Leaders still pointing at this branch. Non-empty means closing is blocked. */
  leaders: string[];
  membersToRehome: number;
  gatheringsCancelled: number;
  /** Everyone holding an RSVP to one of those gatherings. */
  peopleTold: number;
  broadcastsStopped: number;
}

/**
 * Everything the close screen states, from the same definitions the act itself uses.
 *
 * THE NUMBERS ARE NOT ESTIMATES. `event_rsvp_audience` is the definer function
 * `event_notice_recipients` announces to, so "46 people are told" is the set that receives.
 * That mattered enough to be caught by pgTAP the first time slice 4 ran it: a count made
 * from the dashboard reads every absent `notification_prefs` row as the column default and
 * promises one MORE person than the notice reaches.
 *
 * The RSVP audience is one call per affected gathering, which is an N+1 with a small and
 * stated N: only FUTURE scheduled events of one branch are cancelled, and a branch with a
 * diary long enough for this to matter has a different problem. Named rather than hidden,
 * per the standards' "no silent caps".
 */
export async function loadCloseImpact(
  supabase: Client,
  branch: BranchRow,
): Promise<CloseImpact> {
  const [leaders, events, broadcasts] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name')
      .eq('branch_id', branch.id)
      .eq('role', 'leader')
      .is('deleted_at', null),
    supabase
      .from('events')
      .select('id, starts_at_local')
      .eq('branch_id', branch.id)
      .eq('status', 'scheduled'),
    // `broadcasts` has no client grants at all (`02`'s matrix row), so this goes through the
    // definer the composer already reads: one definition of what staff may see.
    supabase.rpc('visible_broadcasts'),
  ]);

  if (leaders.error)
    throw new Error(`leaders read failed: ${leaders.error.message}`);
  if (events.error)
    throw new Error(`events read failed: ${events.error.message}`);
  if (broadcasts.error) {
    throw new Error(`broadcasts read failed: ${broadcasts.error.message}`);
  }

  // Future by the branch's own wall clock, which is the same test `archive_branch` makes
  // with `event_start_instant`. Comparing naive local strings is exact enough for a count
  // shown to a human and avoids this layer inventing a second definition of "now".
  const now = new Date();
  const cutoff = now.toISOString().slice(0, 19);
  const affected = events.data.filter((row) => row.starts_at_local > cutoff);

  const audiences = await Promise.all(
    affected.map((row) =>
      supabase.rpc('event_rsvp_audience', { event: row.id }),
    ),
  );

  const peopleTold = audiences.reduce((total, result) => {
    const rows = (result.data ?? []) as unknown as { reachable: number }[];
    return total + (rows.length > 0 ? rows[0].reachable : 0);
  }, 0);

  const stopped = (
    broadcasts.data as unknown as {
      branch_id: string | null;
      status: string;
    }[]
  ).filter(
    (row) =>
      row.branch_id === branch.id &&
      (row.status === 'sending' || row.status === 'pending_approval'),
  );

  return {
    // `display_name` went nullable in W4.5 so an erasure can strip it, and only a DELETED
    // profile ever holds a null. The query above already filters those out
    // (`.is('deleted_at', null)`), so this filter is belt and braces rather than a real
    // case: what it buys is that the day somebody drops that clause, this list loses a name
    // instead of rendering an empty one beside "reassign these leaders first".
    leaders: leaders.data.flatMap((row) =>
      row.display_name === null ? [] : [row.display_name],
    ),
    membersToRehome: branch.memberCount,
    gatheringsCancelled: affected.length,
    peopleTold,
    broadcastsStopped: stopped.length,
  };
}

export type ActFailure =
  | 'refused'
  | 'bad_code'
  | 'no_factor'
  | 'failed'
  | 'has_leaders'
  | 'is_hq'
  | 'last_branch'
  | 'already'
  | 'not_found';

export type ActResult = { ok: true } | { ok: false; reason: ActFailure };

/**
 * The three acts that ask for a fresh code.
 *
 * One shape for all three, because they differ only in which function they call and which
 * refusals that function can raise. The code is verified BEFORE the call in every case: a
 * wrong code should cost nothing and change nothing, and it is the cheapest of the two
 * checks.
 */
export async function closeBranch(
  supabase: Client,
  branch: BranchRow,
  code: string,
): Promise<ActResult> {
  return await act(supabase, code, () =>
    supabase.rpc('archive_branch', { branch: branch.id }),
  );
}

export async function reopenBranch(
  supabase: Client,
  branch: BranchRow,
  code: string,
): Promise<ActResult> {
  return await act(supabase, code, () =>
    supabase.rpc('restore_branch', { branch: branch.id }),
  );
}

export async function moveHeadquarters(
  supabase: Client,
  branch: BranchRow,
  code: string,
): Promise<ActResult> {
  return await act(supabase, code, () =>
    supabase.rpc('set_headquarters', { branch: branch.id }),
  );
}

async function act(
  supabase: Client,
  code: string,
  call: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<ActResult> {
  const verdict = await authorize(supabase, { action: 'manage_branches' });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  const stepUp = await verifyStepUp(supabase, code);
  if (stepUp) return { ok: false, reason: stepUp };

  const { error } = await call();
  if (!error) return { ok: true };
  return { ok: false, reason: mapRpcError(error.message) };
}

/**
 * Postgres message to a reason the surface can speak.
 *
 * The SQLSTATE alone is not enough: `archive_branch` raises 23514 for four different
 * refusals, so the message is part of the contract. That coupling is usually a smell and is
 * safe here for one specific reason, the same one `assignRole` gives: pgTAP `047` and `049`
 * assert these strings, so changing a message in a migration turns a database test red
 * before it ever reaches this file.
 */
function mapRpcError(message: string): ActFailure {
  const says = (fragment: string) => message.includes(fragment);

  if (says('fresh code from your authenticator')) return 'bad_code';
  if (says('only an admin')) return 'refused';
  if (says('leaders first')) return 'has_leaders';
  if (says('cannot itself be closed')) return 'is_hq';
  if (says('last open branch')) return 'last_branch';
  if (says('already')) return 'already';
  if (says('no such branch')) return 'not_found';
  return 'failed';
}
