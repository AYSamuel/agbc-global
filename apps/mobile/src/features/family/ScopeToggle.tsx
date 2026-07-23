import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, hitTarget, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import type { FamilyScope } from './queries';

// Mockup .scopep: a pill-shaped track on --alt with the active option filled in
// btnBg/btnText. Deliberately NOT SegmentedControl: that primitive is the .seg
// section switcher (a squared, card-raised track) and the mockup uses both on this
// screen at once, one above the other. Making them the same component would make
// the screen read as two identical controls stacked.
export function ScopeToggle({
  value,
  onChange,
  branchName,
}: {
  value: FamilyScope;
  onChange: (scope: FamilyScope) => void;
  /** null when the guest has not chosen a branch: the option then reads
   * "My branch" generically rather than naming a branch they never picked. */
  branchName: string | null;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const options: { key: FamilyScope; label: string }[] = [
    { key: 'everywhere', label: t('family:scopeEverywhere') },
    { key: 'branch', label: branchName ?? t('family:scopeMyBranch') },
  ];

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('family:scopeLabel')}
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        gap: 3,
        backgroundColor: colors.alt,
        borderRadius: radius.full,
        padding: 3,
      }}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              onChange(option.key);
            }}
            style={({ pressed }) => ({
              minHeight: hitTarget.min,
              justifyContent: 'center',
              paddingHorizontal: spacing.md + 3,
              borderRadius: radius.full,
              backgroundColor: selected ? colors.btnBg : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 12,
                color: selected ? colors.btnText : colors.muted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
