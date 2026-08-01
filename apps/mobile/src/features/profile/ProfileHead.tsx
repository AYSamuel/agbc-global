import { Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * The mockup's `.profhead`: a 76px initial disc, the member's name, and one quiet line
 * under it.
 *
 * The disc's gradient runs gold-deep to navy (`linear-gradient(135deg,#b98600,#14213d)`),
 * which is the same pairing the dashboard's smaller avatar uses. Fixed in both themes,
 * because it is a brand mark rather than a themed surface.
 */
export function ProfileHead({
  name,
  line,
}: {
  name: string;
  /** "AGBC Glasgow · Member since 2024" */
  line: string;
}) {
  const { colors } = useTheme();
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View
      style={{
        alignItems: 'center',
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.lg - 2,
        paddingBottom: spacing.xs + 2,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 76,
          height: 76,
          borderRadius: radius.full,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        }}
      >
        <GradientFill from={palette.goldDeep} to={palette.navy} />
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 30,
            color: onInk.text,
          }}
        >
          {initial}
        </Text>
      </View>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: fontFamily.display.extraBold,
          fontSize: 22,
          letterSpacing: -0.44,
          color: colors.text,
          textAlign: 'center',
        }}
      >
        {name}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 13.5,
          color: colors.sub,
          marginTop: 3,
          textAlign: 'center',
        }}
      >
        {line}
      </Text>
    </View>
  );
}
