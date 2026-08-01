import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

/**
 * The mockup's `.rhythm` panel, carrying the awaiting state (docs/spec/16, ADR 0015).
 *
 * A status deserves a status component: this is the dark ink panel with the gold kicker
 * that the app uses for an ongoing fact you live with, rather than a flat card that reads
 * as a notice you already dealt with. It stays on the Profile screen for the whole 48
 * hours, which is why it is not a sheet.
 *
 * THE RING is `conic-gradient(gold 0deg 120deg, rgba(255,255,255,.16) 120deg 360deg)` in
 * the mockup, and React Native has no conic gradient. Drawn instead as an SVG circle with
 * a dashed stroke: one third gold, the rest the same translucent white. Same picture, and
 * it stays a picture rather than a progress claim, because nothing here knows how far
 * through the 48 hours a request is.
 */
export function AwaitingPanel({
  label,
  branchName,
  note,
  ringLabel,
}: {
  /** "Asked to join" */
  label: string;
  branchName: string;
  /** "A leader there usually confirms within 48 hours" */
  note: string;
  /** "48h" */
  ringLabel: string;
}) {
  return (
    <View
      style={{
        marginHorizontal: spacing.lg,
        marginTop: spacing.xl,
        backgroundColor: palette.ink,
        borderRadius: radius.card,
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
          {branchName}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            color: onInk.sub,
            marginTop: 3,
          }}
        >
          {note}
        </Text>
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 52,
          height: 52,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={52} height={52} viewBox="0 0 52 52">
          <Circle
            cx={26}
            cy={26}
            r={23}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={6}
            fill="none"
          />
          {/* A third of the circumference (2πr ≈ 144.5), matching the mockup's 120deg. */}
          <Circle
            cx={26}
            cy={26}
            r={23}
            stroke={palette.gold}
            strokeWidth={6}
            fill="none"
            strokeDasharray="48.2 96.4"
            strokeLinecap="butt"
            transform="rotate(-90 26 26)"
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
          {ringLabel}
        </Text>
      </View>
    </View>
  );
}
