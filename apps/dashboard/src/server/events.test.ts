import { describe, expect, it, vi } from 'vitest';

import { loadEvents, saveEvent, setEventStatus, type EventRow } from './events';

/**
 * What the events module decides (docs/spec/17 §3, `11`; W3.5 slice 4).
 *
 * The database owns the boundary: `can_moderate_branch` on every write, the guard that
 * refuses a past reinstatement, and the notice machinery that decides who hears about it.
 * All of that is proven in pgTAP `046` against a real database, and none of it is re-tested
 * here.
 *
 * What IS here is the half that has no other home: which events a leader is shown, which of
 * them they are offered controls for, and the refusals this layer makes before the database
 * is asked. The last of those matters most, because a refusal that arrives as a Postgres
 * error code has already cost the leader their typing.
 */

const glasgow = 'branch-glasgow';

function caller(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'leader-1',
    email: 'grace@example.test',
    displayName: 'Grace Bello',
    role: 'leader',
    branchId: glasgow,
    branchName: 'AGBC Glasgow',
    ...overrides,
  } as unknown as Parameters<typeof loadEvents>[1];
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    branch_id: glasgow,
    title: 'Youth Conference',
    description: 'A day for the young people of the family.',
    starts_at_local: '2026-09-12T10:00:00',
    ends_at_local: null,
    timezone: 'Europe/London',
    location: 'Wellington Church',
    status: 'scheduled',
    rsvp_enabled: true,
    branch: { name: 'AGBC Glasgow' },
    ...overrides,
  };
}

/**
 * A stand-in for the query builder, not for the database.
 *
 * `loadEvents` builds one chain and awaits it; the point under test is what it does with the
 * rows and how it filters for a leader, so the chain records what it was asked for and hands
 * back fixtures. Anything about WHICH rows the database would return is pgTAP's.
 */
function clientReturning(rows: unknown[]) {
  const calls: { or?: string } = {};
  const builder = {
    select: () => builder,
    order: () => builder,
    or: (filter: string) => {
      calls.or = filter;
      return Promise.resolve({ data: rows, error: null });
    },
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: rows, error: null }),
  };
  return {
    client: {
      from: () => builder,
    } as unknown as Parameters<typeof loadEvents>[0],
    calls,
  };
}

describe('loadEvents', () => {
  it('splits on today, soonest first and history newest first', async () => {
    // In the order the query asks for them: starts_at_local ascending.
    const { client } = clientReturning([
      record({ id: 'older', starts_at_local: '2026-07-01T10:00:00' }),
      record({ id: 'past', starts_at_local: '2026-08-01T10:00:00' }),
      record({ id: 'soon', starts_at_local: '2026-09-12T10:00:00' }),
      record({ id: 'later', starts_at_local: '2026-10-01T10:00:00' }),
    ]);

    const lists = await loadEvents(
      client,
      caller(),
      new Date('2026-08-20T09:00:00Z'),
    );

    expect(lists.upcoming.map((row) => row.id)).toEqual(['soon', 'later']);
    expect(lists.past.map((row) => row.id)).toEqual(['past', 'older']);
  });

  it('counts an event starting later today as upcoming, not past', async () => {
    // The cut is the START OF the day, not the moment of the read: a leader looking at the
    // list at 18:00 has not finished with tonight's event.
    const { client } = clientReturning([
      record({ id: 'tonight', starts_at_local: '2026-08-20T19:00:00' }),
    ]);

    const lists = await loadEvents(
      client,
      caller(),
      new Date('2026-08-20T20:30:00'),
    );

    expect(lists.upcoming.map((row) => row.id)).toEqual(['tonight']);
    expect(lists.past).toHaveLength(0);
  });

  it('asks for a leader’s own branch and the ministry-wide ones, and no others', async () => {
    const { client, calls } = clientReturning([]);
    await loadEvents(client, caller());
    expect(calls.or).toBe(`branch_id.eq.${glasgow},branch_id.is.null`);
  });

  it('asks for everything when an admin reads it', async () => {
    const { client, calls } = clientReturning([]);
    await loadEvents(client, caller({ role: 'admin' }));
    expect(calls.or).toBeUndefined();
  });

  it('marks a ministry-wide event uneditable for a leader, and editable for an admin', async () => {
    // A leader SEES it (their members are invited) and cannot touch it:
    // can_moderate_branch(null) is admins alone. Showing them an edit button that the
    // database would refuse is the bug this prevents.
    const rows = [record({ id: 'global', branch_id: null, branch: null })];

    const asLeader = await loadEvents(clientReturning(rows).client, caller());
    expect(asLeader.upcoming[0].editable).toBe(false);
    expect(asLeader.upcoming[0].branchId).toBeNull();

    const asAdmin = await loadEvents(
      clientReturning(rows).client,
      caller({ role: 'admin' }),
    );
    expect(asAdmin.upcoming[0].editable).toBe(true);
  });
});

/**
 * The refusals this layer owns.
 *
 * Each is a sentence the leader can act on, decided before the database is asked, so nobody
 * loses a form to a constraint name.
 */
describe('saveEvent', () => {
  const untouched = {
    from: () => {
      throw new Error('the database must not be reached for a refused save');
    },
    rpc: () => {
      throw new Error('the database must not be reached for a refused save');
    },
  } as unknown as Parameters<typeof saveEvent>[0];

  function input(overrides: Record<string, unknown> = {}) {
    return {
      scope: 'branch' as const,
      title: 'Youth Conference',
      description: 'A day for the young people.',
      startsAtLocal: '2026-09-12T10:00',
      location: 'Wellington Church',
      rsvpEnabled: true,
      ...overrides,
    };
  }

  it('refuses an event with no title, no start or no place', async () => {
    expect(await saveEvent(untouched, input({ title: '   ' }))).toEqual({
      ok: false,
      reason: 'title_required',
    });
    expect(await saveEvent(untouched, input({ startsAtLocal: '' }))).toEqual({
      ok: false,
      reason: 'starts_required',
    });
    expect(await saveEvent(untouched, input({ location: ' ' }))).toEqual({
      ok: false,
      reason: 'location_required',
    });
  });

  it('refuses an end before the start, in words rather than as a constraint name', async () => {
    // `events_ends_after_start` is a real CHECK and it would fire; what it would not do is
    // tell a leader which of the two fields to fix.
    expect(
      await saveEvent(
        untouched,
        input({
          startsAtLocal: '2026-09-12T10:00',
          endsAtLocal: '2026-09-12T09:00',
        }),
      ),
    ).toEqual({ ok: false, reason: 'ends_before_start' });
  });

  it('refuses to move an existing event between scopes', async () => {
    // Changing a branch event into a ministry-wide one would change who it belongs to and
    // who has already been told about it, and the notice machinery has no way to say "this
    // is now somebody else's event". RLS would refuse it too; this refuses it readably.
    const existing = {
      id: 'e-1',
      branchId: glasgow,
      status: 'scheduled',
    } as unknown as EventRow;

    expect(
      await saveEvent(untouched, input({ scope: 'ministry' }), existing),
    ).toEqual({ ok: false, reason: 'scope_locked' });
  });
});

describe('setEventStatus', () => {
  function event(overrides: Partial<EventRow> = {}): EventRow {
    return {
      id: 'e-1',
      branchId: glasgow,
      branchName: 'AGBC Glasgow',
      title: 'Youth Conference',
      description: '',
      startsAtLocal: '2026-09-12T10:00:00',
      endsAtLocal: null,
      timezone: 'Europe/London',
      location: 'Wellington Church',
      status: 'scheduled',
      rsvpEnabled: true,
      statusChangedBy: null,
      statusChangedAt: null,
      editable: true,
      ...overrides,
    };
  }

  function clientRejecting(code: string) {
    return {
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      },
      from: () => ({
        update: () => ({
          eq: () => Promise.resolve({ error: { code, message: code } }),
        }),
      }),
    } as unknown as Parameters<typeof setEventStatus>[0];
  }

  it('turns the guard’s refusal into something a human can read', async () => {
    // The rule that a past event cannot be reinstated lives in events_update_guard, which
    // raises 23514. Repeating the test here would mean two definitions of "now", and they
    // would disagree on the one day it mattered.
    vi.spyOn(await import('./authorize'), 'authorize').mockResolvedValue({
      ok: true,
      caller: caller() as never,
    } as never);

    expect(
      await setEventStatus(clientRejecting('23514'), event(), 'scheduled'),
    ).toEqual({ ok: false, reason: 'already_started' });

    vi.restoreAllMocks();
  });
});
