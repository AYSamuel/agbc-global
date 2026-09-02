import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  onInk,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { ActionPill, CheckIcon, HeartIcon, UndoIcon } from '@/components/ui';
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
        <HeartIcon size={icon.sm} color={colors.eye} />
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
        <CheckIcon size={icon.sm} color={palette.green} />
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
        <CheckIcon size={icon.xs} color={onInk.text} />
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
  onUndo,
}: {
  prayer: PrayerFeedItem;
  branchName: string | null;
  commitment?: CommitmentState;
  onPress: () => void;
  onCommit: () => void;
  /** Present only while the 5s way back is open (docs/spec/09 undo window). */
  onUndo?: () => void;
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
              size={icon.md}
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
        {/* Mockup .prayundo: while the way back is open it stands where the
            reminder line will be, so the row never carries two secondary things
            at once. When the window closes, the reminder takes its place. */}
        {onUndo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('family:undoCommitment')}
            onPress={onUndo}
            // A 12px icon beside 11.5px bold text is a ~15dp row, so 10 of
            // slop left the target 35dp: under the 44 floor (`hitTarget.min`).
            // 15 + 15 + 15 = 45. Same measurement pass as TestimonyCard's Share
            // (W4.7 slice 5); this one is easy to miss because the control only
            // exists during the 5s undo window.
            hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              flexShrink: 1,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <UndoIcon size={icon.xs} color={colors.blue} strokeWidth={2} />
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 11.5,
                color: colors.blue,
              }}
            >
              {t('family:undo')}
            </Text>
          </Pressable>
        ) : commitment === 'committed' ? (
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
