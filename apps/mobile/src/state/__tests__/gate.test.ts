import {
  BACKGROUND_CLEAR_MS,
  backgroundStayClears,
  useGateStore,
} from '../gate';

// The gate-return machine's lifetime rules (docs/spec/03).

beforeEach(() => {
  useGateStore.setState({ pending: null, dismissedKinds: [] });
});

describe('pending action lifecycle', () => {
  it('a gate sign-in remembers exactly one action', () => {
    useGateStore
      .getState()
      .beginGateSignIn({ kind: 'glory', testimonyId: 'tes-1' });
    expect(useGateStore.getState().pending).toEqual({
      kind: 'glory',
      testimonyId: 'tes-1',
    });
  });

  it('takePending is take-once: a replay can never double-fire', () => {
    useGateStore.getState().beginGateSignIn({ kind: 'rsvp', eventId: 'evt-1' });
    expect(useGateStore.getState().takePending()).toEqual({
      kind: 'rsvp',
      eventId: 'evt-1',
    });
    expect(useGateStore.getState().takePending()).toBeNull();
  });

  it('a later gate replaces the earlier pending action', () => {
    useGateStore
      .getState()
      .beginGateSignIn({ kind: 'glory', testimonyId: 'tes-1' });
    useGateStore
      .getState()
      .beginGateSignIn({ kind: 'intercede', prayerId: 'pra-1' });
    expect(useGateStore.getState().pending).toEqual({
      kind: 'intercede',
      prayerId: 'pra-1',
    });
  });
});

describe('dismissal (docs/spec/03 "Not now")', () => {
  it('clears the pending action and records the kind once', () => {
    useGateStore
      .getState()
      .beginGateSignIn({ kind: 'glory', testimonyId: 'tes-1' });
    useGateStore.getState().dismissGate('glory');
    useGateStore.getState().dismissGate('glory');
    const state = useGateStore.getState();
    expect(state.pending).toBeNull();
    expect(state.dismissedKinds).toEqual(['glory']);
  });
});

describe('background expiry (docs/spec/03: longer than 5 minutes clears)', () => {
  it('exactly the limit does not clear; a moment past it does', () => {
    expect(backgroundStayClears(0, BACKGROUND_CLEAR_MS)).toBe(false);
    expect(backgroundStayClears(0, BACKGROUND_CLEAR_MS + 1)).toBe(true);
    expect(backgroundStayClears(0, 30_000)).toBe(false);
  });
});
