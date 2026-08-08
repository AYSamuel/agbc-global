import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import { Button } from '@/components/ui';
import { joinMeta } from '@/features/family/format';
import {
  formatServiceDay,
  formatServiceTime,
  type NextService,
} from '@/features/home/nextService';
import { useTheme } from '@/theme';
import { useFormattingLocale } from '@/i18n';

/**
 * The mockup's `.todaycard` on RHYTHM's lapsed frame: when the branch gathers,
 * where, and a way in. The one thing this screen offers a member who has been
 * away, and it offers a door rather than asking for anything.
 *
 * `.todaycard{margin:14px 16px 0;border-left:4px solid var(--eye);radius:16;
 * padding:16}` · `.te{10.5px/800 uppercase eye}` · `.tt{display 800 18px;
 * margin:7px 0 4px}` · `.tr{13px muted 700;margin-bottom:13}` · `.btn.outline`
 *
 * The title reads as a RECURRING slot ("Sundays · 11:00 AM"), not as a countdown
 * to the next one: `10` is emphatic that coming back is never a deadline, and
 * "in 2 days" would make it one. Same two shapes Home's card handles, for the
 * same reason (docs/spec/07 zero-rows rule): the computed slot when the branch
 * has `branch_services` rows, and the branch's own display string when it has
 * none. With neither, the card does not render at all rather than inventing a
 * time somebody might turn up for.
 */
export interface WheneverReadyCardProps {
  next: NextService | null;
  /** branches.service_times display strings; used only in the fallback. */
  displayTimes: readonly string[];
  branchName: string;
  addressLine: string | null;
  onDetails: () => void;
}

export function WheneverReadyCard({
  next,
  displayTimes,
  branchName,
  addressLine,
  onDetails,
}: WheneverReadyCardProps) {
  const { t } = useTranslation();
  const locale = useFormattingLocale();
  const { colors } = useTheme();

  const title =
    next === null
      ? displayTimes.length > 0
        ? displayTimes[0]
        : null
      : t('rhythm:servicePattern', {
          day: formatServiceDay(next.service.weekday, locale),
          time: formatServiceTime(next.service.start_time, locale),
        });
  if (title === null) return null;

  const where = joinMeta([branchName, addressLine]);

  return (
    <View
      style={{
        marginHorizontal: spacing.lg,
        marginTop: spacing.lg - 2,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderLeftWidth: 4,
        borderLeftColor: colors.eye,
        borderRadius: radius.cardTight,
        padding: spacing.lg,
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.body.extraBold,
          fontSize: 10.5,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: colors.eye,
        }}
      >
        {t('rhythm:wheneverReady')}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.display.extraBold,
          fontSize: 18,
          letterSpacing: -0.18,
          color: colors.text,
          marginTop: 7,
          marginBottom: spacing.xs,
        }}
      >
        {title}
      </Text>
      {where === '' ? null : (
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 13,
            color: colors.muted,
            marginBottom: spacing.md + 1,
          }}
        >
          {where}
        </Text>
      )}
      <Button
        label={t('rhythm:branchDetails')}
        variant="outline"
        onPress={onDetails}
      />
    </View>
  );
}
