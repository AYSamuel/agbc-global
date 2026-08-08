import { uncelebrated, useCelebratedStore } from '../celebrated';
import { badgeFor } from '../milestones';

// Which milestones get an overlay, and which get silence (docs/spec/10: "no
// double celebrations", and never a party for old news).

beforeEach(() => {
  useCelebratedStore.setState({ known: null, showing: null });
});

describe('the baseline rule', () => {
  test('the first list a device sees is history, and is not celebrated', () => {
    // A member who has been here since June opens the app on a new phone. Their
    // first service happened months ago; congratulating them for it now would
    // be the app mistaking its own ignorance for their achievement.
    expect(uncelebrated(['first_service', '4_week_rhythm'], null)).toEqual([]);
  });

  test('what arrives after the baseline is news', () => {
    const store = useCelebratedStore.getState();
    store.seedBaseline(['first_service']);

    expect(
      uncelebrated(
        ['first_service', '4_week_rhythm'],
        useCelebratedStore.getState().known,
      ),
    ).toEqual(['4_week_rhythm']);
  });

  test('the baseline is only ever taken once', () => {
    const store = useCelebratedStore.getState();
    store.seedBaseline([]);
    // A later answer must not re-baseline: a member who signs in, sees an empty
    // list, then earns their first service would otherwise have it swallowed.
    useCelebratedStore.getState().seedBaseline(['first_service']);

    expect(useCelebratedStore.getState().known).toEqual([]);
    expect(
      uncelebrated(['first_service'], useCelebratedStore.getState().known),
    ).toEqual(['first_service']);
  });

  test('a celebrated milestone never comes round again', () => {
    useCelebratedStore.getState().seedBaseline([]);
    useCelebratedStore.getState().markCelebrated('first_service');

    expect(
      uncelebrated(['first_service'], useCelebratedStore.getState().known),
    ).toEqual([]);
  });

  test('two landing together are celebrated one at a time, oldest first', () => {
    useCelebratedStore.getState().seedBaseline([]);
    // A first service that is also a fourth week: the server awards both on the
    // same insert, and `milestones` comes back oldest-first.
    const pending = uncelebrated(
      ['first_service', '4_week_rhythm'],
      useCelebratedStore.getState().known,
    );
    expect(pending[0]).toBe('first_service');

    useCelebratedStore.getState().markCelebrated('first_service');
    expect(
      uncelebrated(
        ['first_service', '4_week_rhythm'],
        useCelebratedStore.getState().known,
      ),
    ).toEqual(['4_week_rhythm']);
  });

  test('signing out forgets who had been told what', () => {
    useCelebratedStore.getState().seedBaseline(['first_service']);
    useCelebratedStore.getState().reset();

    // The next member on this phone has been told nothing, and their own first
    // service must not be swallowed by the last member's history.
    expect(useCelebratedStore.getState().known).toBeNull();
  });
});

describe('a kind this build cannot name', () => {
  test('has no badge, so the overlay has nothing to say and says nothing', () => {
    // `milestones.kind` is TEXT and the server may award one this app has never
    // heard of (plan milestones arrive at W4.4). An overlay reading
    // "plan_7_days" at somebody is worse than silence.
    expect(badgeFor('plan_7_days')).toBeNull();
    expect(badgeFor('first_service')).not.toBeNull();
  });

  test('every named kind carries both its badge and its celebration copy', () => {
    const badge = badgeFor('4_week_rhythm');
    expect(badge?.glyph).toBe('🔥');
    expect(badge?.labelKey).toBe('rhythm:milestoneFourWeek');
    expect(badge?.celebrateTitleKey).toBe('rhythm:celebrateFourWeekTitle');
    expect(badge?.celebrateBodyKey).toBe('rhythm:celebrateFourWeekBody');
  });
});
