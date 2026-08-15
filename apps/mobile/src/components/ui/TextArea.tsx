import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// The mockup's .ctext (TESTIMONY-COMPOSE / PRAYER-COMPOSE, frame lines 1148 and
// 1611): a card-surfaced multi-line box, 16px radius, 140px min height, 15.5px
// at 1.55 line height. The composer's own header is the field's visible label,
// so the label here is the accessible name rather than a printed one.
//
// `size="page"` is the mockup's `.npage` (SERMON-NOTES, W3.1 slice 4): the same
// card surface as a taller, quieter page (212px min, 14.5px at ~22.5 line
// height), because the notes editor is a document rather than a form field.
//
// The counter appears only as the ceiling approaches, and the input is NOT
// maxLength-clipped: silently swallowing the end of someone's testimony is worse
// than an honest error at submit (docs/spec/09).

const SIZES = {
  field: {
    minHeight: 140,
    fontSize: 15.5,
    lineHeight: 24,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  page: {
    minHeight: 212,
    fontSize: 14.5,
    lineHeight: 22.5,
    paddingVertical: 15,
    paddingHorizontal: spacing.lg,
  },
} as const;

export interface TextAreaProps extends Omit<TextInputProps, 'style'> {
  /** Accessible name; the screen header carries the visible one. */
  label: string;
  /** Shown under the field; absent hides the slot. */
  error?: string | null;
  /** Server-enforced ceiling (docs/spec/02 CHECK constraints). Absent on the
   * notes page, whose table carries no CHECK (docs/spec/02). */
  max?: number;
  /** Characters remaining at which the counter appears. */
  counterFrom?: number;
  /** Rendered beside the counter, e.g. "{{count}} characters left". */
  counterLabel?: (remaining: number) => string;
  /** `.ctext` (field, default) or `.npage` (page). */
  size?: keyof typeof SIZES;
}

export const TextArea = forwardRef<TextInput, TextAreaProps>(function TextArea(
  {
    label,
    error,
    max,
    counterFrom = 100,
    counterLabel,
    value = '',
    size = 'field',
    ...inputProps
  },
  ref,
) {
  const { colors } = useTheme();
  const dims = SIZES[size];
  const remaining = max === undefined ? Infinity : max - value.length;
  const showCounter =
    counterLabel !== undefined && max !== undefined && remaining <= counterFrom;

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
          paddingVertical: dims.paddingVertical,
          paddingHorizontal: dims.paddingHorizontal,
          fontFamily: fontFamily.body.regular,
          fontSize: dims.fontSize,
          lineHeight: dims.lineHeight,
          color: colors.text,
          minHeight: dims.minHeight,
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
