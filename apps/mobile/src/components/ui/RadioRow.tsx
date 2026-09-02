import { Pressable, Text, View } from 'react-native';

import { fontFamily, hitTarget, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

/**
 * The mockup's `.radiorow`: a radio circle, a title, and a line explaining what choosing
 * it means. Used by the report reasons (W2.6) and, in the mockup, by the account-deletion
 * choice (`14`/W4.5), so it lives in the library rather than inside one sheet.
 *
 * Distinct from `SelectRow`, which is the ONB-2/ONB-3 `.sel` CARD: a tile, a name, and a
 * whole bordered row per option. This is the plain list form, for choices that are
 * sentences rather than things.
 */
export interface RadioRowProps {
  title: string;
  /** `.rd`: what this choice actually means, which is most of why it is the right one. */
  description?: string;
  selected: boolean;
  onSelect: () => void;
  /** The frame's `border-bottom: none` on the final row. */
  last?: boolean;
}

export function RadioRow({
  title,
  description,
  selected,
  onSelect,
  last = false,
}: RadioRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      // The description is part of the choice, not decoration beside it: a reader
      // choosing between four reasons needs to hear which one covers what.
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        minHeight: hitTarget.preferred,
        paddingVertical: spacing.md + 2,
        paddingHorizontal: spacing.lg,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.cardline,
        backgroundColor: pressed ? colors.alt : 'transparent',
      })}
    >
      <View
        // The circle reports nothing of its own: the row above already carries the
        // selected state, and a second announcement would say it twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 22,
          height: 22,
          borderRadius: radius.full,
          borderWidth: 2,
          borderColor: selected ? colors.btnBg : colors.controlline,
          marginTop: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: radius.full,
              backgroundColor: colors.btnBg,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: fontFamily.body.semiBold,
            fontSize: 14,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        {description ? (
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12,
              lineHeight: 16.8,
              color: colors.muted,
              marginTop: 3,
            }}
          >
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
