import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// The mockup's .field / .lab / .inp trio (AUTH-1/AUTH-3): uppercase label,
// 52px input on card, inline error in a polite live region. Promoted from the
// CONTACT form's inline pattern per the frontend standard's component rule;
// CONTACT migrates onto it in a follow-up, not this slice (scope discipline).

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Shown under the input; absent hides the slot. */
  error?: string | null;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField({ label, error, ...inputProps }, ref) {
    const { colors } = useTheme();
    return (
      <View style={{ marginBottom: 14 }}>
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 12,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: colors.muted,
            marginBottom: 7,
          }}
        >
          {label}
        </Text>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.controlline,
            borderRadius: radius.button,
            paddingHorizontal: spacing.lg,
            fontFamily: fontFamily.body.regular,
            fontSize: 15.5,
            color: colors.text,
            minHeight: 52,
          }}
          {...inputProps}
        />
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12.5,
              color: palette.red,
              marginTop: 5,
            }}
          >
            {error}
          </Text>
        ) : null}
      </View>
    );
  },
);
