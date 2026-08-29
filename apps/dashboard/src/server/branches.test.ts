import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import {
  admin,
  anonymousClient,
  createCaller,
  deleteCaller,
  deleteTestBranch,
  stepUpCode,
  type TestCaller,
} from '@/test/callers';

import {
  closeBranch,
  loadBranch,
  loadBranches,
  loadCloseImpact,
  moveHeadquarters,
  reopenBranch,
  saveBranch,
  type BranchInput,
} from './branches';

/**
 * The branch module, against the real database and real authenticators (W3.5 slice 5b).
 *
 * THE TEST THIS FILE EXISTS FOR is the round trip: an admin adds a branch here, and a
 * signed-out visitor sees it through the query the APP makes. `17` §5's acceptance criterion
 * is "an admin can add a branch and it appears in the app (onboarding, Home switch, map)
 * without an app release", and every one of those surfaces reads one shared query
 * (`apps/mobile/src/features/onboarding/useBranches.ts`), reproduced below verbatim. pgTAP
 * `047` proves the grants in SQL; this proves the road the dashboard and the app actually
 * drive, which is a different road (the W3.1 slice 4 rule).
 *
 * WHAT IS DELIBERATELY NOT HERE: a successful `set_headquarters`. Vitest runs these files in
 * parallel against ONE shared local stack, and HQ is global state that other files read
 * without knowing it (a ministry-wide event takes its timezone from `where is_hq`). Moving
 * it here would make an unrelated file fail for reasons no one could find. Its success path
 * is proven in pgTAP `049`, which rolls back; what is tested here is the wrapper this layer
 * adds, which is the step-up and the error mapping, and that wrapper is shared with close
 * and re-open, both exercised end to end below.
 *
 * Every assertion is scoped to rows this file created, per the 038/041/044 lesson.
 */

// Four of the tests below spend a real authenticator code, and `stepUpCode` waits for the
// next 30-second window rather than replaying one the auth server has already accepted. The
// project default of 20s is not enough for a test that has to sit out most of a window.
vi.setConfig({ testTimeout: 45_000 });

/**
 * A value the test cannot continue without.
 *
 * `loadBranch` honestly returns null for a branch that is not there, and a test that wrote
 * `branch!` would be telling the type checker something it cannot know. This throws with the
 * name instead, so a missing fixture reads as a missing fixture rather than as a null
 * dereference thirty lines later.
 */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`expected ${what} to exist`);
  }
  return value;
}

const minted: TestCaller[] = [];
const branchIds: string[] = [];

let ministryAdmin: TestCaller;
let leader: TestCaller;
let stamp: string;

async function caller(
  ...args: Parameters<typeof createCaller>
): Promise<TestCaller> {
  const created = await createCaller(...args);
  minted.push(created);
  return created;
}

function input(overrides: Partial<BranchInput> = {}): BranchInput {
  return {
    slug: `test-branch-${stamp}`,
    name: 'AGBC Test Rotterdam',
    city: 'Rotterdam',
    country: 'Netherlands',
    timezone: 'Europe/Amsterdam',
    languages: 'Nederlands / English',
    youtubeChannelId: '',
    email: 'rotterdam@test.local',
    lat: '51.9244',
    lng: '4.4777',
    addressLine1: 'Coolsingel 1',
    addressLine2: '',
    serviceTimes: 'Sundays 11:00, doors from 10:30',
    lead: {
      name: 'Pastor Test',
      role: 'Branch Pastor',
      bio: 'Serving Rotterdam since the hall on Coolsingel.',
    },
    leaders: [{ name: 'Anneke Test', role: 'Womens Ministry' }],
    welcome: 'There is a seat here for you.',
    order: '97',
    services: [
      {
        weekday: 0,
        startTime: '11:00',
        kind: 'sunday',
        label: 'Sunday Worship',
      },
      {
        weekday: 3,
        startTime: '19:00',
        kind: 'midweek',
        label: 'Midweek Prayer',
      },
    ],
    ...overrides,
  };
}

/**
 * The app's own branch query, character for character.
 *
 * If this ever needs changing because the app changed, that is the point: the two are one
 * contract, and a branch the dashboard can add but the app cannot see is the failure this
 * whole slice exists to prevent.
 */
async function asTheAppSeesIt(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await anonymousClient()
    .from('branches')
    .select('id, slug, name, city, country, is_hq, lat, lng')
    .eq('status', 'active')
    .order('order');

  if (error) throw new Error(`the app's own query failed: ${error.message}`);
  return data;
}

beforeAll(async () => {
  stamp = `${String(process.pid)}-${String(Date.now()).slice(-6)}`;
  ministryAdmin = await caller({ role: 'admin', mfa: 'verified' });
  leader = await caller({ role: 'leader', mfa: 'verified' });
});

afterAll(async () => {
  for (const one of minted) await deleteCaller(one);
  // The schedule rows reference the branch, and `deleteTestBranch` is deliberately loud
  // about a failed delete rather than swallowing it, so they come out first. Nothing else
  // in this repo deletes a branch, which is why the helper never needed this before.
  for (const id of branchIds) {
    await admin().from('branch_services').delete().eq('branch_id', id);
    await deleteTestBranch(id);
  }
});

describe('adding a branch', () => {
  test('an admin adds one and a signed-out visitor sees it, with no app release', async () => {
    const before = await asTheAppSeesIt();

    const saved = await saveBranch(ministryAdmin.serverClient(), input());
    expect(saved).toEqual({ ok: true, slug: `test-branch-${stamp}` });

    const created = must(
      await loadBranch(ministryAdmin.serverClient(), `test-branch-${stamp}`),
      'the branch just added',
    );
    branchIds.push(created.id);

    // Every field the form collected came back, including the two jsonb shapes that have no
    // schema behind them.
    expect(created.name).toBe('AGBC Test Rotterdam');
    expect(created.timezone).toBe('Europe/Amsterdam');
    expect(created.addressLine1).toBe('Coolsingel 1');
    expect(created.lead).toEqual({
      name: 'Pastor Test',
      role: 'Branch Pastor',
      bio: 'Serving Rotterdam since the hall on Coolsingel.',
    });
    expect(created.leaders).toEqual([
      { name: 'Anneke Test', role: 'Womens Ministry' },
    ]);
    expect(created.serviceTimes).toBe('Sundays 11:00, doors from 10:30');
    expect(created.status).toBe('active');
    expect(created.isHq).toBe(false);

    // The schedule the reminder job reads, which is a different table and the half most
    // likely to be silently dropped by a form.
    expect(
      created.services.map((row) => `${String(row.weekday)}@${row.startTime}`),
    ).toEqual(['0@11:00', '3@19:00']);

    // THE ROUND TRIP, asserted as a set difference rather than a length. Test FILES run in
    // parallel and several of them create and tear down branches, so `before.length + 1`
    // was a race: another file's afterAll deleting its own branch between these two reads
    // made this fail for a reason that has nothing to do with adding one (seen 2026-08-22,
    // once `eventImages.test.ts` became a third file doing it). Naming what appeared is
    // also the stronger claim.
    const after = await asTheAppSeesIt();
    const appeared = after.filter(
      (row) => !before.some((earlier) => earlier.id === row.id),
    );
    expect(appeared.map((row) => row.id)).toEqual([created.id]);
  });

  test('a leader cannot add one, however the form is posted', async () => {
    const refused = await saveBranch(
      leader.serverClient(),
      input({ slug: `test-leader-${stamp}` }),
    );
    expect(refused).toEqual({ ok: false, reason: 'refused' });

    const { data } = await admin()
      .from('branches')
      .select('id')
      .eq('slug', `test-leader-${stamp}`);
    expect(data).toEqual([]);
  });

  test('the refusals a person can actually cause arrive as sentences, not error codes', async () => {
    const client = ministryAdmin.serverClient();

    expect(await saveBranch(client, input({ name: '  ' }))).toEqual({
      ok: false,
      reason: 'name_required',
    });
    expect(await saveBranch(client, input({ slug: 'Not A Slug' }))).toEqual({
      ok: false,
      reason: 'slug_shape',
    });
    // The one that matters most: `timezone` is a plain text column, and a typo here quietly
    // produces the wrong DAY for every "I'm here" tap at that branch (`02`).
    expect(
      await saveBranch(client, input({ timezone: 'Europe/Amsterdaam' })),
    ).toEqual({ ok: false, reason: 'timezone_unknown' });
    expect(await saveBranch(client, input({ lat: '', lng: '' }))).toEqual({
      ok: false,
      reason: 'coordinates_required',
    });
    expect(await saveBranch(client, input({ lat: '999' }))).toEqual({
      ok: false,
      reason: 'coordinates_required',
    });
  });

  test('a slug already taken is refused by name rather than by 23505', async () => {
    const taken = await saveBranch(ministryAdmin.serverClient(), input());
    expect(taken).toEqual({ ok: false, reason: 'slug_taken' });
  });
});

describe('editing one', () => {
  test('an edit saves, and the schedule follows the form rather than accumulating', async () => {
    const client = ministryAdmin.serverClient();
    const existing = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the branch being edited',
    );

    const saved = await saveBranch(
      client,
      input({
        name: 'AGBC Test Rotterdam Centraal',
        services: [
          {
            weekday: 6,
            startTime: '17:00',
            kind: 'sunday',
            label: 'Saturday Vigil',
          },
        ],
      }),
      existing,
    );
    expect(saved.ok).toBe(true);

    const after = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the edited branch',
    );
    expect(after.name).toBe('AGBC Test Rotterdam Centraal');
    // Two rows in, one row out: the schedule is replaced, not appended to. A form that
    // accumulated would send a reminder for a service that no longer runs.
    expect(after.services).toHaveLength(1);
    expect(after.services[0].label).toBe('Saturday Vigil');
  });

  test('the slug cannot be changed once it exists', async () => {
    const client = ministryAdmin.serverClient();
    const existing = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the branch whose slug cannot change',
    );

    const refused = await saveBranch(
      client,
      input({ slug: `test-renamed-${stamp}` }),
      existing,
    );
    expect(refused).toEqual({ ok: false, reason: 'slug_shape' });
  });

  test('the list carries closed branches, which is the only place they appear', async () => {
    const all = await loadBranches(ministryAdmin.serverClient());
    expect(all.map((row) => row.slug)).toContain(`test-branch-${stamp}`);
    // Ordered by `order`, so the four seeded branches come before this one at 97.
    expect(all.length).toBeGreaterThanOrEqual(5);
  });
});

describe('closing one', () => {
  test('it is blocked while a leader still points at the branch', async () => {
    const client = ministryAdmin.serverClient();
    const branch = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the branch a leader is about to point at',
    );

    // Moved with the service key rather than through `set_member_role`, which reads
    // `caller_is_admin_live()` and therefore refuses a caller with no `auth.uid()` at all.
    // `profiles_guard` admits a trusted connection, which is the door seeds use. Checked,
    // because a fixture that silently did nothing would leave the assertion below testing
    // an empty branch instead of a blocked close.
    const moved = await admin()
      .from('profiles')
      .update({ role: 'leader', branch_id: branch.id })
      .eq('id', leader.userId);
    expect(moved.error).toBeNull();

    const impact = await loadCloseImpact(client, branch);
    expect(impact.leaders).toHaveLength(1);

    const refused = await closeBranch(
      client,
      branch,
      await stepUpCode(ministryAdmin),
    );
    expect(refused).toEqual({ ok: false, reason: 'has_leaders' });

    const stillOpen = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the branch that stayed open',
    );
    expect(stillOpen.status).toBe('active');
  });

  test('a wrong code changes nothing, and is refused before the database is asked', async () => {
    const client = ministryAdmin.serverClient();
    const branch = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the branch a wrong code must not close',
    );

    const refused = await closeBranch(client, branch, '000000');
    expect(refused).toEqual({ ok: false, reason: 'bad_code' });

    const stillOpen = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the branch that stayed open',
    );
    expect(stillOpen.status).toBe('active');
  });

  test('with the leader moved away it closes, and the app stops offering it', async () => {
    const client = ministryAdmin.serverClient();

    // Demoting is the other half of what `17` §5 asks for: reassigned OR demoted.
    const demoted = await admin()
      .from('profiles')
      .update({ role: 'member' })
      .eq('id', leader.userId);
    expect(demoted.error).toBeNull();

    const branch = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the branch about to close',
    );
    const closed = await closeBranch(
      client,
      branch,
      await stepUpCode(ministryAdmin),
    );
    expect(closed).toEqual({ ok: true });

    const after = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the closed branch',
    );
    expect(after.status).toBe('archived');
    // The row is its own audit record (`02`): who closed it, and when.
    expect(after.archivedAt).not.toBeNull();
    const { data: who } = await admin()
      .from('profiles')
      .select('display_name')
      .eq('id', ministryAdmin.userId)
      .single();
    expect(after.archivedBy).toBe(must(who, 'the admin profile').display_name);

    // THE OTHER HALF OF THE ROUND TRIP: gone from every surface a member chooses from.
    const visible = await asTheAppSeesIt();
    expect(visible.map((row) => row.id)).not.toContain(branch.id);
  });

  test('re-opening puts it back in front of members', async () => {
    const client = ministryAdmin.serverClient();
    const branch = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the closed branch about to re-open',
    );

    const reopened = await reopenBranch(
      client,
      branch,
      await stepUpCode(ministryAdmin),
    );
    expect(reopened).toEqual({ ok: true });

    const after = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the re-opened branch',
    );
    expect(after.status).toBe('active');
    // The stamp is cleared with the status: it records a state, not a history.
    expect(after.archivedAt).toBeNull();

    const visible = await asTheAppSeesIt();
    expect(visible.map((row) => row.id)).toContain(branch.id);
  });
});

describe('the headquarters', () => {
  test('a wrong code is refused, and HQ does not move', async () => {
    const client = ministryAdmin.serverClient();
    const branch = must(
      await loadBranch(client, `test-branch-${stamp}`),
      'the branch HQ must not move to',
    );

    const refused = await moveHeadquarters(client, branch, '000000');
    expect(refused).toEqual({ ok: false, reason: 'bad_code' });

    const { data } = await admin()
      .from('branches')
      .select('slug')
      .eq('is_hq', true);
    const holders = must(data, 'the headquarters row');
    expect(holders).toHaveLength(1);
    expect(holders[0].slug).not.toBe(`test-branch-${stamp}`);
  });

  test('a leader is refused before the code is ever checked', async () => {
    const branch = must(
      await loadBranch(ministryAdmin.serverClient(), `test-branch-${stamp}`),
      'the branch a leader must not hand HQ to',
    );

    // A DELIBERATELY WRONG CODE, and that is the assertion: `act()` authorizes before it
    // verifies, so a leader never reaches the authenticator check at all. A valid code here
    // would prove the same refusal for a weaker reason, and would cost the suite another
    // thirty-second wait for a window to turn over.
    const refused = await moveHeadquarters(
      leader.serverClient(),
      branch,
      '000000',
    );
    expect(refused).toEqual({ ok: false, reason: 'refused' });
  });
});
