import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';

import { onInk, palette, radius, spacing, typeScale } from '@agbc/shared/theme';

import { Button, UpdateIcon } from '@/components/ui';
import { storeUrl } from '@/lib/links';

// Blocking forced-update screen (docs/spec/21 §8). No mockup frame exists for it
// (flagged to Ayo in the W1.2 PR): composed from the splash/auth patterns: ink
// surface, gold tile, display title, one gold action out to the store.
export function UpdateRequiredScreen() {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.ink,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
        paddingHorizontal: spacing.x4l,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 76,
          height: 76,
          borderRadius: radius.cardHero,
          backgroundColor: palette.gold,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <UpdateIcon size={40} color={palette.navy} />
      </View>
      <Text
        accessibilityRole="header"
        style={[
          typeScale.hero,
          { fontSize: 26, color: onInk.text, textAlign: 'center' },
        ]}
      >
        {t('updateGate.title')}
      </Text>
      <Text
        style={[
          typeScale.body,
          {
            fontSize: 14,
            lineHeight: 21,
            color: onInk.sub,
            textAlign: 'center',
            maxWidth: 280,
          },
        ]}
      >
        {t('updateGate.body')}
      </Text>
      <View style={{ alignSelf: 'stretch', marginTop: spacing.sm }}>
        <Button
          label={t('updateGate.cta')}
          variant="accent"
          fullWidth
          onPress={() => {
            void Linking.openURL(storeUrl());
          }}
        />
      </View>
    </View>
  );
}
