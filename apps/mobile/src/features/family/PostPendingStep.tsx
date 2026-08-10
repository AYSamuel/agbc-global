import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ComposeTarget } from '@agbc/shared';
import {
  fontFamily,
  icon,
  palette,
  spacing,
} from '@agbc/shared/theme';

import { Button, ClockIcon, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

// POST-PENDING (mockup frame line 1176): AUTH-4's .success layout with the gold
// disc swapped for a clock, because the post is waiting rather than published.
// The frame's disc and ring are deep-gold washes (rgba(185,134,0,.16) / .08) set
// inline on the frame itself, so they are reproduced literally here the way
// SuccessStep reproduces its own ring; both derive from palette.goldDeep.
//
// The frame's secondary "View my posts" link is omitted: MY-POSTS is W2.6 and
// docs/spec/04 forbids an action with no destination. It returns with that item.

const DISC_BG = 'rgba(185,134,0,0.16)';
const DISC_RING = 'rgba(185,134,0,0.08)';

export interface PostPendingStepProps {
  target: ComposeTarget;
  onDone: () => void;
}

export function PostPendingStep({ target, onDone }: PostPendingStepProps) {
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
            backgroundColor: DISC_BG,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
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
          <ClockIcon size={icon.x4l} color={palette.goldDeep} strokeWidth={1.8} />
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
          {t('pendingTitle')}
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
          {t(
            target === 'testimony'
              ? 'pendingBodyTestimony'
              : 'pendingBodyPrayer',
          )}
        </Text>
        <View style={{ width: '100%', maxWidth: 240 }}>
          <Button
            label={t('backToFamily')}
            variant="primary"
            fullWidth
            onPress={onDone}
          />
        </View>
        <View style={{ height: spacing.x2l }} />
      </View>
    </Screen>
  );
}
