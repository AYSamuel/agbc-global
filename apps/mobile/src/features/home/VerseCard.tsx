import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing, verseCard } from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';
import { verseShareText } from '@/features/family/share';
import { useShareSheet } from '@/features/share/useShareSheet';

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

  // THE BRANDED-PICTURE SHARE, which docs/spec/07 line 54 has promised since it was
  // written and this header carried as a deferral from W1.2 until W4.15 landed the two
  // native modules it needed. The words themselves come from features/family/share,
  // where the app's other share points already composed theirs; the sheet, and the
  // dev-client degrade to those words, are the hook's (W4.15 slice 2).
  const shareSheet = useShareSheet();
  const share = () => {
    shareSheet.open(
      {
        kind: 'verse',
        text: verse.text,
        reference: verse.reference,
        translation: verse.translation,
      },
      verseShareText(verse.text, verse.reference, verse.translation),
    );
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
          // The chip is the frame's 32dp; slop carries it to the 44 floor
          // rather than growing the chip and breaking the frame (W4.7 slice 5).
          hitSlop={{ top: 6, bottom: 6 }}
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

      {shareSheet.element}
    </View>
  );
}
