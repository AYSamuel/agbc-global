import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  hitTarget,
  onInk,
  palette,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';
import { branchInitial } from '@/features/onboarding/branchInitial';
import { useTheme } from '@/theme';

// BRANCHES row (mockup .sel without the radio circle: this list navigates, it
// does not select). Same tile/type recipe as SelectRow so the two rows read as
// one family; kept separate because the radio semantics there are structural.
export interface BranchListRowProps {
  name: string;
  city: string;
  country: string;
  hqBadge: string | null;
  onPress: () => void;
}

export function BranchListRow({
  name,
  city,
  country,
  hqBadge,
  onPress,
}: BranchListRowProps) {
  const { colors } = useTheme();
  const cityLine = `${city}, ${country}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${city}, ${country}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: hitTarget.preferred,
        padding: spacing.lg,
        borderRadius: radius.cardTight,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.control,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GradientFill from={palette.blue} to={palette.navy} />
        <Text
          style={{
            fontFamily: fontFamily.display.bold,
            fontSize: 17,
            color: onInk.text,
          }}
        >
          {branchInitial(name)}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              typeScale.bodySemiBold,
              { color: colors.text, flexShrink: 1 },
            ]}
          >
            {name}
          </Text>
          {hqBadge ? (
            <Text
              style={{
                fontFamily: fontFamily.body.extraBold,
                fontSize: 9.5,
                letterSpacing: 1,
                color: palette.navy,
                backgroundColor: palette.gold,
                borderRadius: radius.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: 3,
                overflow: 'hidden',
              }}
            >
              {hqBadge}
            </Text>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={[typeScale.body, { fontSize: 12.5, color: colors.muted }]}
        >
          {cityLine}
        </Text>
      </View>
    </Pressable>
  );
}
