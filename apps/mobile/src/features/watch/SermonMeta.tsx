import { Text, View } from 'react-native';

import { fontFamily, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// Mockup `.goldeye` + `.pl-title` + `.pl-speaker`. Extracted at W3.1 slice 3
// because audio mode draws the same three lines under a different picture, and a
// second copy of them is a second copy to drift.

export interface SermonMetaProps {
  /** The series, or the published date when a message belongs to none. */
  eyebrow: string;
  title: string;
  /** Speaker and length, already joined. */
  meta: string;
}

export function SermonMeta({ eyebrow, title, meta }: SermonMetaProps) {
  const { colors } = useTheme();
  return (
    <View>
      <Text
        style={[
          typeScale.label,
          {
            fontSize: 11,
            letterSpacing: 2,
            color: colors.eye,
            marginTop: spacing.lg,
          },
        ]}
      >
        {eyebrow}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.display.extraBold,
          fontSize: 24,
          letterSpacing: -0.48,
          color: colors.text,
          marginTop: spacing.sm,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 13.5,
          color: colors.muted,
          marginTop: 3,
        }}
      >
        {meta}
      </Text>
    </View>
  );
}
