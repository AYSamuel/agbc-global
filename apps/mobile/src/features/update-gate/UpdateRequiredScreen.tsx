import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';

import {
  icon,
  onInk,
  palette,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { Button, UpdateIcon } from '@/components/ui';
import { storeUrl } from '@/lib/links';

import { startUpdate } from './inAppUpdates';

// Blocking forced-update screen (docs/spec/21 §8). Framed at last at W4.10 as it
// actually ships (`UPDATE-REQUIRED`, mockup W4.10); it was built at W1.2 with no frame
// at all, composed from the splash/auth patterns: ink surface, gold tile, display
// title, one gold action out to the store.
//
// WHAT W4.10 CHANGED IS THE BUTTON, not a pixel of the screen. It used to leave the app
// for the store listing and leave the member to find the Update button themselves; on
// Android it now runs Play's IMMEDIATE in-app update, which installs without going
// anywhere. IMMEDIATE rather than flexible because this screen exists for the case where
// there is no choice: a flexible download would hand the member back to a blocked app to
// wait in.
//
// The store link stays as the fallback and is still the whole of iOS: Apple has no
// install API, and with no App Store id in the Info.plist the native call rejects, which
// is exactly what routes it back here (see inAppUpdates.ts). Sideloaded builds and
// devices without Play land here too. A blocked member always has somewhere to go.
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
        <UpdateIcon size={icon.x4l} color={palette.navy} />
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
            void startUpdate(true).then((started) => {
              if (!started) void Linking.openURL(storeUrl());
            });
          }}
        />
      </View>
    </View>
  );
}
