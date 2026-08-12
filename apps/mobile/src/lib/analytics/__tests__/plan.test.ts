import { EVENT_SOURCE, type AnalyticsEventName } from '@agbc/shared';

// The tracking plan's own integrity (W2.10; `22` §5, ADR 0020).
//
// `EVENT_SOURCE` is the register that says, per event, whether the app fires it, whether a
// later work item owns it, or whether it is answered from the database. These assertions
// exist so the register cannot quietly fall out of step with the event list: adding an event
// without deciding where it comes from fails here, which is the whole point of keeping the
// plan as data rather than as a comment.

const names = Object.keys(EVENT_SOURCE) as AnalyticsEventName[];

describe('the v1 tracking plan', () => {
  test('every event says where it comes from', () => {
    for (const name of names) {
      expect(['app', 'deferred', 'database']).toContain(
        EVENT_SOURCE[name].fires,
      );
    }
  });

  test('an event nothing can fire yet names the work item that lands it', () => {
    const deferred = names.filter(
      (name) => EVENT_SOURCE[name].fires === 'deferred',
    );

    // Six of them as of W2.10 slice 1: push (W3.3) and the Phase 4 plan/library surfaces.
    expect(deferred.length).toBeGreaterThan(0);
    for (const name of deferred) {
      const source = EVENT_SOURCE[name];
      expect(source.fires === 'deferred' && source.owner.length > 0).toBe(true);
    }
  });

  test('the whole `22` §5 list is present, not just the fireable part', () => {
    // Spot-checks across the three sources, so trimming the list under time pressure (which
    // `18` explicitly warns against, launch week being the only chance to baseline) shows up
    // as a failing test rather than as a quieter dashboard six months later.
    expect(names).toContain('glory_tapped');
    expect(names).toContain('i_prayed_tapped');
    expect(names).toContain('answered_converted_to_testimony');
    expect(names).toContain('testimony_approved');
    expect(names).toContain('reader_opened');
    expect(names).toContain('broadcast_received');
    expect(names).toHaveLength(24);
  });
});
