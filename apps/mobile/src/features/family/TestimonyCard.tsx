import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { ActionPill, GradientFill } from '@/components/ui';
import { useTheme } from '@/theme';

import { initials, joinMeta } from './format';
import type { TestimonyFeedItem } from './queries';
import { useRelativeAgeLabel } from './useRelativeAgeLabel';

// Mockup .testi: card surface, 1px border, 18px radius, 18px padding, 12px gutter
// below. .who is a 36px gradient avatar + name at 14/700 + meta at 11.5 muted.
// .body is 15px at 1.5 line height. .acts sits 12px under the body.
const CARD_PADDING = 18;
const AVATAR = 36;
const BODY_SIZE = 15;

export function GloryPill({
  count,
  reacted = false,
  onPress,
}: {
  count: number;
  reacted?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <ActionPill
      label={t('family:gloryCount', { count })}
      tone={reacted ? 'gold' : 'neutral'}
      selected={reacted}
      onPress={onPress}
      icon={<Text style={{ fontSize: 12.5, color: colors.accent }}>{'✦'}</Text>}
    />
  );
}

export function TestimonyCard({
  testimony,
  branchName,
  onPress,
  onGlory,
  onShare,
}: {
  testimony: TestimonyFeedItem;
  branchName: string | null;
  onPress: () => void;
  onGlory: () => void;
  onShare: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const age = useRelativeAgeLabel(testimony.created_at);
  const name = testimony.author_name ?? t('family:aMember');
  const meta = joinMeta([branchName, age]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={joinMeta([name, meta, testimony.body])}
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 10,
        }}
      >
        <View
          style={{
            width: AVATAR,
            height: AVATAR,
            borderRadius: radius.full,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Mockup .av: goldDeep-to-navy gradient behind the initials. */}
          <GradientFill from={palette.goldDeep} to={palette.navy} />
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 13,
              color: onInk.text,
            }}
          >
            {initials(testimony.author_name) || '✦'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 14,
              color: colors.text,
            }}
          >
            {name}
          </Text>
          {meta ? (
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 11.5,
                color: colors.muted,
                marginTop: 1,
              }}
            >
              {meta}
            </Text>
          ) : null}
        </View>
      </View>

      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: BODY_SIZE,
          lineHeight: BODY_SIZE * 1.5,
          color: colors.text,
        }}
      >
        {testimony.body}
      </Text>

      {/* The ribbon degrades to a static label once the origin prayer stops being
          publicly visible; the server decides by returning a null id (09). Here it
          is always the label: the tappable version lives on TESTIMONY-DETAIL. */}
      {testimony.origin_prayer_id === null ? null : (
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 11.5,
            color: colors.eye,
            marginTop: 10,
          }}
        >
          {t('family:bornFromPrayer')}
        </Text>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          marginTop: spacing.md,
        }}
      >
        <GloryPill count={testimony.glory_count} onPress={onGlory} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('family:share')}
          onPress={onShare}
          hitSlop={spacing.sm}
        >
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 13,
              color: colors.sub,
            }}
          >
            {t('family:share')}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
