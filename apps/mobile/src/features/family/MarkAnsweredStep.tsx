import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  onInk,
  palette,
  spacing,
} from '@agbc/shared/theme';

import { Button, CheckIcon, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

// MARK-ANSWERED (mockup frame line 1681): the `.success` layout with a GREEN disc and a
// white check, because this is the celebratory beat of the loop rather than an arrival
// (docs/spec/09: "make each step feel like a small celebration"). Its ring is the frame's
// verbatim rgba(31,138,91,.14), set inline on the frame itself, the way POST-PENDING's
// gold-deep washes are.
//
// A third component drawing `.success` rather than a fourth prop on `SuccessScreen`: the
// four frames differ in disc colour, glyph, button variant and whether a secondary link
// follows, and that is the shape of three components, not one with four switches
// (~/.claude/standards/frontend.md: compose, don't configure). Folding SuccessScreen,
// PostPendingStep and this one onto a shared layout is worth doing, and it is a change to
// AUTH-4 and POST-PENDING, so it is flagged rather than smuggled into W2.5.
//
// "Not now" is not a dead end: the prompt is optional (docs/spec/09 "answered without
// testimony" is an allowed end state), and PRAYER-DETAIL keeps offering "Write a
// testimony" afterwards, which is the frame composed alongside this one.

const DISC_RING = 'rgba(31,138,91,0.14)';

export interface MarkAnsweredStepProps {
  onWriteTestimony: () => void;
  onNotNow: () => void;
}

export function MarkAnsweredStep({
  onWriteTestimony,
  onNotNow,
}: MarkAnsweredStepProps) {
  const { t } = useTranslation('family');
  const { colors } = useTheme();

  return (
    <Screen widthClass="capped" padded={false} scroll={false}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 34,
        }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: palette.green,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          {/* The frame's 10px soft ring, as a view (no RN boxShadow). */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -10,
              left: -10,
              right: -10,
              bottom: -10,
              borderWidth: 10,
              borderColor: DISC_RING,
              borderRadius: 54,
            }}
          />
          <CheckIcon size={icon.x4l} color={onInk.text} strokeWidth={2.6} />
        </View>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 26,
            letterSpacing: -0.52,
            color: colors.text,
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          {t('answered.successTitle')}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 14.5,
            lineHeight: 22,
            color: colors.sub,
            textAlign: 'center',
            marginBottom: 22,
          }}
        >
          {t('answered.successBody')}
        </Text>
        <View style={{ width: '100%', maxWidth: 250 }}>
          <Button
            label={t('answered.writeTestimony')}
            variant="primary"
            fullWidth
            onPress={onWriteTestimony}
          />
        </View>
        {/* Mockup `.authlink` under the button: a quiet way out of an invitation. */}
        <Pressable
          accessibilityRole="button"
          onPress={onNotNow}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          style={({ pressed }) => ({
            marginTop: spacing.lg,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 13.5,
              color: colors.blue,
            }}
          >
            {t('answered.notNow')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
