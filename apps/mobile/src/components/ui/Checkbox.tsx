import { Text, View, Pressable } from 'react-native';

import { fontFamily, hitTarget, palette, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { CheckIcon } from './icons';

// The mockup's .checkrow / .cbox (CONSENT frame line 1169, PRAYER-COMPOSE line
// 1612, AUTH-3's 16+ row): a 24px box with a 7px radius that fills with the
// button colour when checked, and a 14px semibold label beside it.
//
// Promoted out of ProfileStep.tsx, where this was hand-rolled for AUTH-3 (the
// frontend standard's component rule: the second screen that needs a widget is
// the one that proves it belongs in the library). The whole row is the target,
// and it is at least 44px tall however short the label is.

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Overrides the label as the accessible name when the label is decorative. */
  accessibilityLabel?: string;
  /** Shown under the row in a polite live region; absent hides the slot. */
  error?: string | null;
}

export function Checkbox({
  checked,
  onChange,
  label,
  accessibilityLabel,
  error,
}: CheckboxProps) {
  const { colors } = useTheme();
  return (
    <View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={() => {
          onChange(!checked);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: hitTarget.min,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: checked ? colors.btnBg : colors.cardline,
            backgroundColor: checked ? colors.btnBg : colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked ? (
            <CheckIcon size={14} color={colors.btnText} strokeWidth={3} />
          ) : null}
        </View>
        <Text
          style={{
            flex: 1,
            fontFamily: fontFamily.body.semiBold,
            fontSize: 14,
            color: colors.text,
          }}
        >
          {label}
        </Text>
      </Pressable>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            color: palette.red,
            marginTop: 4,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
