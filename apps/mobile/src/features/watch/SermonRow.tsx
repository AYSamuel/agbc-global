import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';
import { useTheme } from '@/theme';

import { durationMinutes, joinMeta } from './format';
import type { SermonSummary } from './queries';

// Mockup .rrow: 120x72 thumbnail (>= the 120x70 YouTube ToS floor, docs/spec/08)
// with a play chip, title at 14.5/700, muted meta line.
export function SermonRow({
  sermon,
  onPress,
}: {
  sermon: SermonSummary;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const minutes = durationMinutes(sermon.duration_sec);
  const meta = joinMeta([
    sermon.speaker || null,
    minutes === null ? null : t('watch:minutes', { count: minutes }),
  ]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={joinMeta([sermon.title, meta])}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'center',
        paddingVertical: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 120,
          height: 72,
          borderRadius: radius.control,
          overflow: 'hidden',
          flex: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GradientFill from={palette.navy} to={palette.blue} />
        {sermon.thumbnail_url ? (
          <Image
            source={{ uri: sermon.thumbnail_url }}
            style={{ position: 'absolute', width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />
        ) : null}
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.full,
            backgroundColor: 'rgba(255,255,255,0.9)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Mockup .play: a CSS triangle; borders draw it identically in RN. */}
          <View
            style={{
              marginLeft: 2,
              borderLeftWidth: 8,
              borderTopWidth: 5,
              borderBottomWidth: 5,
              borderLeftColor: palette.navy,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
            }}
          />
        </View>
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 14.5,
            lineHeight: 18,
            color: colors.text,
          }}
        >
          {sermon.title}
        </Text>
        {meta ? (
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12,
              color: colors.muted,
            }}
          >
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
