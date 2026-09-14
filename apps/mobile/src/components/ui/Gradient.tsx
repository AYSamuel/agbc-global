import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

// The mockup expresses surfaces as CSS linear-gradient(); RN has no native gradient,
// and expo-linear-gradient is a native module our dev client was not built with, so
// this renders them through react-native-svg (already in the build for the map).
// Fills its parent absolutely: the parent supplies size, borderRadius + overflow.

export type GradientDirection = 'vertical' | 'diagonal';

const DIRECTIONS: Record<
  GradientDirection,
  { x1: string; y1: string; x2: string; y2: string }
> = {
  // CSS 180deg (scrims: light top, heavy bottom).
  vertical: { x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
  // CSS 135deg (tiles, avatars: top-left to bottom-right).
  diagonal: { x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
};

/** One stop of a `stops` gradient: a CSS-style offset, a hex colour, and its alpha. */
export interface GradientStop {
  offset: string;
  color: string;
  opacity?: number;
}

export interface GradientFillProps {
  from: string;
  to: string;
  direction?: GradientDirection;
  /**
   * A CSS `linear-gradient` angle in degrees (0 = to top, 90 = to right, 180 = to
   * bottom), for the surfaces the mockup draws at an angle neither named direction
   * matches. Added at W4.15 slice 2 for the share cards' ink (150deg) and photo (155deg)
   * grounds; `direction` is ignored when this is given.
   */
  angle?: number;
  /**
   * More than two stops (W4.15 slice 2: the photo card's scrim has three, 30% at the
   * top, 62% at 42% and 94% at the foot). When given, `from`/`to` and the two opacity
   * props are ignored; they stay required so every existing call site is untouched.
   */
  stops?: GradientStop[];
  /** Stop opacities for rgba-style scrims; the color props stay plain hex. */
  fromOpacity?: number;
  toOpacity?: number;
}

/**
 * A CSS angle as an SVG gradient vector across the unit box. CSS measures from "to top"
 * clockwise, so the direction is (sin θ, -cos θ), laid through the centre. (CSS also
 * stretches the line to the corners; for the near-square surfaces this draws, the
 * centre-through vector is within a hair of that and the far simpler expression.)
 */
function vectorForAngle(angle: number) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians) / 2;
  const dy = -Math.cos(radians) / 2;
  const pct = (v: number) => `${String(Math.round((0.5 + v) * 1000) / 10)}%`;
  return { x1: pct(-dx), y1: pct(-dy), x2: pct(dx), y2: pct(dy) };
}

export function GradientFill({
  from,
  to,
  direction = 'diagonal',
  angle,
  stops,
  fromOpacity = 1,
  toOpacity = 1,
}: GradientFillProps) {
  const vector =
    angle === undefined ? DIRECTIONS[direction] : vectorForAngle(angle);
  // Unique per instance: react-native-svg registers gradient ids globally, so a
  // shared "fill" id lets one gradient's def hijack another's (found 2026-07-20
  // when MediaHero's opaque bg def painted over its scrim + thumbnail).
  // Sanitized: useId emits ":r1:"-style ids, and colons break SVG url(#...)
  // references (an unresolved fill can paint solid black).
  const id = `grad${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={id} {...vector}>
          {(
            stops ?? [
              { offset: '0%', color: from, opacity: fromOpacity },
              { offset: '100%', color: to, opacity: toOpacity },
            ]
          ).map((stop) => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity ?? 1}
            />
          ))}
        </SvgLinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
