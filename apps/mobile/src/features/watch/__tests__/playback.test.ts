import {
  END_GRACE_SEC,
  MIN_RESUME_SEC,
  prunePositions,
  resumeTarget,
  shouldSave,
  usePlaybackStore,
  type PlaybackEntry,
} from '../playback';

// Local playback resume (decision 2026-07-20, docs/spec/08): a call must not
// cost you your place, signed in or not.

function entry(positionSec: number, updatedAt = 1_000): PlaybackEntry {
  return { positionSec, updatedAt };
}

describe('resumeTarget', () => {
  test('resumes a real position', () => {
    expect(resumeTarget(entry(600), 2400)).toBe(600);
  });

  test('ignores a position with no saved entry', () => {
    expect(resumeTarget(undefined, 2400)).toBeNull();
  });

  test('ignores a barely-started video', () => {
    expect(resumeTarget(entry(MIN_RESUME_SEC - 1), 2400)).toBeNull();
  });

  test('starts over when the last position was near the end', () => {
    expect(resumeTarget(entry(2400 - END_GRACE_SEC + 1), 2400)).toBeNull();
    expect(resumeTarget(entry(2400 - END_GRACE_SEC - 1), 2400)).not.toBeNull();
  });

  test('an unknown duration still resumes (RSS rows carry none)', () => {
    expect(resumeTarget(entry(600), null)).toBe(600);
  });
});

describe('shouldSave', () => {
  test('saves only meaningful, finite positions', () => {
    expect(shouldSave(120)).toBe(true);
    expect(shouldSave(MIN_RESUME_SEC)).toBe(true);
    expect(shouldSave(3)).toBe(false);
    expect(shouldSave(Number.NaN)).toBe(false);
    expect(shouldSave(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('prunePositions', () => {
  test('keeps the most recently touched entries', () => {
    const positions = {
      old: entry(10, 1),
      newer: entry(20, 5),
      newest: entry(30, 9),
    };
    const pruned = prunePositions(positions, 2);
    expect(Object.keys(pruned).sort()).toEqual(['newer', 'newest']);
  });

  test('leaves a small map untouched', () => {
    const positions = { a: entry(10, 1) };
    expect(prunePositions(positions, 100)).toBe(positions);
  });
});

describe('the store', () => {
  beforeEach(() => {
    usePlaybackStore.setState({ positions: {} });
  });

  test('saves a floored position and clears it when finished', () => {
    usePlaybackStore.getState().save('sermon-1', 42.7, 1_000);
    expect(usePlaybackStore.getState().positions['sermon-1']).toEqual({
      positionSec: 42,
      updatedAt: 1_000,
    });
    usePlaybackStore.getState().clear('sermon-1');
    expect(usePlaybackStore.getState().positions['sermon-1']).toBeUndefined();
  });

  test('stays bounded as more sermons are opened', () => {
    for (let i = 0; i < 120; i += 1) {
      usePlaybackStore.getState().save(`sermon-${String(i)}`, 100, i);
    }
    expect(
      Object.keys(usePlaybackStore.getState().positions).length,
    ).toBeLessThanOrEqual(100);
  });
});
