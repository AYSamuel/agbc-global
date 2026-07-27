import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// The mockup's .ctext (TESTIMONY-COMPOSE / PRAYER-COMPOSE, frame lines 1148 and
// 1611): a card-surfaced multi-line box, 16px radius, 140px min height, 15.5px
// at 1.55 line height. The composer's own header is the field's visible label,
// so the label here is the accessible name rather than a printed one.
//
// The counter appears only as the ceiling approaches, and the input is NOT
// maxLength-clipped: silently swallowing the end of someone's testimony is worse
// than an honest error at submit (docs/spec/09).

const MIN_HEIGHT = 140;

export interface TextAreaProps extends Omit<TextInputProps, 'style'> {
  /** Accessible name; the screen header carries the visible one. */
  label: string;
  /** Shown under the field; absent hides the slot. */
  error?: string | null;
  /** Server-enforced ceiling (docs/spec/02 CHECK constraints). */
  max: number;
  /** Characters remaining at which the counter appears. */
  counterFrom?: number;
  /** Rendered beside the counter, e.g. "{{count}} characters left". */
  counterLabel?: (remaining: number) => string;
}

export const TextArea = forwardRef<TextInput, TextAreaProps>(function TextArea(
  {
    label,
    error,
    max,
    counterFrom = 100,
    counterLabel,
    value = '',
    ...inputProps
  },
  ref,
) {
  const { colors } = useTheme();
  const remaining = max - value.length;
  const showCounter = counterLabel !== undefined && remaining <= counterFrom;

  return (
    <View>
      <TextInput
        ref={ref}
        value={value}
        multiline
        textAlignVertical="top"
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: error ? palette.red : colors.cardline,
          borderRadius: radius.cardTight,
          padding: spacing.lg,
          fontFamily: fontFamily.body.regular,
          fontSize: 15.5,
          lineHeight: 24,
          color: colors.text,
          minHeight: MIN_HEIGHT,
        }}
        {...inputProps}
      />
      {showCounter ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            color: remaining < 0 ? palette.red : colors.muted,
            marginTop: 6,
            textAlign: 'right',
          }}
        >
          {counterLabel(remaining)}
        </Text>
      ) : null}
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
});
