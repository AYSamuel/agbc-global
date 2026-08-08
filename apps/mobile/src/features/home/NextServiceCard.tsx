import { Trans, useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { Button, GradientFill, PinIcon } from '@/components/ui';
import { CheckedInBadge } from '@/features/rhythm/CheckedInBadge';
import { useFormattingLocale } from '@/i18n';

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
  /**
   * "I'm here" (docs/spec/10), present only when this branch gathers today. A
   * guest gets it too and the tap gates (docs/spec/07): browsing is free,
   * contributing signs you in.
   */
  imHere?: { checkedIn: boolean; onPress: () => void } | null;
  /**
   * The browsed branch's name, when it is NOT the member's home branch. The card
   * then says where the tap will count, because attendance follows the branch
   * you are standing in and a member who travels should not have to guess
   * (docs/spec/07).
   */
  visitingBranchName?: string | null;
}

export function NextServiceCard({
  next,
  displayTimes,
  branchName,
  addressLine,
  onPlanVisit,
  onWatchLive,
  imHere = null,
  visitingBranchName = null,
}: NextServiceCardProps) {
  const { t } = useTranslation();
  const locale = useFormattingLocale();

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
      day: formatServiceDay(next.service.weekday, locale),
    });
  })();

  const title = (() => {
    if (next === null) {
      return displayTimes.length > 0
        ? displayTimes[0]
        : t('home:serviceTimesSoon');
    }
    const time = formatServiceTime(next.service.start_time, locale);
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
        {/* fill on both: when one label wraps at large text scale, the pair
            stays equal height instead of the gold button outgrowing (#76). */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {/* On a day this branch gathers, the gold slot is the check-in and
              "Plan a visit" quietens beside it (mockup W2.8 HOME · checked in).
              On any other day the card keeps its guest pair. */}
          {imHere ? (
            <>
              <View style={{ flex: 1 }}>
                {imHere.checkedIn ? (
                  <CheckedInBadge />
                ) : (
                  <Button
                    label={t('rhythm:imHere')}
                    variant="accent"
                    fullWidth
                    fill
                    onPress={imHere.onPress}
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('home:planVisit')}
                  variant="glass"
                  fullWidth
                  fill
                  onPress={onPlanVisit}
                />
              </View>
            </>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <Button
                  label={t('home:planVisit')}
                  variant="accent"
                  fullWidth
                  fill
                  onPress={onPlanVisit}
                />
              </View>
              <View style={{ flex: 1 }}>
                {/* Mockup .btn.glass: outline would paint a light card block. */}
                <Button
                  label={t('home:watchLive')}
                  variant="glass"
                  fullWidth
                  fill
                  onPress={onWatchLive}
                />
              </View>
            </>
          )}
        </View>

        {/* Mockup .hero .visitnote. Only where it changes the meaning of the
            tap: a member browsing another branch on a day it gathers. */}
        {imHere && visitingBranchName !== null ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: spacing.sm,
              marginTop: 12,
            }}
          >
            <View style={{ marginTop: 1 }}>
              <PinIcon size={14} color={palette.gold} />
            </View>
            <Text
              style={{
                flex: 1,
                fontFamily: fontFamily.body.regular,
                fontSize: 12,
                lineHeight: 17,
                color: onInk.sub,
              }}
            >
              {/* The branch name carries the emphasis, gold and heavy, exactly
                  as `.hero .visitnote b` does: it is the one word in the
                  sentence that changes what the tap means. */}
              <Trans
                t={t}
                i18nKey="rhythm:visiting"
                values={{ branch: visitingBranchName }}
                components={{
                  1: (
                    <Text
                      style={{
                        fontFamily: fontFamily.body.extraBold,
                        color: palette.gold,
                      }}
                    />
                  ),
                }}
              />
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
