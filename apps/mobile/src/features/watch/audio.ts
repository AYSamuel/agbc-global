// The audio half of SERMON (docs/spec/08, W3.1 slice 3): every decision that can
// actually go wrong (what resumes, where a skip lands, which stored position
// wins), with no imports at all. The session call that needs the native module
// lives next door in `audioSession.ts`, so these stay testable, and importable
// from the playback store, without a player attached.

/**
 * 08's speed choices. A cycle, not a menu: four values do not earn a sheet.
 *
 * 2x is the ceiling, and the reason is native (W4.9 slice 2, decided with Ayo
 * 2026-09-06): the installed expo-audio clamps the rate on Android,
 * `AudioPlayer.kt:184`, `rate.coerceIn(0.1f, 2.0f)`, while iOS hands it to
 * AVPlayer unclamped. 3x would need a patched native module and a rebuild for a
 * control that would then behave differently per platform. Revisit if expo-audio
 * lifts the clamp; check that line, not the changelog.
 */
export const SPEEDS = [1, 1.25, 1.5, 2] as const;
export type PlaybackSpeed = (typeof SPEEDS)[number];

/** 08's ±15s pair. */
export const SKIP_SEC = 15;

/** Signed playback URLs get 24 hours (the posture decision, docs/spec/08). */
export const AUDIO_URL_TTL_SEC = 60 * 60 * 24;

export function nextSpeed(current: PlaybackSpeed): PlaybackSpeed {
  const index = SPEEDS.indexOf(current);
  // A stored value from a future build that no longer exists in SPEEDS lands at
  // -1, and (-1 + 1) % 4 = 0, so an unknown speed falls back to 1x rather than
  // to undefined.
  return SPEEDS[(index + 1) % SPEEDS.length] ?? 1;
}

/**
 * Elapsed time as the frame writes it: `14:20`, and `1:02:15` once an hour is in
 * play. Not `Intl.NumberFormat`: a clock is not a localized number, and every
 * locale we ship writes media time this way.
 */
export function formatClock(seconds: number): string {
  const safe =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${String(hours)}:` : ''}${mm}:${String(secs).padStart(2, '0')}`;
}

/**
 * The frame's right-hand label: `-23:40`. Empty while the duration is unknown,
 * which is a real state (a stream reports 0 until its header is read) and must
 * not render as `-0:00`, a number that says something false.
 */
export function formatRemaining(
  currentSec: number,
  durationSec: number,
): string {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return '';
  const left = Math.max(0, durationSec - Math.max(0, currentSec));
  return `-${formatClock(left)}`;
}

/**
 * Where an absolute seek lands (W4.9 slice 2: the bar is a seek control), clamped
 * so neither end can overshoot. The ±15s pair below is this with a delta.
 */
export function seekTarget(sec: number, durationSec: number): number {
  const target = Number.isFinite(sec) ? sec : 0;
  const ceiling =
    Number.isFinite(durationSec) && durationSec > 0 ? durationSec : target;
  // Ceiling first, THEN zero. The other order seeks to a negative time when the
  // duration is still unknown, because the ceiling is the (negative) target
  // itself: a back-15 in the opening seconds of a stream that has not reported
  // its length yet.
  return Math.max(0, Math.min(target, ceiling));
}

/** Where a ±15s tap lands, clamped so neither end can overshoot. */
export function skipTarget(
  currentSec: number,
  deltaSec: number,
  durationSec: number,
): number {
  return seekTarget(
    (Number.isFinite(currentSec) ? currentSec : 0) + deltaSec,
    durationSec,
  );
}

/**
 * Where a finger on the bar lands, in seconds: the inverse of `scrubFraction`.
 * Whole seconds, because that is what the clock shows and what the player is
 * asked for; 0 while the duration is unknown, when there is nothing to land in.
 */
export function secondsAtFraction(
  fraction: number,
  durationSec: number,
): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, fraction)) * durationSec);
}

/**
 * The number half of the speed tile's value, localized (de writes 1,25). The
 * trailing multiplier sign is the translators', in `watch:speedValue`.
 */
export function formatSpeedValue(speed: PlaybackSpeed, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    speed,
  );
}

/** 0..1 for the scrub bar; 0 while the duration is unknown. */
export function scrubFraction(currentSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, currentSec / durationSec));
}

/**
 * Whether a finger leaving the seek bar should seek at all (W4.9 slice 2).
 *
 * Yes for a tap (a pan that never activated and did not move), a finished drag,
 * and a drag the system took away (a call, the shade): that last one is what
 * Android's own seek bar does on cancel, because a member who dragged to the
 * 30th minute meant the 30th minute. No for the one case that was never a seek:
 * a pan that never activated because the finger moved VERTICALLY, which is a
 * scroll that happened to start on the bar, and a seek to wherever it first
 * touched would be a surprise.
 */
export function shouldSeekAfterTouch(touch: {
  /** The pan reached its active state, so the finger moved along the bar. */
  activated: boolean;
  /** The gesture ended normally rather than failing or being cancelled. */
  success: boolean;
  /** How far the finger travelled vertically, in points. */
  translationY: number;
}): boolean {
  if (touch.success || touch.activated) return true;
  return Math.abs(touch.translationY) <= SCROLL_INTENT_POINTS;
}

/** A finger that moved this far vertically without activating was scrolling. */
export const SCROLL_INTENT_POINTS = 8;

export interface PositionSample {
  positionSec: number;
  /** Epoch ms. Comparable across the device store and the server row. */
  updatedAt: number;
}

/**
 * Which stored position to resume from.
 *
 * `08` says "seek to the server position when signed in, else the local one".
 * Taken literally that rewinds a real member: listen through a flight with no
 * connection (the local layer saves, the server writes all fail), land, reopen,
 * and the server hands back the position from before takeoff. The layers are the
 * same fact written twice, so the honest rule is the newer wins, which satisfies
 * the intent of `08` (the position follows you across devices) in every case
 * where the two disagree because you moved devices. `08` is synced to say so.
 */
export function preferredPosition(
  local: PositionSample | undefined,
  server: PositionSample | undefined,
): PositionSample | undefined {
  if (!local) return server;
  if (!server) return local;
  return server.updatedAt > local.updatedAt ? server : local;
}
