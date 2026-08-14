import {
  formatClock,
  formatRemaining,
  formatSpeedValue,
  nextSpeed,
  preferredPosition,
  scrubFraction,
  skipTarget,
  SPEEDS,
} from '../audio';

// The audio slice's decisions, with no player and no renderer in the way
// (docs/spec/08, W3.1 slice 3).

describe('nextSpeed', () => {
  test('cycles the three speeds and wraps', () => {
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(1.25)).toBe(1.5);
    expect(nextSpeed(1.5)).toBe(1);
  });

  test('a persisted speed this build no longer offers falls back to 1x', () => {
    // A member could carry 2x forward from a build where it existed; the tile
    // must not hand `undefined` to the player.
    expect(nextSpeed(2 as (typeof SPEEDS)[number])).toBe(1);
  });
});

describe('formatClock', () => {
  test('writes media time the way the frame does', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(80)).toBe('1:20');
    expect(formatClock(860)).toBe('14:20');
  });

  test('pads the minutes once an hour is in play', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(3675)).toBe('1:01:15');
  });

  test('a player that has not reported yet reads 0:00, never NaN', () => {
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('formatRemaining', () => {
  test('counts down from a known duration', () => {
    expect(formatRemaining(860, 2280)).toBe('-23:40');
  });

  test('is empty while the duration is unknown, never -0:00', () => {
    // A stream reports 0 until its header is read, and "-0:00" would tell the
    // member the message is over.
    expect(formatRemaining(12, 0)).toBe('');
    expect(formatRemaining(12, Number.NaN)).toBe('');
  });

  test('never goes negative past the end', () => {
    expect(formatRemaining(2300, 2280)).toBe('-0:00');
  });
});

describe('skipTarget', () => {
  test('moves by the delta', () => {
    expect(skipTarget(100, 15, 2280)).toBe(115);
    expect(skipTarget(100, -15, 2280)).toBe(85);
  });

  test('clamps at both ends', () => {
    expect(skipTarget(5, -15, 2280)).toBe(0);
    expect(skipTarget(2275, 15, 2280)).toBe(2280);
  });

  test('with no duration yet, forward is still allowed and back still clamps', () => {
    expect(skipTarget(30, 15, 0)).toBe(45);
    expect(skipTarget(5, -15, 0)).toBe(0);
  });
});

describe('scrubFraction', () => {
  test('is the played proportion', () => {
    expect(scrubFraction(570, 2280)).toBeCloseTo(0.25);
  });

  test('is 0 with no duration, and never leaves 0..1', () => {
    expect(scrubFraction(120, 0)).toBe(0);
    expect(scrubFraction(-5, 2280)).toBe(0);
    expect(scrubFraction(9999, 2280)).toBe(1);
  });
});

describe('formatSpeedValue', () => {
  test('localizes the decimal', () => {
    expect(formatSpeedValue(1.25, 'en-GB')).toBe('1.25');
    expect(formatSpeedValue(1.25, 'de-DE')).toBe('1,25');
    expect(formatSpeedValue(1, 'en-GB')).toBe('1');
  });
});

describe('preferredPosition (the two resume layers)', () => {
  const local = { positionSec: 1200, updatedAt: 2_000 };
  const server = { positionSec: 300, updatedAt: 1_000 };

  test('either side alone is the answer', () => {
    expect(preferredPosition(local, undefined)).toBe(local);
    expect(preferredPosition(undefined, server)).toBe(server);
    expect(preferredPosition(undefined, undefined)).toBeUndefined();
  });

  test('the newer write wins, so a stale server row cannot rewind a listener', () => {
    // The flight case: the local layer kept saving while every server write
    // failed. Reading the server blindly would send the member back 15 minutes.
    expect(preferredPosition(local, server)).toBe(local);
  });

  test('and the other device wins when IT is the newer one', () => {
    const fromTablet = { positionSec: 1800, updatedAt: 9_000 };
    expect(preferredPosition(local, fromTablet)).toBe(fromTablet);
  });
});
