import {
  formatClock,
  formatRemaining,
  formatSpeedValue,
  nextSpeed,
  preferredPosition,
  scrubFraction,
  secondsAtFraction,
  seekTarget,
  shouldSeekAfterTouch,
  skipTarget,
  SPEEDS,
} from '../audio';

// The audio slice's decisions, with no player and no renderer in the way
// (docs/spec/08, W3.1 slice 3; seeking and 2x from W4.9 slice 2).

describe('nextSpeed', () => {
  test('cycles the four speeds and wraps', () => {
    expect(SPEEDS).toEqual([1, 1.25, 1.5, 2]);
    expect(nextSpeed(1)).toBe(1.25);
    expect(nextSpeed(1.25)).toBe(1.5);
    expect(nextSpeed(1.5)).toBe(2);
    expect(nextSpeed(2)).toBe(1);
  });

  test('a persisted speed this build no longer offers falls back to 1x', () => {
    // A member could carry 3x forward from a build where it existed; the tile
    // must not hand `undefined` to the player.
    expect(nextSpeed(3 as (typeof SPEEDS)[number])).toBe(1);
  });
});

describe('seekTarget', () => {
  test('lands where it is asked, inside the message', () => {
    expect(seekTarget(1140, 2280)).toBe(1140);
  });

  test('clamps at both ends', () => {
    expect(seekTarget(-30, 2280)).toBe(0);
    expect(seekTarget(9999, 2280)).toBe(2280);
  });

  test('with no duration yet, forward is still allowed and back still clamps', () => {
    expect(seekTarget(45, 0)).toBe(45);
    expect(seekTarget(-5, 0)).toBe(0);
    expect(seekTarget(Number.NaN, 2280)).toBe(0);
  });
});

describe('shouldSeekAfterTouch (what a finger leaving the bar means)', () => {
  test('a tap, a finished drag and a cancelled drag all seek', () => {
    // A tap: the pan never activated and the finger did not move.
    expect(
      shouldSeekAfterTouch({
        activated: false,
        success: false,
        translationY: 0,
      }),
    ).toBe(true);
    // A finished drag.
    expect(
      shouldSeekAfterTouch({ activated: true, success: true, translationY: 0 }),
    ).toBe(true);
    // A drag the system took away, finger well off the bar by then: Android's
    // own seek bar commits on cancel, and so does this.
    expect(
      shouldSeekAfterTouch({
        activated: true,
        success: false,
        translationY: 120,
      }),
    ).toBe(true);
  });

  test('a scroll that happened to start on the bar does not', () => {
    expect(
      shouldSeekAfterTouch({
        activated: false,
        success: false,
        translationY: 40,
      }),
    ).toBe(false);
    expect(
      shouldSeekAfterTouch({
        activated: false,
        success: false,
        translationY: -40,
      }),
    ).toBe(false);
    // Under the threshold is finger wobble, not intent.
    expect(
      shouldSeekAfterTouch({
        activated: false,
        success: false,
        translationY: 5,
      }),
    ).toBe(true);
  });
});

describe('secondsAtFraction (where a finger on the bar lands)', () => {
  test('maps the bar to the message', () => {
    expect(secondsAtFraction(0.5, 2280)).toBe(1140);
    expect(secondsAtFraction(0.1, 2280)).toBe(228);
  });

  test('never leaves the message, and is 0 with no duration', () => {
    expect(secondsAtFraction(-0.2, 2280)).toBe(0);
    expect(secondsAtFraction(1.7, 2280)).toBe(2280);
    expect(secondsAtFraction(0.5, 0)).toBe(0);
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
