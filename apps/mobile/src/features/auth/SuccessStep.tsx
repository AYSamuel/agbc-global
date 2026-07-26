import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, palette, spacing } from '@agbc/shared/theme';

import { Button, CheckIcon, Screen } from '@/components/ui';
import { useAuthStore } from '@/state/auth';
import { useTheme } from '@/theme';

// AUTH-4 (docs/spec/03, mockup frame line 1080): the .success layout: gold
// check circle with the soft ring, "You're in!", personalized welcome, gold
// Continue. The frame's action-specific line ("...to say Glory to God") waits
// for W2.2's gate-return replay; until then the copy is the generic variant
// and Continue returns to wherever the flow was opened from.

export interface SuccessStepProps {
  onContinue: () => void;
}

export function SuccessStep({ onContinue }: SuccessStepProps) {
  const { t } = useTranslation('auth');
  const { colors } = useTheme();
  const name = useAuthStore((s) => s.profile?.displayName ?? '');

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
            backgroundColor: palette.gold,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          {/* The mockup's 10px soft gold ring, as a view (no RN boxShadow). */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -10,
              left: -10,
              right: -10,
              bottom: -10,
              borderWidth: 10,
              borderColor: 'rgba(255,207,74,0.15)',
              borderRadius: 54,
            }}
          />
          <CheckIcon size={42} color={palette.navy} strokeWidth={2.6} />
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
          {t('successTitle')}
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
          {t('successBody', { name })}
        </Text>
        <View style={{ width: '100%', maxWidth: 220 }}>
          <Button
            label={t('continue')}
            variant="accent"
            fullWidth
            onPress={onContinue}
          />
        </View>
        <View style={{ height: spacing.x2l }} />
      </View>
    </Screen>
  );
}
