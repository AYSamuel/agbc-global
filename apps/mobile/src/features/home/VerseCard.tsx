import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing, verseCard } from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';
import { shareText, verseShareText } from '@/features/family/share';
import { PICTURE_SHARE_LINKED } from '@/features/share/capture';
import { SharePreviewSheet } from '@/features/share/SharePreviewSheet';
import { track } from '@/lib/analytics';

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
  // native modules it needed. The words themselves now come from features/family/share,
  // which is where the app's other seven share points already composed theirs.
  const [previewOpen, setPreviewOpen] = useState(false);
  const fallbackText = verseShareText(
    verse.text,
    verse.reference,
    verse.translation,
  );

  const share = () => {
    // THE DEV-CLIENT DEGRADE, and the only place it is decided. A client built before
    // W4.15 carries neither native module, so there is no picture to preview and opening
    // the sheet would do nothing but apologise: the button does exactly what it did for a
    // year instead. Recorded as `text_after_failure` rather than `text`, because the
    // member expressed no preference and `text` is reserved for somebody who chose words.
    if (!PICTURE_SHARE_LINKED) {
      void shareText(fallbackText);
      track('content_shared', {
        content_kind: 'verse',
        sent_as: 'text_after_failure',
      });
      return;
    }
    setPreviewOpen(true);
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

      <SharePreviewSheet
        visible={previewOpen}
        content={{
          kind: 'verse',
          text: verse.text,
          reference: verse.reference,
          translation: verse.translation,
        }}
        fallbackText={fallbackText}
        onClose={() => {
          setPreviewOpen(false);
        }}
      />
    </View>
  );
}
