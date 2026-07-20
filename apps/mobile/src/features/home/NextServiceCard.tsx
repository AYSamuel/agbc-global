import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { Button, GradientFill } from '@/components/ui';

import {
  dayBucket,
  formatServiceDay,
  formatServiceTime,
  type NextService,
} from './nextService';

// Mockup .hero: ink card, 22 radius, diagonal gradient at 50% over it, gold
// eyebrow, display title, address line, two actions. Renders three shapes
// (docs/spec/07 §3): a computed next service, the display-string fallback when
// a branch has no branch_services rows, and "coming soon" when it has neither.
export interface NextServiceCardProps {
  next: NextService | null;
  /** branches.service_times display strings; used only in the fallback. */
  displayTimes: string[];
  branchName: string;
  addressLine: string | null;
  onPlanVisit: () => void;
  onWatchLive: () => void;
}

export function NextServiceCard({
  next,
  displayTimes,
  branchName,
  addressLine,
  onPlanVisit,
  onWatchLive,
}: NextServiceCardProps) {
  const { t, i18n } = useTranslation();

  const eyebrow = (() => {
    if (next === null) {
      return displayTimes.length > 0
        ? t('home:serviceTimes')
        : t('home:serviceTimesSoonEyebrow');
    }
    const bucket = dayBucket(next.minutesUntil);
    if (bucket === 'now') return t('home:happeningNow');
    if (bucket === 'today') return t('home:today');
    if (bucket === 'tomorrow') return t('home:tomorrow');
    return t('home:thisDay', {
      day: formatServiceDay(next.service.weekday, i18n.language),
    });
  })();

  const title = (() => {
    if (next === null) {
      return displayTimes.length > 0
        ? displayTimes[0]
        : t('home:serviceTimesSoon');
    }
    const time = formatServiceTime(next.service.start_time, i18n.language);
    const name =
      next.service.label || t(`home:serviceKind.${next.service.kind}`);
    return `${name} · ${time}`;
  })();

  return (
    <View
      style={{
        borderRadius: 22,
        overflow: 'hidden',
        minHeight: 190,
        justifyContent: 'flex-end',
        backgroundColor: palette.ink,
      }}
    >
      {/* Mockup .hero .bg: the gradient sits at 50% opacity over the ink. */}
      <GradientFill
        direction="diagonal"
        from="#22375f"
        to={palette.ink}
        fromOpacity={0.5}
        toOpacity={0.5}
      />
      <View style={{ padding: 18 }}>
        <Text
          style={[
            typeScale.label,
            { fontSize: 11, letterSpacing: 2.6, color: palette.gold },
          ]}
        >
          {eyebrow}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 23,
            letterSpacing: -0.46,
            color: onInk.text,
            marginTop: spacing.sm,
            marginBottom: 3,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 13,
            color: onInk.sub,
            marginBottom: 14,
          }}
        >
          {/* The branch name is already in the header: show the full address
              here instead of repeating it (decision 2026-07-20). */}
          {addressLine ?? branchName}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('home:planVisit')}
              variant="accent"
              fullWidth
              onPress={onPlanVisit}
            />
          </View>
          <View style={{ flex: 1 }}>
            {/* Mockup .btn.glass: outline would paint a light card block here. */}
            <Button
              label={t('home:watchLive')}
              variant="glass"
              fullWidth
              onPress={onWatchLive}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
