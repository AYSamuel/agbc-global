import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

/**
 * Attaching a website course registration to a member by hand (#164, docs/spec/17 §4).
 *
 * Somebody pays on the website with one address and signs into the app with another. The
 * automatic match runs on the EXACT address, finds nothing, and the app goes on showing them
 * as unregistered; the double-booking wall cannot save them either, because it keys on
 * `(course_id, profile_id)` and their row has no `profile_id`. They can pay twice. ADR 0017's
 * self-service claim was cut on 2026-08-11, so until this module existed the only fix was a
 * leader reading a stranger's payment record in a SQL client.
 *
 * Everything here goes through the CALLER's own client. The reads are `course_registrations`
 * under RLS, where an unlinked website row is admin-only (`02`, ADR 0017 decision 5), and the
 * three writes are definer routines that each check `caller_is_admin_live()` themselves
 * (`20260831120000`). Nothing in this module can widen what the caller may do; it can only
 * present it.
 *
 * THE AMOUNT NEVER LEAVES THE DATABASE, and it is worth being exact about which layer does
 * that, because the first version of this comment was wrong and its test passed anyway.
 * `amount` IS inside the `authenticated` column grant (`20260809202000`), so nothing at the
 * data layer withholds it. TWO things here do, and they are not the same thing:
 *
 *   * `toRegistration` builds `Registration` field by field, so a column that is fetched but
 *     not mapped can never reach a React payload. That is what protects the BROWSER, and it
 *     holds even if this query changes.
 *   * `REGISTRATION_COLUMNS` never names it, so the figure is not read at all: not into this
 *     process, not into a log line, not into a trace. That is `20` §minimum necessary taken
 *     literally, and it is asserted directly (a test that renders a card and looks for a
 *     currency symbol passes whatever the query does, which is how the first one fooled me).
 *
 * `set_aside_by` is not named either, and could not be: it was deliberately withheld from the
 * grant on `linked_by`'s reasoning (which staff member made the call is internal), so asking
 * for it would fail the whole request. The screens say WHEN a row was set aside and never
 * WHO; the audit log holds the name.
 */

type Client = SupabaseClient<Database>;

/**
 * Is this string shaped like a row id at all?
 *
 * Every id on these screens arrives from the URL, and PostgREST answers a malformed uuid with
 * an ERROR (22P02) rather than with no rows. So `.eq('id', 'not-a-uuid')` threw, the throw
 * reached the error boundary, and `/academy?undo=<typo>` returned a 500 from the module's own
 * front door instead of the "not there" the next line was already written to handle.
 *
 * Checked here rather than in each page, because the three screens and the queue read ids
 * through four different functions and only one of them would have remembered. "Fail closed"
 * (~/.claude/standards/security.md) means a value that cannot be an id is treated as an id
 * that is not there, which is what every caller already renders.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRowId(value: string): boolean {
  return UUID.test(value);
}

export type LinkMethod =
  Database['public']['Enums']['course_registration_link_method'];

/** Which slice of the table a screen is showing. Drives the filter, never the authority. */
export type QueueView = 'waiting' | 'aside' | 'linked';

/**
 * The columns any of these screens may see.
 *
 * Exported so a test can assert the list itself rather than a rendered page: this is the
 * only place the "never read the amount" rule is expressible as a fact instead of an
 * absence.
 */
export const REGISTRATION_COLUMNS =
  'id, full_name, email, course, format, branch, created_at, set_aside_at, linked_at, link_method, profile_id, courses(name), profiles!course_registrations_profile_id_fkey(display_name)';

/** The row as PostgREST returns it for `COLUMNS`. */
interface RegistrationRow {
  id: string;
  full_name: string;
  email: string;
  course: string;
  format: string;
  branch: string | null;
  created_at: string;
  set_aside_at: string | null;
  linked_at: string | null;
  link_method: LinkMethod | null;
  profile_id: string | null;
  courses: { name: string } | null;
  profiles: { display_name: string } | null;
}

export interface Registration {
  id: string;
  /** The name typed on the PAYMENT, which is routinely not the member's display name. */
  fullName: string;
  email: string;
  /**
   * The course as our catalogue names it, or `null` when the website's slug resolved to
   * nothing. That is a real state and not an error: `course_id` is looked up from the slug
   * at insert time, so the website selling something we do not carry lands a row with no
   * course. The screen shows the raw slug and says so.
   */
  courseName: string | null;
  /** The website's slug, always present, and the only name an unresolved row has. */
  courseSlug: string;
  format: string;
  /** The website's branch DISPLAY name. Shown, never used to scope anything (`02`). */
  branch: string | null;
  createdAt: string;
  setAsideAt: string | null;
  linkedAt: string | null;
  linkMethod: LinkMethod | null;
  /** The member it belongs to, on a linked row. */
  member: { id: string; displayName: string } | null;
}

/**
 * The most rows any one view will draw.
 *
 * Exported so the screen can say the number out loud rather than hard-coding a second copy
 * of it in a sentence.
 */
export const QUEUE_LIMIT = 200;

export interface RegistrationQueue {
  rows: Registration[];
  counts: { waiting: number; aside: number; linkedByHand: number };
  /**
   * Whether the list stops short of everything there is.
   *
   * It has to be said on screen, because the counts beside the list are EXACT and the list is
   * not: 250 waiting rows drew "Waiting 250" above 200 rows with nothing admitting the gap.
   * It matters most on the linked view, which is the one that grows forever (every
   * registration ever matched, by any method, is in it) and is the one an admin reaches for
   * to undo an old mistake.
   *
   * Derived from the page coming back full rather than from a second count, so it costs no
   * round trip. Exactly 200 rows reports truncation with nothing behind it, which is a
   * sentence that is still true ("the most recent 200 are listed") and the only inaccuracy
   * this shape can produce.
   */
  truncated: boolean;
  /**
   * The instant this was read at, returned rather than recomputed by the screen.
   *
   * The same reason `loadBranchRequests` returns one: a date is rendered with its year only
   * when it is not the current one, so the list and that test have to describe one moment.
   * It also keeps `Date.now()` out of a render, which is impure and which the React rules
   * refuse outright.
   */
  readAt: number;
}

/**
 * One view of the queue, plus the three counts every view shows.
 *
 * The counts are separate `head` queries rather than lengths of the rows, because only one
 * view is fetched at a time and a count taken from the fetched page would be the size of the
 * page. They are read in the same round trip as the rows so the numbers and the list
 * describe one moment.
 */
export async function loadRegistrationQueue(
  supabase: Client,
  view: QueueView,
): Promise<RegistrationQueue> {
  const [rows, waiting, aside, linkedByHand] = await Promise.all([
    readView(supabase, view),
    countWaiting(supabase),
    countAside(supabase),
    countLinkedByHand(supabase),
  ]);

  return {
    rows,
    counts: { waiting, aside, linkedByHand },
    truncated: rows.length >= QUEUE_LIMIT,
    readAt: Date.now(),
  };
}

async function readView(
  supabase: Client,
  view: QueueView,
): Promise<Registration[]> {
  const base = supabase
    .from('course_registrations')
    .select(REGISTRATION_COLUMNS);

  // Newest first everywhere, on the column that means "when this became this view's
  // business": when it was paid, when it was judged un-matchable, when it was attached.
  const query =
    view === 'waiting'
      ? base
          .is('profile_id', null)
          .is('set_aside_at', null)
          .order('created_at', { ascending: false })
      : view === 'aside'
        ? base
            .not('set_aside_at', 'is', null)
            .order('set_aside_at', { ascending: false })
        : base
            .not('profile_id', 'is', null)
            .order('linked_at', { ascending: false, nullsFirst: false });

  const { data, error } = await query
    .limit(QUEUE_LIMIT)
    .overrideTypes<RegistrationRow[], { merge: false }>();

  if (error) {
    throw new Error(`could not read the registrations: ${error.message}`);
  }

  return data.map(toRegistration);
}

function countWaiting(supabase: Client): Promise<number> {
  return count(
    supabase
      .from('course_registrations')
      .select('id', { count: 'exact', head: true })
      .is('profile_id', null)
      .is('set_aside_at', null),
  );
}

function countAside(supabase: Client): Promise<number> {
  return count(
    supabase
      .from('course_registrations')
      .select('id', { count: 'exact', head: true })
      .not('set_aside_at', 'is', null),
  );
}

/**
 * Only the ones a human attached.
 *
 * Deliberately not "linked", which would count every registration the automatic match and
 * the app handoff have ever made and would say nothing about this tool being used.
 */
function countLinkedByHand(supabase: Client): Promise<number> {
  return count(
    supabase
      .from('course_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('link_method', 'leader'),
  );
}

async function count(
  query: PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>,
): Promise<number> {
  const { count: total, error } = await query;
  if (error) {
    throw new Error(`could not count the registrations: ${error.message}`);
  }
  return total ?? 0;
}

export interface RegistrationRead {
  /** `null` when it is not there, or when this caller may not read it. */
  registration: Registration | null;
  /** The read instant, for the same reason `RegistrationQueue` carries one. */
  readAt: number;
}

/** One registration, for the link and unlink screens. */
export async function loadRegistration(
  supabase: Client,
  id: string,
): Promise<RegistrationRead> {
  // A malformed id is "not there", not a crash. See `isRowId`.
  if (!isRowId(id)) return { registration: null, readAt: Date.now() };

  const { data, error } = await supabase
    .from('course_registrations')
    .select(REGISTRATION_COLUMNS)
    .eq('id', id)
    .maybeSingle()
    .overrideTypes<RegistrationRow, { merge: false }>();

  // A row this caller may not read comes back as `null` rather than an error, which is
  // right: the screen says "not there" either way and must not confirm the difference.
  if (error) {
    throw new Error(`could not read the registration: ${error.message}`);
  }

  return {
    registration: data ? toRegistration(data) : null,
    readAt: Date.now(),
  };
}

function toRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    courseName: row.courses?.name ?? null,
    courseSlug: row.course,
    format: row.format,
    branch: row.branch,
    createdAt: row.created_at,
    setAsideAt: row.set_aside_at,
    linkedAt: row.linked_at,
    linkMethod: row.link_method,
    member:
      row.profile_id && row.profiles
        ? { id: row.profile_id, displayName: row.profiles.display_name }
        : null,
  };
}

export interface MemberMatch {
  id: string;
  displayName: string;
  email: string;
  branchName: string | null;
}

/**
 * One member by id, for the confirm screen.
 *
 * The confirm is reached as `?member=<uuid>`, and a name must never be rendered from a URL
 * parameter without reading the row back: otherwise the screen would happily say "Attach
 * this to <whatever the link claimed>". This read goes through the caller's own client, so
 * an admin gets the row and nobody else gets anything, which is the same door the search
 * next door uses.
 */
export async function loadMember(
  supabase: Client,
  memberId: string,
): Promise<MemberMatch | null> {
  // `?member=` is typed by anybody, so it reaches here as any string at all.
  if (!isRowId(memberId)) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, branches!profiles_branch_id_fkey(name)')
    .eq('id', memberId)
    .is('deleted_at', null)
    .maybeSingle()
    .overrideTypes<
      {
        id: string;
        display_name: string;
        email: string;
        branches: { name: string } | null;
      },
      { merge: false }
    >();

  if (error) {
    throw new Error(`could not read the member: ${error.message}`);
  }
  if (!data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    email: data.email,
    branchName: data.branches?.name ?? null,
  };
}

/**
 * Which member has already proven an address, if any.
 *
 * Only for the refusal screen, and it is what turns that screen from a wall into something
 * actionable: the instruction there is to find out whose mailbox it really is, and an admin
 * cannot ring somebody they have not been told about. Reading it is no wider a disclosure
 * than the surface already carries, since an admin reads every profile and every proven
 * address under RLS anyway.
 *
 * A PLAIN EQUALITY ON A COLUMN THAT IS NOW CONSTRAINED TO BE NORMALIZED
 * (`profile_emails_normalized`, migration `20260831150000`). Before that constraint this read
 * and the uniqueness behind it disagreed: the index matches on lower(trim(email)) and this
 * compared the raw column, so one stored capital and the database still refused the link
 * while this screen lost the name and fell back to "another member". Proven on a running
 * dashboard, which is the only place the two halves meet.
 *
 * Loosening the read was the wrong half to change. PostgREST has no case-insensitive equality:
 * `ilike` is the nearest thing and it would read the underscore in an address as a wildcard,
 * so the fix belongs in the column.
 */
export async function loadAddressOwner(
  supabase: Client,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profile_emails')
    .select('profiles!profile_emails_profile_id_fkey(display_name)')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
    .overrideTypes<
      { profiles: { display_name: string } | null },
      { merge: false }
    >();

  // Never fatal: the refusal is still true and still worth showing without a name.
  if (error || !data) return null;
  return data.profiles?.display_name ?? null;
}

/**
 * Whose SIGN-IN address this is, if it is anybody's.
 *
 * The other half of `loadAddressOwner`, and the half that has a way out. A proven address
 * lives in `profile_emails` and cannot be moved from this dashboard; a sign-in address lives
 * here, and `profile_emails_insert_guard` only refuses an address that is ANOTHER account's
 * (`u.id <> new.profile_id`), so attaching the registration to the account whose address it
 * actually is succeeds. The refusal screen offers exactly that, which turns the commonest
 * version of this collision, an admin picking the wrong member from a list of similar names,
 * from a dead end into one click.
 *
 * Plain equality is right here for the reason `searchMembers` records: `profiles.email`
 * mirrors `auth.users.email`, which GoTrue stores lowercased.
 */
export async function loadMemberByEmail(
  supabase: Client,
  email: string,
): Promise<MemberMatch | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, branches!profiles_branch_id_fkey(name)')
    .eq('email', email.trim().toLowerCase())
    .is('deleted_at', null)
    .maybeSingle()
    .overrideTypes<
      {
        id: string;
        display_name: string;
        email: string;
        branches: { name: string } | null;
      },
      { merge: false }
    >();

  // Never fatal, for the same reason `loadAddressOwner` is not: the refusal above it is true
  // and worth showing whether or not this screen can name a way out of it.
  if (error || !data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    email: data.email,
    branchName: data.branches?.name ?? null,
  };
}

export interface Suggestion extends MemberMatch {
  /**
   * Why this member is here, as the DATABASE phrased it.
   *
   * Carried rather than recomputed. Decision 1 accepted a real risk: a confident-looking
   * wrong suggestion is easier to accept than a wrong name somebody typed themselves, and
   * showing the reason is what lets an admin disagree with it. Deriving it here from the
   * similarity score and the branch names would make one visible fact have two owners, and
   * they would eventually disagree.
   */
  reason: string;
}

/** At most a handful, per the SPEC: a long list of guesses is not a shortlist. */
const SUGGESTION_LIMIT = 5;

export async function loadSuggestions(
  supabase: Client,
  registrationId: string,
): Promise<Suggestion[]> {
  // Its callers have already read the row back, so this cannot fire today. It is here so the
  // next caller that has not cannot reintroduce the 500 the other two just lost.
  if (!isRowId(registrationId)) return [];

  const { data, error } = await supabase.rpc('registration_match_suggestions', {
    registration: registrationId,
    limit_to: SUGGESTION_LIMIT,
  });

  if (error) {
    throw new Error(`could not read the suggestions: ${error.message}`);
  }

  // A set-returning RPC always answers with an array, so there is nothing to default.
  return data.map((row) => ({
    id: row.profile_id,
    displayName: row.display_name,
    email: row.email,
    branchName: row.branch_name,
    reason: row.reason,
  }));
}

/** The shortest query that is a search rather than a listing. */
export const SEARCH_MINIMUM = 2;

/** How many people a search may ever return. */
export const SEARCH_LIMIT = 8;

export type SearchResult =
  | {
      status: 'ok';
      members: MemberMatch[];
      /**
       * Whether the cap cut the answer short.
       *
       * Carried because the label above the list used to say "N people match", where N was
       * the length AFTER the cap: with forty matches it said eight people matched, which is
       * a different claim and a false one. The screen now says how many are SHOWN and admits
       * when there are more.
       */
      truncated: boolean;
    }
  | { status: 'too_short' };

/**
 * The fallback when no suggestion is the right person.
 *
 * A DELIBERATE DEPARTURE FROM `17` §5, which says exact email address only, no partial
 * matching, so nobody can sweep for which addresses belong to the ministry and no member
 * list is ever rendered. That rule is right for `/people`, where a leader can reach it. It
 * cannot serve here, because the case this whole feature exists for is a member whose app
 * address is NOT the one on the payment: a search that only takes an exact address cannot
 * rescue the person it was built for.
 *
 * So it is narrowed instead of borrowed, and `17` §5 records the decision (it already asked
 * for one, in the member-directory line):
 *
 *   * ADMINS ONLY. A leader never reaches this surface at all (ADR 0017 decision 5), which
 *     is enforced by `authorize()` above and by RLS beneath, not here.
 *   * TWO CHARACTERS MINIMUM, and no empty-query listing. One letter would return most of
 *     the ministry, which is the enumeration the rule exists to prevent.
 *   * `%` AND `_` ARE STRIPPED before the pattern is built. They are LIKE wildcards, so a
 *     query of `%` would otherwise be "list everybody, capped at eight", turning the length
 *     floor into decoration.
 *   * EIGHT ROWS. Enough to find one person, never enough to page through a branch.
 *
 * An address is matched EXACTLY (the `findMemberByEmail` road next door), a name loosely: a
 * partial address is the sweep the rule is about, while a partial name is how a human
 * actually looks for somebody they have just spoken to.
 *
 * THERE IS NO RANKING HERE, and the screen must not imply one. A name search comes back in
 * alphabetical order and an address search is a single exact row; neither is "closest first",
 * which is what the results label claimed until a review read it against a real search. The
 * suggestions next door ARE ranked and say why each row is there; a searched row is only what
 * the admin asked for, and dressing it as a ranking manufactures the endorsement this module
 * deliberately withholds from it everywhere else.
 *
 * The address road compares with a plain equality, which is correct here for a reason that
 * does NOT hold next door in `loadAddressOwner`: `profiles.email` mirrors `auth.users.email`,
 * which GoTrue stores lowercased, and its uniqueness is a plain unique on the column, so the
 * read and the constraint already agree.
 */
export async function searchMembers(
  supabase: Client,
  rawQuery: string,
): Promise<SearchResult> {
  const query = rawQuery.trim();
  const isAddress = query.includes('@');

  // THE WILDCARDS COME OUT BEFORE THE LENGTH IS CHECKED, and the order is the whole point.
  // Checked first, a query of `%%` is two characters long, clears the floor, and then strips
  // to an empty pattern that matches every member alive: the floor would be decoration and
  // the rule it enforces would be gone. Caught by its own test rather than by reading.
  const term = isAddress ? query.toLowerCase() : likeSafe(query);
  if (term.length < SEARCH_MINIMUM) return { status: 'too_short' };

  const selection =
    'id, display_name, email, branches!profiles_branch_id_fkey(name)';

  // One more than the cap, so a full page can be told apart from a page that happens to be
  // exactly full. The extra row is dropped before it reaches anybody.
  const rows = supabase
    .from('profiles')
    .select(selection)
    .is('deleted_at', null)
    .limit(SEARCH_LIMIT + 1);

  const { data, error } = await (
    isAddress
      ? rows.eq('email', term)
      : rows.ilike('display_name', `%${term}%`).order('display_name')
  ).overrideTypes<
    {
      id: string;
      display_name: string;
      email: string;
      branches: { name: string } | null;
    }[],
    { merge: false }
  >();

  if (error) {
    throw new Error(`could not search for members: ${error.message}`);
  }

  return {
    status: 'ok',
    truncated: data.length > SEARCH_LIMIT,
    members: data.slice(0, SEARCH_LIMIT).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      branchName: row.branches?.name ?? null,
    })),
  };
}

/**
 * Take the wildcards out of somebody's typing.
 *
 * Not escaping, deliberately: PostgREST has no portable escape for `ilike` patterns, and a
 * name containing a literal `%` is not a thing anybody is searching for. Removing them makes
 * the floor above mean what it says.
 */
function likeSafe(query: string): string {
  return query.replace(/[%_]/g, '');
}

export type LinkFailure =
  /** Not an admin. The routine's own check, not this layer's. */
  | 'refused'
  /** The registration is not there any more. */
  | 'gone'
  /** The member is not there, or their account is closed. */
  | 'no_member'
  /** Somebody attached it already, or this is a double submit. */
  | 'already_linked'
  /** It was judged un-matchable; it has to be brought back first. */
  | 'set_aside'
  /**
   * The member already holds a live registration for that course.
   *
   * The double-booking wall, and the state this whole feature exists downstream of: somebody
   * who could not be matched automatically is somebody who could pay twice. Until
   * `20260831150000` it had no words at all and arrived as a bare unique violation, which
   * this layer reported as `failed` = "That did not go through. Try again." Retrying could
   * never work.
   */
  | 'already_enrolled'
  /** The payment's address is already proven for a DIFFERENT member. */
  | 'address_taken'
  /** The payment's address is another account's sign-in address. */
  | 'address_is_signin'
  | 'failed';

export type LinkResult = { ok: true } | { ok: false; reason: LinkFailure };

/**
 * Attach the registration to the member.
 *
 * One call, and every rule inside it. `link_registration` writes the link trio with
 * `link_method = 'leader'` AND proves the address in `profile_emails`, which is the point of
 * the feature (SPEC decision 5: the member stops hitting this for good) and its standing
 * risk (open risk 1: an admin link is a judgement, and it becomes a permanent automatic
 * rule). Where the address is already spoken for it refuses the whole link rather than
 * linking without proving it, because either collision means two people claim one mailbox.
 *
 * Nothing here writes an audit row: `course_registrations_audit` already fires on every
 * change of `profile_id`, on every path (ADR 0015's rule that a caller which has to remember
 * the audit is a caller that will forget). Nothing here writes a notification either: the
 * member is told by the `activity-notices` job noticing the row changed, for every reason
 * W3.6 slice 2 recorded (ADR 0016, `21` §5, ADR 0022).
 */
export async function linkRegistration(
  supabase: Client,
  input: { registrationId: string; memberId: string },
): Promise<LinkResult> {
  const { error } = await supabase.rpc('link_registration', {
    registration: input.registrationId,
    member: input.memberId,
  });

  if (!error) return { ok: true };
  return { ok: false, reason: mapLinkError(error.message) };
}

export type UnlinkFailure = 'refused' | 'not_linked' | 'failed';
export type UnlinkResult = { ok: true } | { ok: false; reason: UnlinkFailure };

/**
 * Return the registration to the queue.
 *
 * OFFERED ON EVERY LINKED ROW, not only the ones a human attached, and that is load-bearing.
 * A wrong hand-link PROVES the address, so the next payment from it attaches to the wrong
 * member automatically, as `email_auto`. Restricting this to `link_method = 'leader'` would
 * make the one error this tool can cause the one error it cannot repair, and put an admin
 * back in a SQL client, which is where #164 started.
 *
 * It deliberately does not un-prove the address (SPEC open risk 1), and nothing is sent to
 * the member: there is no kind way to push "that course is not yours after all".
 */
export async function unlinkRegistration(
  supabase: Client,
  registrationId: string,
): Promise<UnlinkResult> {
  const { error } = await supabase.rpc('unlink_registration', {
    registration: registrationId,
  });

  if (!error) return { ok: true };

  const message = error.message;
  if (message.includes('admin action')) return { ok: false, reason: 'refused' };
  if (message.includes('is not linked')) {
    return { ok: false, reason: 'not_linked' };
  }
  return { ok: false, reason: 'failed' };
}

export type AsideFailure = 'refused' | 'gone' | 'is_linked' | 'failed';
export type AsideResult = { ok: true } | { ok: false; reason: AsideFailure };

/**
 * Take an un-matchable registration out of the working queue, or bring it back.
 *
 * SPEC decision 4: a queue that only grows is a queue people stop reading, and then a real
 * one is missed among the permanent residents. Reversible, and audited explicitly by the
 * routine, because it changes no owner and so fires no ownership trigger.
 */
export async function setRegistrationAside(
  supabase: Client,
  input: { registrationId: string; aside: boolean },
): Promise<AsideResult> {
  const { error } = await supabase.rpc('set_registration_aside', {
    registration: input.registrationId,
    aside: input.aside,
  });

  if (!error) return { ok: true };

  const message = error.message;
  if (message.includes('admin action')) return { ok: false, reason: 'refused' };
  if (message.includes('no such registration')) {
    return { ok: false, reason: 'gone' };
  }
  if (message.includes('not un-matchable')) {
    return { ok: false, reason: 'is_linked' };
  }
  return { ok: false, reason: 'failed' };
}

/**
 * Postgres error to a reason the screen can speak.
 *
 * Message matching, like `branchRequests.ts` and `assignRole.ts`, and for the same reason:
 * `link_registration` raises 23514 for FOUR different refusals, so the SQLSTATE alone cannot
 * tell them apart, and two of those four need different words on screen (one is "ring this
 * person", the others are "do something else first"). What makes it safe is the same thing:
 * pgTAP `052` asserts every one of these strings, so changing a message in the migration
 * turns a database test red before it can quietly degrade this into `failed`.
 *
 * `address_is_signin` comes from `profile_emails_insert_guard` rather than from
 * `link_registration` itself: the routine deliberately lets that exception surface instead of
 * catching it, because it is the same collision seen from its other half.
 */
function mapLinkError(message: string): LinkFailure {
  const says = (fragment: string) => message.includes(fragment);

  if (says('admin action')) return 'refused';
  if (says('no such registration')) return 'gone';
  if (says('no such member')) return 'no_member';
  if (says('already linked')) return 'already_linked';
  if (says('was set aside')) return 'set_aside';
  if (says('already has a place on that course')) return 'already_enrolled';
  if (says('already proven by another member')) return 'address_taken';
  if (says("another account's sign-in address")) return 'address_is_signin';

  // The same refusal, arriving from the index instead of from the routine. Two admins
  // attaching two payments to one member and one course at the same moment both pass the
  // routine's check, because it locks the registration being linked and not the other one, so
  // the second is stopped by `course_registrations_active_enrolment_uniq` itself. Matching
  // the constraint NAME rather than Postgres's sentence around it: the name is ours, it is
  // asserted in pgTAP `039`, and it does not move when a server is upgraded.
  if (says('course_registrations_active_enrolment_uniq'))
    return 'already_enrolled';

  // An unmapped refusal is still a refusal: falling through to a generic failure is what
  // keeps a future migration's new rule from reading as success.
  return 'failed';
}
