import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { ActionPill, CheckIcon, HeartIcon } from '@/components/ui';
import { useTheme } from '@/theme';

import { joinMeta } from './format';
import type { PrayerFeedItem } from './queries';
import { useRelativeAgeLabel } from './useRelativeAgeLabel';

// Mockup .prayer: same card shell as .testi. .meta is 12/600 muted, .body 15/1.5,
// .praystats a 16px-gap row of two counts, .acts the commitment pill.
const CARD_PADDING = 18;
const BODY_SIZE = 15;

/**
 * The member's own state on a request. Read-only in W1.5 (there is no signed-in
 * member yet), so it is always 'none' today; the states exist because the card is
 * what W2.4 wires the real two-step commitment into, and building the card blind
 * to them would mean rewriting it.
 */
export type CommitmentState = 'none' | 'committed' | 'prayed';

function PrayCounts({ prayer }: { prayer: PrayerFeedItem }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.lg,
        marginTop: spacing.md,
        flexWrap: 'wrap',
      }}
    >
      {/* .praystats .pi.praying is gold-toned, .pi.prayed green: the two counts
          are deliberately different colors so the split reads at a glance. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <HeartIcon size={13} color={colors.eye} />
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 12,
            color: colors.eye,
          }}
        >
          {t('family:prayingCount', { count: prayer.praying_count })}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <CheckIcon size={13} color={palette.green} />
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 12,
            color: palette.green,
          }}
        >
          {t('family:prayedCount', { count: prayer.prayed_count })}
        </Text>
      </View>
    </View>
  );
}

export function AnsweredPrayerCard({
  prayer,
  onPress,
}: {
  prayer: PrayerFeedItem;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  // Mockup .answered: a green-washed card with an uppercase ANSWERED tag. This is
  // the celebratory beat of the loop (09), so it gets its own treatment rather
  // than a badge bolted onto the normal card.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={joinMeta([t('family:answeredTag'), prayer.body])}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: tonal.greenCard.bg,
        borderWidth: 1,
        borderColor: tonal.greenCard.border,
        borderRadius: radius.card,
        // Mockup .answered: padding 16px 18px (not the 12 the other cards use).
        paddingVertical: spacing.lg,
        paddingHorizontal: CARD_PADDING,
        marginBottom: spacing.md,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          backgroundColor: palette.green,
          borderRadius: radius.full,
          paddingVertical: 4,
          paddingHorizontal: 11,
        }}
      >
        <CheckIcon size={12} color={onInk.text} />
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 10.5,
            letterSpacing: 0.84,
            color: onInk.text,
          }}
        >
          {t('family:answeredTag').toUpperCase()}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 14.5,
          lineHeight: 14.5 * 1.45,
          color: colors.text,
          marginTop: 9,
        }}
      >
        {prayer.body}
      </Text>
    </Pressable>
  );
}

export function PrayerCard({
  prayer,
  branchName,
  commitment = 'none',
  onPress,
  onCommit,
}: {
  prayer: PrayerFeedItem;
  branchName: string | null;
  commitment?: CommitmentState;
  onPress: () => void;
  onCommit: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const age = useRelativeAgeLabel(prayer.created_at);
  // Anonymity is already enforced in the data: author_name is null because the
  // server never sent one. This is presentation of a decision, not the decision.
  const name = prayer.author_name ?? t('family:aMember');
  const meta = joinMeta([name, branchName, age]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={joinMeta([meta, prayer.body])}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.card,
        padding: CARD_PADDING,
        marginBottom: spacing.md,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: fontFamily.body.semiBold,
          fontSize: 12,
          color: colors.muted,
          marginBottom: 8,
        }}
      >
        {meta}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: BODY_SIZE,
          lineHeight: BODY_SIZE * 1.5,
          color: colors.text,
        }}
      >
        {prayer.body}
      </Text>

      <PrayCounts prayer={prayer} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          marginTop: spacing.md,
          flexWrap: 'wrap',
        }}
      >
        {/* Two-step commitment (09): "I will pray" is a forward promise, and only
            after committing does the pill become "I prayed". A one-tap past-tense
            "I prayed" is exactly what the design refuses. */}
        <ActionPill
          label={
            commitment === 'none'
              ? t('family:iWillPray')
              : commitment === 'committed'
                ? t('family:iPrayed')
                : t('family:youPrayed')
          }
          tone={
            commitment === 'none'
              ? 'neutral'
              : commitment === 'committed'
                ? 'goldSoft'
                : 'green'
          }
          onPress={commitment === 'prayed' ? undefined : onCommit}
          icon={
            <HeartIcon
              size={15}
              color={
                commitment === 'none'
                  ? colors.sub
                  : commitment === 'committed'
                    ? colors.eye
                    : palette.green
              }
            />
          }
        />
        {commitment === 'committed' ? (
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 11.5,
              color: colors.eye,
              flexShrink: 1,
            }}
          >
            {t('family:willRemindYou')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
