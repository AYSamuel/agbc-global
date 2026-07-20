import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { hitTarget, radius, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import type { BranchSummary } from './branches-snapshot';

// Selection row per the ONB-2 mockup: initial tile, name (+ HQ badge), city/country,
// radio semantics for assistive tech.
export function BranchRow({
  branch,
  selected,
  onSelect,
}: {
  branch: BranchSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors, name } = useTheme();
  const { t } = useTranslation();
  const activeBorder = name === 'light' ? colors.blue : colors.accent;
  const location = `${branch.city}, ${branch.country}`;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${branch.name}, ${branch.city}, ${branch.country}`}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: hitTarget.preferred,
        padding: spacing.lg,
        borderRadius: radius.cardTight,
        backgroundColor: colors.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? activeBorder : colors.cardline,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.control,
          backgroundColor: colors.util,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[typeScale.cardTitle, { color: colors.text }]}>
          {branch.name.charAt(0)}
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
          <Text style={[typeScale.bodySemiBold, { color: colors.text }]}>
            {branch.name}
          </Text>
          {branch.is_hq ? (
            <View
              style={{
                backgroundColor: colors.accent,
                borderRadius: radius.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: 2,
              }}
            >
              <Text
                style={[typeScale.label, { color: '#14213d', fontSize: 10 }]}
              >
                {t('onboarding.hqBadge')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[typeScale.body, { color: colors.muted }]}>
          {location}
        </Text>
      </View>
    </Pressable>
  );
}
