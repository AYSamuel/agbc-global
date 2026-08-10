import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { ChurchIcon, LiveIcon } from '@/components/ui';
import { joinMeta } from '@/features/family/format';
import { useTheme } from '@/theme';
import { useFormattingLocale } from '@/i18n';

import { formatAttendanceDate } from './format';
import type { AttendanceEntry } from './history';

/**
 * The mockup's `.atlist` of `.atrow`s: one gathering per row, the date and where
 * it was, with the live-watch variant in red.
 *
 * `.atlist{margin:12px 16px 0;radius:16;overflow:hidden}` ·
 * `.atrow{gap:13;padding:12px 16;border-bottom:1px border}` (last row none) ·
 * `.ad{40px;radius:11;background:alt}` ·
 * `.atrow.live .ad{background:rgba(224,52,44,.12);color:red}` ·
 * `.an{14px/700 text}` · `.as{12px muted;margin-top:2}`
 *
 * THE GRACE WEEK IS NOT DRAWN HERE, and this is the decision the frames made
 * rather than an omission (W2.8): a "you missed this one" row would mean the app
 * working out which week has no attendance, which is the streak arithmetic
 * creeping back into the client from the one direction that looks harmless.
 * Grace is said once, from `state`, in the hero and one gold banner.
 *
 * Every value here is a stored fact: the day the row was written for, the branch
 * it was written at, and how. Nothing is derived.
 */
export function AttendanceList({
  entries,
  branchNames,
}: {
  entries: readonly AttendanceEntry[];
  branchNames: Record<string, string>;
}) {
  const { t } = useTranslation();
  const locale = useFormattingLocale();
  const { colors } = useTheme();

  return (
    <View
      style={{
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.cardTight,
        overflow: 'hidden',
      }}
    >
      {entries.map((entry, index) => {
        const live = entry.source === 'live_watch';
        const when = formatAttendanceDate(entry.serviceDate, locale);
        const where = live
          ? t('rhythm:watchedLive')
          : // A branch the lookup has not got (a branch since retired, an
            // offline cold start before the list arrives) leaves the row with
            // its date and "In person", which is still true, rather than with a
            // stray separator or a raw id.
            joinMeta([
              branchNames[entry.branchId] ?? null,
              t('rhythm:inPerson'),
            ]);

        return (
          <View
            key={entry.serviceDate}
            accessible
            accessibilityLabel={`${when}. ${where}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md + 1,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              borderBottomWidth: index === entries.length - 1 ? 0 : 1,
              borderBottomColor: colors.cardline,
            }}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                backgroundColor: live ? tonal.redSoft.bg : colors.alt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {live ? (
                <LiveIcon size={icon.lg} color={palette.red} />
              ) : (
                <ChurchIcon size={icon.lg} color={colors.text} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 14,
                  color: colors.text,
                }}
              >
                {when}
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 12,
                  color: colors.muted,
                  marginTop: 2,
                }}
              >
                {where}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
