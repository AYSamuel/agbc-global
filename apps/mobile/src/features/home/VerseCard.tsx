import { useTranslation } from 'react-i18next';
import { Pressable, Share, Text, View } from 'react-native';

import { fontFamily, radius, spacing, verseCard } from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';

import type { DailyVerse } from './queries';

// Mockup .verse: a constant cream/gold scripture card in BOTH themes (the
// mockup carries no dark override; see the verseCard tokens). Per docs/spec/07
// phasing, the devotional CTA is deliberately absent until the Store/Library
// pipeline exists to route to (Phase 4) - verse + share only for now.
export function VerseCard({ verse }: { verse: DailyVerse }) {
  const { t } = useTranslation();
  // Composed outside JSX: the i18n lint rule bans literals in markup, and
  // scripture text plus its reference are data, not translatable copy.
  const quoted = `“${verse.text}”`;
  const attribution = `${verse.reference} · ${verse.translation}`;

  const share = () => {
    void Share.share({
      message: `"${verse.text}"\n${verse.reference} · ${verse.translation}`,
    });
  };

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: verseCard.border,
        padding: 17,
        paddingHorizontal: 18,
        overflow: 'hidden',
      }}
    >
      <GradientFill
        direction="diagonal"
        from={verseCard.from}
        to={verseCard.to}
      />
      <Text
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 10.5,
          letterSpacing: 1.47,
          textTransform: 'uppercase',
          color: verseCard.eyebrow,
          marginBottom: 10,
        }}
      >
        {t('home:verseEyebrow')}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.display.bold,
          fontSize: 17,
          lineHeight: 24.65,
          color: verseCard.text,
        }}
      >
        {quoted}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 13,
            color: verseCard.reference,
            flex: 1,
          }}
        >
          {attribution}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('home:shareVerse')}
          onPress={share}
          style={({ pressed }) => ({
            backgroundColor: verseCard.chipBg,
            borderWidth: 1,
            borderColor: verseCard.chipBorder,
            borderRadius: radius.full,
            paddingVertical: 6,
            paddingHorizontal: 15,
            minHeight: 32,
            justifyContent: 'center',
            marginLeft: spacing.sm,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 12,
              color: verseCard.reference,
            }}
          >
            {t('home:share')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
