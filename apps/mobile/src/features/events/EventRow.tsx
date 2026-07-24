import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { ChevronRightIcon } from '@/components/ui';
import { useTheme } from '@/theme';

import { eventDateParts, formatEventTime } from './format';
import type { EventListItem } from './queries';

// Mockup .eventrow: date block (day over month), title, "time · city" meta with
// the Branch / All-nations tag, chevron. Past and cancelled rows grey out
// (docs/spec/11: greyed, never hidden; deep links still land).
export interface EventRowProps {
  event: EventListItem;
  /** City for branch events; null while the branch lookup is warming. */
  branchCity: string | null;
  muted?: boolean;
  onPress: () => void;
}

export function EventRow({
  event,
  branchCity,
  muted = false,
  onPress,
}: EventRowProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();

  const isGlobal = event.branch_id === null;
  const date = eventDateParts(event.starts_at_local, i18n.language);
  const time = formatEventTime(event.starts_at_local, i18n.language);
  const place = isGlobal ? t('events:allBranches') : (branchCity ?? '');
  const metaText = [time, place].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${metaText}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.cardTight,
        paddingVertical: 12,
        paddingHorizontal: 14,
        opacity: pressed ? 0.9 : muted ? 0.6 : 1,
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 52,
          height: 56,
          borderRadius: radius.control,
          backgroundColor: colors.alt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 20,
            lineHeight: 22,
            color: colors.text,
          }}
        >
          {date?.day ?? ''}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: colors.muted,
            marginTop: 2,
          }}
        >
          {date?.month ?? ''}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 15,
            lineHeight: 19,
            color: colors.text,
          }}
        >
          {event.title}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            marginTop: 5,
          }}
        >
          {metaText !== '' ? (
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12.5,
                color: colors.muted,
                flexShrink: 1,
              }}
            >
              {metaText}
            </Text>
          ) : null}
          <Text
            style={{
              fontFamily: fontFamily.body.extraBold,
              fontSize: 9.5,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              borderRadius: radius.full,
              paddingHorizontal: spacing.sm,
              paddingVertical: 3,
              overflow: 'hidden',
              backgroundColor: isGlobal ? tonal.gold.bg : colors.alt,
              color: isGlobal ? palette.goldDeep : colors.sub,
            }}
          >
            {isGlobal ? t('events:tagGlobal') : t('events:tagBranch')}
          </Text>
        </View>
      </View>
      <ChevronRightIcon size={18} color={colors.muted} />
    </Pressable>
  );
}
