import { useEffect } from 'react';
import { AccessibilityInfo, Modal, Text, View } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { Burst } from './Burst';
import { Button } from './Button';
import { GoldDisc } from './GoldDisc';
import { CAPPED_MAX_WIDTH } from './Screen';

/**
 * The milestone celebration (mockup W2.8 "MILESTONE · celebration overlay" and
 * "· with reduce motion ON"): a dim, a centred card, a gold disc with a burst,
 * and two ways out.
 *
 * `.celebrate{inset:0;place-items:center;padding:0 26px}` ·
 * `.celcard{card;border;radius:24;padding:26px 22px 20px;centred}` ·
 * `.celdisc{88px gold disc + 10px soft ring;font-size:38}` ·
 * `h3{disp 800 22px}` · `p{14.5px sub}` · `.gatedim{rgba(8,11,18,0.55)}`
 *
 * CENTRED, NOT A BOTTOM SHEET, and that is the decision the frames made rather
 * than a layout preference: a sheet's shape asks for a decision, and this one
 * announces something. Nothing here is a choice the member has to get right;
 * both buttons dismiss it.
 *
 * REDUCED MOTION is `Burst`'s existing contract rather than a second code path:
 * the dots are simply not rendered, and the overlay arrives still. The frame's
 * reduced-motion variant is the same card minus the burst, which is exactly what
 * that produces.
 *
 * It renders in a `Modal` for the reason `Sheet` does: this arrives over
 * whatever screen the member is on, including one that is scrolled, and a modal
 * is what takes focus and the back button with it.
 */
export interface CelebrationProps {
  visible: boolean;
  /** The gold disc's glyph: the milestone's own emoji. */
  glyph: string;
  /** Gold uppercase kicker ("Milestone"). */
  eyebrow: string;
  title: string;
  body: string;
  /** `10` calls the share optional; omit it and only the dismissal remains. */
  shareLabel?: string;
  onShare?: () => void;
  closeLabel: string;
  onClose: () => void;
}

export function Celebration({
  visible,
  glyph,
  eyebrow,
  title,
  body,
  shareLabel,
  onShare,
  closeLabel,
  onClose,
}: CelebrationProps) {
  const { colors } = useTheme();

  useEffect(() => {
    if (!visible) return;
    // The overlay arrives without warning over whatever was on screen, so it
    // says what it is rather than waiting to be discovered (docs/spec/05:
    // async changes that matter are announced).
    AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
  }, [visible, title, body]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android back dismisses, like every other overlay in the app.
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(8,11,18,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.x2l + 2,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: CAPPED_MAX_WIDTH,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            // The frame draws 24; `cardHero` is the token `Sheet` already maps
            // that radius to, and two pixels are not worth a sixth radius.
            borderRadius: radius.cardHero,
            paddingTop: spacing.x2l + 2,
            paddingHorizontal: spacing.x2l - 2,
            paddingBottom: spacing.xl,
            alignItems: 'center',
          }}
        >
          <View style={{ marginBottom: spacing.lg }}>
            <GoldDisc
              behind={
                // Keyed by the glyph so a SECOND milestone arriving behind the
                // first remounts the burst and fires it again; `trigger` is a
                // constant 1 because this whole overlay only exists while there
                // is something to celebrate.
                <Burst
                  key={glyph}
                  trigger={1}
                  color={palette.gold}
                  size={8}
                  spread={54}
                />
              }
            >
              <Text style={{ fontSize: 38, lineHeight: 46 }}>{glyph}</Text>
            </GoldDisc>
          </View>

          <Text
            style={{
              // `.goldeye{11px;800;letter-spacing:.24em}`, which is a wider
              // track than the `.lab`/`.te` kickers elsewhere; `.celebrate`
              // overrides its colour from gold to `--eye` so it holds contrast
              // on a light card.
              fontFamily: fontFamily.body.extraBold,
              fontSize: 11,
              letterSpacing: 2.64,
              textTransform: 'uppercase',
              color: colors.eye,
            }}
          >
            {eyebrow}
          </Text>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fontFamily.display.extraBold,
              fontSize: 22,
              letterSpacing: -0.44,
              color: colors.text,
              marginTop: 9,
              marginBottom: spacing.sm,
              textAlign: 'center',
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 14.5,
              lineHeight: 22,
              color: colors.sub,
              marginBottom: spacing.lg + 2,
              textAlign: 'center',
            }}
          >
            {body}
          </Text>

          {shareLabel !== undefined && onShare !== undefined ? (
            <View style={{ width: '100%', marginBottom: spacing.sm }}>
              <Button
                label={shareLabel}
                variant="accent"
                fullWidth
                onPress={onShare}
              />
            </View>
          ) : null}
          <View style={{ width: '100%' }}>
            <Button
              label={closeLabel}
              variant="ghost"
              fullWidth
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
