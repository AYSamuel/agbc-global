import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

/**
 * The mockup's `.rhythm` panel: an ink band with a gold kicker, a display-weight
 * line, a quiet note, and an optional ring on the right.
 *
 * A status deserves a status component. This is what the app uses for an ongoing
 * fact you live with (the rhythm strip on Home, a branch request awaiting its
 * 48 hours on Profile) rather than a flat card, which reads as a notice you have
 * already dealt with.
 *
 * THE RING is `conic-gradient(gold 0deg Ndeg, rgba(255,255,255,.16) Ndeg 360deg)`
 * in the mockup, and React Native has no conic gradient. It is drawn as an SVG
 * circle with a dashed stroke: the gold arc, then the same translucent white for
 * the rest.
 */
const RING = 52;
const RING_CENTRE = RING / 2;
const RING_RADIUS = 23;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface StatusPanelRing {
  /** The glyph inside the ring: a streak count, "48h". */
  label: string;
  /** 0..1 of the circle to draw in gold. */
  fraction: number;
}

export interface StatusPanelProps {
  /** Gold uppercase kicker ("Your rhythm"). */
  label: string;
  title: string;
  note: string;
  ring?: StatusPanelRing | null;
  /**
   * One label for the whole panel (docs/spec/05: the strip is grouped and reads
   * as a single phrase, "4 week rhythm, next milestone 12 weeks"). Without it
   * the panel stays three separate texts, which is right where the pieces are
   * independent.
   */
  accessibilityLabel?: string;
}

export function StatusPanel({
  label,
  title,
  note,
  ring = null,
  accessibilityLabel,
}: StatusPanelProps) {
  const { name, colors } = useTheme();
  const grouped = accessibilityLabel !== undefined;
  const gold = Math.max(0, Math.min(1, ring?.fraction ?? 0)) * CIRCUMFERENCE;

  return (
    <View
      accessible={grouped}
      accessibilityLabel={accessibilityLabel}
      style={{
        backgroundColor: palette.ink,
        borderRadius: radius.card,
        // The band is ink in both themes, and in DARK the page behind it is the
        // same ink: on device it stopped reading as a surface at all and became
        // floating text (seen on the phone, 2026-08-08). A hairline gives it its
        // edge back, which is the rule `05` already states for dark ("borders,
        // not shadows, carry separation there"). The border is always present so
        // the box measures identically in both themes; only its colour changes.
        borderWidth: 1,
        borderColor: name === 'dark' ? colors.cardline : 'transparent',
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 10.5,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: palette.gold,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 22,
            color: onInk.text,
            marginTop: 4,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            lineHeight: 17,
            color: onInk.sub,
            marginTop: 3,
          }}
        >
          {note}
        </Text>
      </View>

      {ring ? (
        // The ring repeats the number that is already in the title (and in the
        // group label when there is one), so it is decoration to assistive tech.
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: RING,
            height: RING,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Svg
            width={RING}
            height={RING}
            viewBox={`0 0 ${String(RING)} ${String(RING)}`}
          >
            <Circle
              cx={RING_CENTRE}
              cy={RING_CENTRE}
              r={RING_RADIUS}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={6}
              fill="none"
            />
            <Circle
              cx={RING_CENTRE}
              cy={RING_CENTRE}
              r={RING_RADIUS}
              stroke={palette.gold}
              strokeWidth={6}
              fill="none"
              strokeDasharray={`${String(gold)} ${String(CIRCUMFERENCE - gold)}`}
              strokeLinecap="butt"
              transform={`rotate(-90 ${String(RING_CENTRE)} ${String(RING_CENTRE)})`}
            />
          </Svg>
          <Text
            style={{
              position: 'absolute',
              fontFamily: fontFamily.display.extraBold,
              fontSize: 14,
              color: onInk.text,
            }}
          >
            {ring.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
