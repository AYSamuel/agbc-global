import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  admin,
  createCaller,
  createTestBranch,
  deleteCaller,
  deleteTestBranch,
  type TestCaller,
} from '@/test/callers';

import {
  linkRegistration,
  loadMember,
  loadMemberByEmail,
  loadRegistration,
  loadRegistrationQueue,
  loadSuggestions,
  REGISTRATION_COLUMNS,
  searchMembers,
  setRegistrationAside,
  unlinkRegistration,
} from './registrations';

/**
 * Attaching a website registration to a member, against the real database (#164).
 *
 * NOT AGAINST THE SCREEN. Everything worth breaking here is invisible in a rendered page: a
 * loader that quietly fetches the amount looks identical to one that does not, and a refusal
 * that maps to the wrong code reads as a plausible sentence. So the assertions are about
 * what comes back and what changed, never about what was drawn.
 *
 * WHY REFUSALS ARE ASSERTED BY WHAT DID NOT CHANGE. An UPDATE a caller is not entitled to
 * make is filtered by RLS silently, so "it threw" proves nothing on its own; pgTAP `052`
 * makes that point at the data layer and this file repeats it through PostgREST, which is a
 * different road (the W3.1 slice 4 rule: a privilege proven in pgTAP is not yet proven
 * through the API the app actually speaks).
 *
 * Fixtures are scoped to rows this file created (#184). Registrations go in with the service
 * key, because `authenticated` holds no INSERT on `course_registrations`: in life the
 * website's key writes them.
 */

const minted: TestCaller[] = [];
const branches: string[] = [];
const registrations: string[] = [];

let branchId: string;
let ministryAdmin: TestCaller;
let branchLeader: TestCaller;
let ordinaryMember: TestCaller;
/** The member every happy-path link attaches to. */
let target: TestCaller;

const stamp = `${String(process.pid)}-${String(Date.now())}`;

async function caller(
  ...args: Parameters<typeof createCaller>
): Promise<TestCaller> {
  const created = await createCaller(...args);
  minted.push(created);
  return created;
}

/**
 * A website registration, written the way the website writes one: service key, no
 * `profile_id`, no link trio.
 */
async function registration(
  label: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin()
    .from('course_registrations')
    .insert({
      // A course string that matches no slug, so `course_id` stays null and the
      // double-booking partial unique cannot interfere with linking several of these to one
      // member. This file is about identity, not enrolment.
      course: `t164-${label}-${stamp}`,
      format: 'part_time',
      full_name: `Payer ${label}`,
      email: `t164-${label}-${stamp}@test.local`,
      city: 'Testville',
      country: 'Testland',
      branch: 'Test Branch',
      amount: 12345,
      currency: 'gbp',
      ...overrides,
    })
    .select('id')
    .single();

  if (error) throw new Error(`could not seed a registration: ${error.message}`);
  registrations.push(data.id);
  return data.id;
}

beforeAll(async () => {
  branchId = await createTestBranch('academy');
  branches.push(branchId);

  ministryAdmin = await caller({ role: 'admin', branchId, mfa: 'verified' });
  branchLeader = await caller({ role: 'leader', branchId, mfa: 'verified' });
  ordinaryMember = await caller({ role: 'member', branchId, mfa: 'verified' });
  target = await caller({ role: 'member', branchId, mfa: 'verified' });
}, 90_000);

afterAll(async () => {
  if (registrations.length > 0) {
    await admin().from('course_registrations').delete().in('id', registrations);
  }
  for (const person of minted) await deleteCaller(person);
  for (const id of branches) await deleteTestBranch(id);
}, 90_000);

describe('what the queue may see', () => {
  /**
   * The amount, asserted at the layer that actually decides it.
   *
   * The first version of this test rendered the loaded row and looked for the figure, and it
   * PASSED with `amount` added back to the query: the mapper drops any column it does not
   * name, so the browser was safe and the "we never read it" rule was untested. A green test
   * is not evidence until it can fail. This one names the list, so putting the column back
   * turns it red.
   */
  test('the amount is never read at all', () => {
    expect(REGISTRATION_COLUMNS).not.toContain('amount');
    // And the one that could not be read even if it were asked for: outside the grant.
    expect(REGISTRATION_COLUMNS).not.toContain('set_aside_by');
  });

  test('and never reaches the object a screen is handed', async () => {
    const id = await registration('amount');
    const { registration: row } = await loadRegistration(
      ministryAdmin.serverClient(),
      id,
    );

    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain('12345');
    expect(Object.keys(row ?? {})).not.toContain('amount');
  });

  test('a waiting row appears in the queue and its counts', async () => {
    const id = await registration('waiting');
    const queue = await loadRegistrationQueue(
      ministryAdmin.serverClient(),
      'waiting',
    );

    expect(queue.rows.map((row) => row.id)).toContain(id);
    expect(queue.counts.waiting).toBeGreaterThan(0);
  });

  test('a leader reads nothing, because an unlinked row has no branch to be in', async () => {
    const id = await registration('leader-read');
    const { registration: row } = await loadRegistration(
      branchLeader.serverClient(),
      id,
    );

    // ADR 0017 decision 5, from the other side: there is no correct branch leader for a
    // stranger's payment record, so RLS hands back nothing rather than an error.
    expect(row).toBeNull();
  });
});

describe('linking', () => {
  test('attaches the row, records how, and proves the address', async () => {
    const id = await registration('happy');
    const result = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: target.userId,
    });
    expect(result).toEqual({ ok: true });

    const { data } = await admin()
      .from('course_registrations')
      .select('profile_id, link_method, linked_by, email')
      .eq('id', id)
      .single();

    expect(data?.profile_id).toBe(target.userId);
    expect(data?.link_method).toBe('leader');
    expect(data?.linked_by).toBe(ministryAdmin.userId);

    // The point of the feature: the member stops hitting this on their next registration.
    const proven = await admin()
      .from('profile_emails')
      .select('profile_id')
      .eq('email', data?.email ?? '')
      .maybeSingle();
    expect(proven.data?.profile_id).toBe(target.userId);
  });

  test('the admin is the judge: a name that matches nothing still links', async () => {
    // The case the issue exists for. The suggestion machinery would never offer this member,
    // and it must still succeed, because the admin has spoken to the person.
    const id = await registration('mismatch', {
      full_name: 'Somebody Entirely Different',
    });
    const result = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: target.userId,
    });

    expect(result).toEqual({ ok: true });
  });

  test('a second attempt on a linked row is refused as such, and moves nobody', async () => {
    const id = await registration('double');
    const other = await caller({ role: 'member', branchId, mfa: 'verified' });

    await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: target.userId,
    });
    const second = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: other.userId,
    });

    expect(second).toEqual({ ok: false, reason: 'already_linked' });

    // The distinguishable code matters, but this is the assertion that matters more: a
    // double submit must not quietly move a course between two people.
    const { data } = await admin()
      .from('course_registrations')
      .select('profile_id')
      .eq('id', id)
      .single();
    expect(data?.profile_id).toBe(target.userId);
  });

  test('an address another member has proven refuses the whole link', async () => {
    const owner = await caller({ role: 'member', branchId, mfa: 'verified' });
    const shared = `t164-shared-${stamp}@test.local`;

    const first = await registration('owner', { email: shared });
    await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: first,
      memberId: owner.userId,
    });

    const second = await registration('taken', { email: shared });
    const result = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: second,
      memberId: target.userId,
    });

    // Its own code, because this is the one refusal the screen answers with a whole surface:
    // two people with a claim on one mailbox is the mis-link this tool is most dangerous for.
    expect(result).toEqual({ ok: false, reason: 'address_taken' });

    const { data } = await admin()
      .from('course_registrations')
      .select('profile_id')
      .eq('id', second)
      .single();
    expect(data?.profile_id).toBeNull();
  });

  test('so does an address that is another account’s sign-in', async () => {
    const stranger = await caller({
      role: 'member',
      branchId,
      mfa: 'verified',
    });
    const id = await registration('signin', { email: stranger.email });

    const result = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: target.userId,
    });

    expect(result).toEqual({ ok: false, reason: 'address_is_signin' });
  });

  test('a set-aside row has to be brought back first', async () => {
    const id = await registration('aside-then-link');
    await setRegistrationAside(ministryAdmin.serverClient(), {
      registrationId: id,
      aside: true,
    });

    const result = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: target.userId,
    });
    expect(result).toEqual({ ok: false, reason: 'set_aside' });
  });

  test('a registration that is not there is its own refusal', async () => {
    const result = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: '00000000-0000-4000-8000-0000000000ff',
      memberId: target.userId,
    });
    expect(result).toEqual({ ok: false, reason: 'gone' });
  });

  test('and so is a member that is not there', async () => {
    const id = await registration('no-member');
    const result = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: '00000000-0000-4000-8000-0000000000fe',
    });
    expect(result).toEqual({ ok: false, reason: 'no_member' });
  });
});

describe('unlinking', () => {
  test('returns the row to the queue and leaves the address proven', async () => {
    const id = await registration('unlink');
    await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: target.userId,
    });

    const result = await unlinkRegistration(ministryAdmin.serverClient(), id);
    expect(result).toEqual({ ok: true });

    const { data } = await admin()
      .from('course_registrations')
      .select('profile_id, link_method, linked_at, email')
      .eq('id', id)
      .single();

    expect(data?.profile_id).toBeNull();
    expect(data?.link_method).toBeNull();
    expect(data?.linked_at).toBeNull();

    // SPEC open risk 1, asserted rather than assumed: unlinking deliberately does NOT
    // un-prove the address, so the next payment from it attaches automatically again. That is
    // exactly why the unlink screen says so.
    const proven = await admin()
      .from('profile_emails')
      .select('profile_id')
      .eq('email', data?.email ?? '')
      .maybeSingle();
    expect(proven.data?.profile_id).toBe(target.userId);
  });

  test('a row nobody is holding cannot be unlinked', async () => {
    const id = await registration('unlink-unlinked');
    const result = await unlinkRegistration(ministryAdmin.serverClient(), id);
    expect(result).toEqual({ ok: false, reason: 'not_linked' });
  });
});

describe('setting aside', () => {
  test('takes the row out of the queue and brings it back', async () => {
    const id = await registration('aside');

    expect(
      await setRegistrationAside(ministryAdmin.serverClient(), {
        registrationId: id,
        aside: true,
      }),
    ).toEqual({ ok: true });

    const asideView = await loadRegistrationQueue(
      ministryAdmin.serverClient(),
      'aside',
    );
    expect(asideView.rows.map((row) => row.id)).toContain(id);

    const waiting = await loadRegistrationQueue(
      ministryAdmin.serverClient(),
      'waiting',
    );
    expect(waiting.rows.map((row) => row.id)).not.toContain(id);

    expect(
      await setRegistrationAside(ministryAdmin.serverClient(), {
        registrationId: id,
        aside: false,
      }),
    ).toEqual({ ok: true });

    const back = await loadRegistrationQueue(
      ministryAdmin.serverClient(),
      'waiting',
    );
    expect(back.rows.map((row) => row.id)).toContain(id);
  });

  test('a linked row is not un-matchable', async () => {
    const id = await registration('aside-linked');
    await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: id,
      memberId: target.userId,
    });

    const result = await setRegistrationAside(ministryAdmin.serverClient(), {
      registrationId: id,
      aside: true,
    });
    expect(result).toEqual({ ok: false, reason: 'is_linked' });
  });
});

/**
 * The refusals, asserted SEPARATELY for a leader and for a member rather than assumed from a
 * shared helper, and each one checking what did not change.
 */
describe('who may not do any of it', () => {
  test('a leader is refused by all three writes, and nothing moves', async () => {
    const id = await registration('leader-write');

    expect(
      await linkRegistration(branchLeader.serverClient(), {
        registrationId: id,
        memberId: target.userId,
      }),
    ).toEqual({ ok: false, reason: 'refused' });

    expect(
      await setRegistrationAside(branchLeader.serverClient(), {
        registrationId: id,
        aside: true,
      }),
    ).toEqual({ ok: false, reason: 'refused' });

    const linked = await registration('leader-unlink');
    await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: linked,
      memberId: target.userId,
    });
    expect(
      await unlinkRegistration(branchLeader.serverClient(), linked),
    ).toEqual({ ok: false, reason: 'refused' });

    const { data } = await admin()
      .from('course_registrations')
      .select('id, profile_id, set_aside_at')
      .in('id', [id, linked]);

    const untouched = data?.find((row) => row.id === id);
    const stillLinked = data?.find((row) => row.id === linked);
    expect(untouched?.profile_id).toBeNull();
    expect(untouched?.set_aside_at).toBeNull();
    expect(stillLinked?.profile_id).toBe(target.userId);
  });

  test('a member cannot claim a registration for themselves', async () => {
    // The cut claim flow stays cut (ADR 0017's 2026-08-11 amendment).
    const id = await registration('member-write');

    expect(
      await linkRegistration(ordinaryMember.serverClient(), {
        registrationId: id,
        memberId: ordinaryMember.userId,
      }),
    ).toEqual({ ok: false, reason: 'refused' });

    const { data } = await admin()
      .from('course_registrations')
      .select('profile_id')
      .eq('id', id)
      .single();
    expect(data?.profile_id).toBeNull();
  });

  test('a leader cannot ask who a stranger might be', async () => {
    const id = await registration('leader-suggest');
    await expect(
      loadSuggestions(branchLeader.serverClient(), id),
    ).rejects.toThrow();
  });
});

describe('finding the member', () => {
  test('suggestions carry the reason that put them there', async () => {
    const id = await registration('suggest', {
      full_name: 'Caller Suggestible',
    });
    const suggestions = await loadSuggestions(ministryAdmin.serverClient(), id);

    // Every seeded caller is named "Caller <n>", so this row resembles all of them. What is
    // asserted is not WHO comes back but that each one says why, since the reason is what
    // lets an admin disagree with a confident-looking guess (decision 1).
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.reason).toMatch(/similar name/);
    }
  });

  test('a one-character search is refused rather than answered', async () => {
    const result = await searchMembers(ministryAdmin.serverClient(), 'a');
    expect(result).toEqual({ status: 'too_short' });
  });

  test('a wildcard cannot be used to list the ministry', async () => {
    // `%` is a LIKE wildcard, so `%%` clears the two-character floor and then, if it were
    // stripped afterwards, would search for nothing at all and match every member alive.
    // This failed on the first run for exactly that reason: the floor was applied before the
    // stripping, which made it decoration. Refused as too short is the honest answer.
    expect(await searchMembers(ministryAdmin.serverClient(), '%%')).toEqual({
      status: 'too_short',
    });
    expect(await searchMembers(ministryAdmin.serverClient(), '_%')).toEqual({
      status: 'too_short',
    });

    // A wildcard inside a real query is removed rather than honoured, so it narrows to the
    // literal letters instead of widening to everybody.
    const mixed = await searchMembers(ministryAdmin.serverClient(), 'Cal%ler');
    expect(mixed.status).toBe('ok');
    if (mixed.status === 'ok') {
      expect(mixed.members.length).toBeLessThanOrEqual(8);
    }
  });

  test('an address is matched exactly, a name loosely', async () => {
    const byAddress = await searchMembers(
      ministryAdmin.serverClient(),
      target.email,
    );
    expect(byAddress.status).toBe('ok');
    if (byAddress.status === 'ok') {
      expect(byAddress.members.map((row) => row.id)).toContain(target.userId);
    }

    const byName = await searchMembers(ministryAdmin.serverClient(), 'Caller');
    expect(byName.status).toBe('ok');
    if (byName.status === 'ok') {
      expect(byName.members.length).toBeGreaterThan(0);
      // Never enough to page through a branch.
      expect(byName.members.length).toBeLessThanOrEqual(8);
    }
  });
});

/**
 * The four things a review found by driving the screens that 326 green tests had not (see the
 * migration `20260831150000` and the module's own notes).
 *
 * Each of these was invisible to a rendered page or to a passing suite in a different way, so
 * each is asserted at the layer that actually decides it rather than through a screen.
 */
describe('what the review found', () => {
  /**
   * THE DOUBLE-BOOKING WALL, WHICH THE OTHER FIXTURES IN THIS FILE ARE BUILT TO AVOID.
   *
   * `registration()` above uses a course string that matches no slug precisely so the partial
   * unique on (course_id, profile_id) cannot interfere, and that exemption is how the one
   * collision a real admin meets went untested. This test opts back in with a REAL course, and
   * it is the state the whole feature exists downstream of: somebody the auto-match could not
   * find is somebody who can pay twice.
   */
  test('a second payment for a course the member already holds is refused in words', async () => {
    const { data: course, error } = await admin()
      .from('courses')
      .select('slug')
      .limit(1)
      .single();
    if (error) throw new Error(`could not read a course: ${error.message}`);

    const first = await registration('enrol-a', { course: course.slug });
    const second = await registration('enrol-b', { course: course.slug });

    const linked = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: first,
      memberId: target.userId,
    });
    expect(linked).toEqual({ ok: true });

    const refused = await linkRegistration(ministryAdmin.serverClient(), {
      registrationId: second,
      memberId: target.userId,
    });

    // Not `failed`. That is the whole point: `failed` renders as "That did not go through.
    // Try again.", and no number of retries could ever change this answer.
    expect(refused).toEqual({ ok: false, reason: 'already_enrolled' });

    const { data: row } = await admin()
      .from('course_registrations')
      .select('profile_id, linked_at')
      .eq('id', second)
      .single();
    expect(row?.profile_id).toBeNull();
    expect(row?.linked_at).toBeNull();
  });

  /**
   * A malformed id is "not there", not a 500.
   *
   * PostgREST answers a bad uuid with an ERROR rather than with no rows, so every one of these
   * reads used to throw into the error boundary. `/academy?undo=<typo>` took down the module's
   * front door, which is the read this asserts first.
   */
  test('an id that is not a uuid is nothing to find, never a crash', async () => {
    const client = ministryAdmin.serverClient();

    await expect(loadRegistration(client, 'not-a-uuid')).resolves.toMatchObject(
      { registration: null },
    );
    await expect(loadMember(client, 'not-a-uuid')).resolves.toBeNull();
    await expect(loadSuggestions(client, 'not-a-uuid')).resolves.toEqual([]);

    // The shape is checked, not merely the length: a 36-character string of the wrong
    // alphabet is exactly what a truncated copy-paste produces.
    await expect(
      loadRegistration(client, 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'),
    ).resolves.toMatchObject({ registration: null });
  });

  /**
   * Whose SIGN-IN address it is, which is the half of the collision that has a way out.
   *
   * The refusal screen offers "attach it to them instead" off the back of this read, and that
   * link only works because `profile_emails_insert_guard` refuses another account's address
   * and not the account's own.
   */
  test('the sign-in owner of an address can be named, and linking to them is allowed', async () => {
    const owner = await loadMemberByEmail(
      ministryAdmin.serverClient(),
      target.email.toUpperCase(),
    );
    expect(owner?.id).toBe(target.userId);

    const id = await registration('signin-fix', { email: target.email });
    await expect(
      linkRegistration(ministryAdmin.serverClient(), {
        registrationId: id,
        memberId: target.userId,
      }),
    ).resolves.toEqual({ ok: true });
  });

  /**
   * The search says how many it is SHOWING, and whether there are more.
   *
   * The label used to read "N people match", where N was the length after the eight-row cap,
   * so forty matches were reported as eight people matching. One row over the cap is fetched
   * purely to tell a full page from a truncated one.
   */
  test('a search that fills the cap says so, and still returns only eight', async () => {
    const many = await Promise.all(
      Array.from({ length: 9 }, () =>
        caller({ role: 'member', branchId, mfa: 'verified' }),
      ),
    );
    expect(many).toHaveLength(9);

    const result = await searchMembers(ministryAdmin.serverClient(), 'Caller');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.members).toHaveLength(8);
      expect(result.truncated).toBe(true);
    }
  }, 120_000);
});
