import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, hitTarget, icon, spacing } from '@agbc/shared/theme';

import { CheckIcon, ClockIcon, NoteBanner, PinIcon } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * HOME · the check-in, once the gathering it belongs to is over (mockup
 * "HOME · the gathering has ended", composed 2026-09-07).
 *
 * Two clocks run on Home and they part company every week. The hero hands its
 * card to the NEXT service the moment the current one ends, while the check-in
 * stays open until the end of the branch-local day (`openCheckIn`, and the grace
 * that far edge exists for). For the hours between, the control was riding a
 * card advertising a different meeting: "THIS WEDNESDAY · Midweek Prayer" with
 * "I'm here" underneath it, which invites a tap for the wrong gathering.
 *
 * So the control leaves the hero when the hero leaves the service, and lands in
 * the gold `NoteBanner`, the app's "informational line you can ignore", which
 * can do the one thing the hero no longer can: NAME the gathering.
 *
 * THE BRANCH NAME MOVES WITH IT. The hero's visit note goes when the hero does,
 * and without this the single surface saying where a tap counts would vanish at
 * exactly the hour the answer is least obvious. The visiting confirm still asks
 * on the tap (features/rhythm/visiting); this is the disclosure before it.
 */
export interface EndedGatheringNoteProps {
  /** The gathering that has finished, named: "Sunday Worship". */
  serviceName: string;
  /** The browsed branch, when it is NOT the member's own. Guests have none. */
  visitingBranchName?: string | null;
  /** That branch's short name, for the sentence's second half. */
  visitingShortName?: string | null;
  checkedIn: boolean;
  onPress: () => void;
}

export function EndedGatheringNote({
  serviceName,
  visitingBranchName = null,
  visitingShortName = null,
  checkedIn,
  onPress,
}: EndedGatheringNoteProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const visiting = visitingBranchName !== null;
  const lead = checkedIn
    ? t('rhythm:endedReceiptLead')
    : visiting
      ? t('rhythm:endedLeadVisiting', {
          service: serviceName,
          branch: visitingBranchName,
        })
      : t('rhythm:endedLead', { service: serviceName });
  const body = checkedIn
    ? t('rhythm:endedReceiptBody', { service: serviceName })
    : visiting
      ? t('rhythm:endedBodyVisiting', {
          branch: visitingShortName ?? visitingBranchName,
        })
      : t('rhythm:endedBody');

  return (
    // NO horizontal margin: HomeDashboard already pads the column by
    // `spacing.lg`, and adding it again here drew the line inset from the hero
    // and the rhythm strip it sits between (caught on the device, 2026-09-07).
    // The frames have all three flush. Only the gap to the hero belongs here,
    // because siblings inside one slot get no gap from the column.
    <View style={{ marginBottom: spacing.md }}>
      <NoteBanner
        tone="gold"
        // The glyph says which of the three sentences this is: a clock for time
        // that has passed, a pin for a gathering somewhere else, a check for one
        // already counted.
        icon={(accent) =>
          checkedIn ? (
            <CheckIcon size={icon.lg} color={accent} strokeWidth={2.6} />
          ) : visiting ? (
            <PinIcon size={icon.lg} color={accent} />
          ) : (
            <ClockIcon size={icon.lg} color={accent} strokeWidth={1.8} />
          )
        }
        lead={lead}
        body={body}
        trailing={
          checkedIn ? undefined : (
            // The same coloured text action PendingBranchNote uses: a full
            // button in a line this quiet is what made that one loud. Still a
            // 44px target through hitSlop, because a smaller LOOK is not a
            // smaller touch area.
            <Pressable
              accessibilityRole="button"
              onPress={onPress}
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              style={({ pressed }) => ({
                alignSelf: 'center',
                minHeight: hitTarget.min - 22,
                justifyContent: 'center',
                paddingLeft: spacing.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: fontFamily.body.extraBold,
                  fontSize: 13,
                  color: colors.eye,
                }}
              >
                {t('rhythm:imHere')}
              </Text>
            </Pressable>
          )
        }
      />
    </View>
  );
}
