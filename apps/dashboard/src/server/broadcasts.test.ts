import { describe, expect, it } from 'vitest';

import { checkLink, loadBroadcasts } from './broadcasts';

/**
 * The link allowlist (decided with Ayo 2026-08-19, `17` §2).
 *
 * This is the security-relevant half of the composer and it earns a test of its own: a
 * broadcast link is the one place a leader's typing becomes a tap target on hundreds of lock
 * screens. The database repeats the SHAPE as a CHECK, so a row can never hold a
 * scheme-relative or traversing link even if this is bypassed; what this owns is the
 * ALLOWLIST, and the refusal a human can act on.
 *
 * Written against the rules rather than against the implementation: each case names what an
 * attacker or a careless leader would actually type.
 */
describe('checkLink', () => {
  it('accepts nothing at all, because the link is optional', () => {
    expect(checkLink(undefined)).toEqual({ ok: true, value: null });
    expect(checkLink('')).toEqual({ ok: true, value: null });
    expect(checkLink('   ')).toEqual({ ok: true, value: null });
  });

  it('accepts an in-app path', () => {
    expect(checkLink('/events')).toEqual({ ok: true, value: '/events' });
    expect(checkLink('/event/8f09-4a2b')).toEqual({
      ok: true,
      value: '/event/8f09-4a2b',
    });
  });

  it('accepts agbcglobal.com and its subdomains over https', () => {
    expect(checkLink('https://agbcglobal.com/give').ok).toBe(true);
    expect(checkLink('https://www.agbcglobal.com/give').ok).toBe(true);
    expect(checkLink('https://dashboard.agbcglobal.com').ok).toBe(true);
  });

  it('refuses every other host', () => {
    // The case from the COMPOSE frame.
    expect(checkLink('https://facebook.com/events/8813')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
    expect(checkLink('https://youtube.com/watch?v=x')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  it('refuses a lookalike host that merely ends with the right letters', () => {
    // The one an allowlist written as `endsWith` would wave through, which is why the
    // check is a hostname match anchored at both ends.
    expect(checkLink('https://notagbcglobal.com/give').ok).toBe(false);
    expect(checkLink('https://agbcglobal.com.evil.test/give').ok).toBe(false);
    expect(checkLink('https://agbcglobal.co/give').ok).toBe(false);
  });

  it('refuses a credentials trick that puts the real host in the userinfo', () => {
    // Reads as agbcglobal.com to a human skimming it; the actual host is evil.test.
    expect(checkLink('https://agbcglobal.com@evil.test/give').ok).toBe(false);
  });

  it('refuses http, because a lock-screen tap should not downgrade', () => {
    expect(checkLink('http://agbcglobal.com/give')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });

  it('refuses schemes that are not the web at all', () => {
    expect(checkLink('javascript:alert(1)').ok).toBe(false);
    expect(checkLink('data:text/html,<script>').ok).toBe(false);
    expect(checkLink('agbc://prayer/1').ok).toBe(false);
  });

  it('refuses a path that is really an authority', () => {
    // `//host` is an authority even without a scheme, so it leaves the app.
    expect(checkLink('//evil.test/give')).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('refuses traversal and query strings in a path', () => {
    // Each is how a navigation stops being only a navigation (docs/spec/15, `03`).
    expect(checkLink('/events/../../secret')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(checkLink('/give?confirm=1')).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(checkLink('/give#top')).toEqual({ ok: false, reason: 'malformed' });
  });

  it('trims, so a pasted address with a stray space still works', () => {
    expect(checkLink('  /events  ')).toEqual({ ok: true, value: '/events' });
  });

  it('tells malformed from not-allowed, because the advice differs', () => {
    // "check it for a stray space" versus "that host cannot be sent, use WhatsApp".
    expect(checkLink('https://')).toEqual({ ok: false, reason: 'malformed' });
    expect(checkLink('https://facebook.com')).toEqual({
      ok: false,
      reason: 'not_allowed',
    });
  });
});

/**
 * How the three lists are partitioned.
 *
 * The RPC is stubbed rather than the database faked: `visible_broadcasts()` decides WHICH
 * rows a caller may see and is tested in pgTAP `045`, against a real database. What is
 * tested here is what this module does with them, which is the half that produced a visible
 * bug (2026-08-19: an admin's own broadcast appeared in both "waiting" and "yours", and was
 * counted in "1 waiting on you" when they could not act on it).
 */
describe('loadBroadcasts', () => {
  function record(overrides: Record<string, unknown> = {}) {
    return {
      id: 'b-1',
      author_id: 'leader-1',
      scope: 'branch',
      branch_id: 'branch-1',
      title: 'Title',
      body: 'Body',
      body_de: null,
      body_nl: null,
      body_fr: null,
      link: null,
      status: 'pending_approval',
      review_note: null,
      recipient_count: 10,
      sent_at: null,
      updated_at: '2026-08-19T10:00:00Z',
      author: { display_name: 'Grace' },
      approver: null,
      branch: { name: 'AGBC Glasgow' },
      ...overrides,
    };
  }

  function clientReturning(rows: unknown[]) {
    return {
      rpc: () => Promise.resolve({ data: rows, error: null }),
    } as unknown as Parameters<typeof loadBroadcasts>[0];
  }

  const admin = {
    userId: 'admin-1',
    role: 'admin',
  } as unknown as Parameters<typeof loadBroadcasts>[1];

  it('does not put an admin’s OWN broadcast in the queue waiting on them', async () => {
    const lists = await loadBroadcasts(
      clientReturning([record({ id: 'mine', author_id: 'admin-1' })]),
      admin,
    );

    expect(lists.waiting).toHaveLength(0);
    expect(lists.mine.map((row) => row.id)).toEqual(['mine']);
  });

  it('does put somebody else’s there', async () => {
    const lists = await loadBroadcasts(
      clientReturning([record({ id: 'theirs', author_id: 'leader-1' })]),
      admin,
    );

    expect(lists.waiting.map((row) => row.id)).toEqual(['theirs']);
    expect(lists.mine).toHaveLength(0);
  });

  it('gives a leader no approval queue at all', async () => {
    const leader = {
      userId: 'leader-1',
      role: 'leader',
    } as unknown as Parameters<typeof loadBroadcasts>[1];

    const lists = await loadBroadcasts(
      clientReturning([
        record({ id: 'mine', author_id: 'leader-1' }),
        record({ id: 'theirs', author_id: 'someone-else' }),
      ]),
      leader,
    );

    expect(lists.waiting).toHaveLength(0);
    expect(lists.mine.map((row) => row.id)).toEqual(['mine']);
  });

  it('files anything released or finished under sent', async () => {
    const lists = await loadBroadcasts(
      clientReturning([
        record({ id: 'going', status: 'sending' }),
        record({ id: 'done', status: 'sent' }),
        record({ id: 'stopped', status: 'halted' }),
        record({ id: 'broken', status: 'failed' }),
      ]),
      admin,
    );

    expect(lists.sent.map((row) => row.id)).toEqual([
      'going',
      'done',
      'stopped',
      'broken',
    ]);
    expect(lists.waiting).toHaveLength(0);
  });
});
