import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

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

  // "My branch" needs a chosen branch to filter on; with none set it would fire a
  // disabled query and leave the feed skeleton-locked, so it stays unselectable
  // until the guest picks a branch (the golden path always sets one).
  // shrink: only the branch pill gives way when space runs out (its name can be
  // long); "Everywhere" always reads whole (#76).
  const options: {
    key: FamilyScope;
    label: string;
    disabled: boolean;
    shrink: boolean;
  }[] = [
    {
      key: 'everywhere',
      label: t('family:scopeEverywhere'),
      disabled: false,
      shrink: false,
    },
    {
      key: 'branch',
      label: branchName ?? t('family:scopeMyBranch'),
      disabled: branchName === null,
      shrink: true,
    },
  ];

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('family:scopeLabel')}
      // maxWidth bounds the self-sized pill: a long branch name at large text
      // scale grew the track past the screen edge (#76).
      style={{
        flexDirection: 'row',
        alignSelf: 'flex-start',
        maxWidth: '100%',
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
            accessibilityState={{ selected, disabled: option.disabled }}
            accessibilityLabel={option.label}
            disabled={option.disabled}
            onPress={() => {
              onChange(option.key);
            }}
            // Mockup .scopep button (padding 7/15), not a 44px minHeight; hitSlop
            // carries the touch target to the 44px floor.
            hitSlop={{ top: 7, bottom: 7 }}
            style={({ pressed }) => ({
              flexShrink: option.shrink ? 1 : 0,
              paddingVertical: 7,
              paddingHorizontal: spacing.md + 3,
              justifyContent: 'center',
              borderRadius: radius.full,
              backgroundColor: selected ? colors.btnBg : 'transparent',
              opacity: option.disabled ? 0.4 : pressed ? 0.85 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{
                flexShrink: 1,
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
