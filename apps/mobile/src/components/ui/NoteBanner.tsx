import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import {
  fontFamily,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

/**
 * The mockup's `.linkbanner`: an icon, one sentence, and an optional action on the same
 * line. A line you can live alongside rather than a card demanding attention (the shape
 * that replaced the taller `.notecard` treatment on device, 2026-08-01).
 *
 * Two tones, both from the mockup:
 *  - `green` is the base `.linkbanner`, used when the sentence IS about an answered prayer
 *    (TESTIMONY-COMPOSE's "Born from an answered prayer", W2.5).
 *  - `gold` is `.linkbanner.gold`, "for an informational line that is not about an answered
 *    prayer": an open branch request on HOME (W2.7), a testimony still in the queue (W2.5).
 *
 * The tone owns its accent, which is why `icon` is a function of it: the wash, the border,
 * the glyph and the emphasised lead are one decision, and a caller that picked the icon
 * colour itself would be the second place that decision lived. Gold resolves to
 * `colors.eye` (deep gold on light where bright gold fails contrast, bright gold on dark,
 * per `05`); both washes are translucent, so one set is correct on either surface.
 */
export type NoteBannerTone = 'green' | 'gold';

export interface NoteBannerProps {
  tone?: NoteBannerTone;
  /** Receives the tone's accent colour, so the glyph matches the wash it sits in. */
  icon: (accent: string) => ReactNode;
  /** Optional bold opening, in the accent colour. The rest follows in body colour. */
  lead?: string;
  body: string;
  /** An action on the same line (HOME's Dismiss). Absent on a purely informational line. */
  trailing?: ReactNode;
}

export function NoteBanner({
  tone = 'green',
  icon,
  lead,
  body,
  trailing,
}: NoteBannerProps) {
  const { colors } = useTheme();
  const accent = tone === 'gold' ? colors.eye : palette.green;
  const wash = tone === 'gold' ? tonal.goldSoft : tonal.greenCard;

  // The space between the bold lead and the rest of the sentence. Two nested <Text> runs
  // have no margin between them, and a literal in JSX is banned; building it here rather
  // than inside the translation keeps a leading space a translator would delete out of the
  // string files.
  const rest = lead ? ` ${body}` : body;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md - 2,
        backgroundColor: wash.bg,
        borderWidth: 1,
        borderColor: wash.border,
        borderRadius: radius.button,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg - 2,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ marginTop: 1 }}
      >
        {icon(accent)}
      </View>

      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
        {lead ? (
          <Text style={{ fontFamily: fontFamily.body.bold, color: accent }}>
            {lead}
          </Text>
        ) : null}
        <Text
          style={{ fontFamily: fontFamily.body.regular, color: colors.text }}
        >
          {rest}
        </Text>
      </Text>

      {trailing}
    </View>
  );
}
