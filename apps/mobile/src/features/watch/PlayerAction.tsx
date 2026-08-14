import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// Mockup `.pl-act` (W3.1 slice 4): the player's quiet actions, under the mode
// segment. Outlined and transparent, so they sit below the segment in weight
// without disappearing.
//
// What they are NOT is the tile row they replaced. That row gave one shape to a
// mode, a value and a destination; these two are only the last kind, plus Speed,
// which carries its value inline rather than on a reserved third line.

export interface PlayerActionProps {
  label: string;
  /** Drawn after the label in the eyebrow colour (Speed's rate). */
  value?: string;
  glyph: (color: string) => React.ReactNode;
  onPress: () => void;
}

export function PlayerAction({
  label,
  value,
  glyph,
  onPress,
}: PlayerActionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value === undefined ? label : `${label}, ${value}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.control,
        paddingVertical: 13,
        paddingHorizontal: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {glyph(colors.text)}
      {/* A control label: caps at 1.3x and stays on one line (docs/spec/05). */}
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 13.5,
          color: colors.text,
        }}
      >
        {label}
      </Text>
      {value === undefined ? null : (
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 13.5,
            color: colors.eye,
          }}
        >
          {value}
        </Text>
      )}
    </Pressable>
  );
}

/** The row the actions sit in: one or two of them, filling the width. */
export function PlayerActions({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm + 2,
        marginTop: spacing.sm + 2,
      }}
    >
      {children}
    </View>
  );
}
