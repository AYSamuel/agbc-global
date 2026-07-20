import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { spacing, typeScale } from '@agbc/shared/theme';

import { Eyebrow, Screen } from '@/components/ui';
import { useBranchStore } from '@/state/branch';
import { useTheme } from '@/theme';

// PLACEHOLDER guest Home: proves the onboarding exit and restores the saved branch.
// The real guest Home composition (verse card, next service, rails) is W1.4; the
// 5-tab shell wraps this at W1.2.
export default function Home() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const branch = useBranchStore((s) => s.branch);

  return (
    <Screen widthClass="capped">
      <View style={{ gap: spacing.md, marginTop: spacing.x4l }}>
        {branch ? <Eyebrow label={branch.name} /> : null}
        <Text style={[typeScale.hero, { color: colors.text }]}>
          {t('home:welcome')}
        </Text>
        <Text style={[typeScale.body, { color: colors.sub }]}>
          {t('tagline')}
        </Text>
      </View>
    </Screen>
  );
}
