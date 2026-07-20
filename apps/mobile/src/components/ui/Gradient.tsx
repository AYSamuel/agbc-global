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

export interface GradientFillProps {
  from: string;
  to: string;
  direction?: GradientDirection;
  /** Stop opacities for rgba-style scrims; the color props stay plain hex. */
  fromOpacity?: number;
  toOpacity?: number;
}

export function GradientFill({
  from,
  to,
  direction = 'diagonal',
  fromOpacity = 1,
  toOpacity = 1,
}: GradientFillProps) {
  const vector = DIRECTIONS[direction];
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
          <Stop offset="0%" stopColor={from} stopOpacity={fromOpacity} />
          <Stop offset="100%" stopColor={to} stopOpacity={toOpacity} />
        </SvgLinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
