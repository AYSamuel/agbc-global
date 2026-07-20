import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { Button, MenuCard, MenuLabel, MenuRow, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

// MORE hub, guest variant (docs/spec/04 tab 5; mockup "More · guest hub"): sign-in
// card in place of the member "My life" section, then Grow / Church / Read / App.
// Auth-needing rows route to the /auth placeholder until W2.1-W2.2 wire GateSheet.
export default function More() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Screen padded={false} widthClass="capped">
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Text
          accessibilityRole="header"
          style={{
            // Mockup .stitle h1: display 800 at 26; gutter-aligned (20 total).
            fontFamily: fontFamily.display.extraBold,
            fontSize: 26,
            letterSpacing: -0.52,
            color: colors.text,
            marginTop: spacing.md,
            paddingHorizontal: spacing.xs,
          }}
        >
          {t('tabs.more')}
        </Text>

        {/* Mockup .signin: ink card, gold eyebrow, display title, gold CTA. */}
        <View
          style={{
            marginTop: spacing.sm,
            backgroundColor: colors.band,
            borderRadius: radius.card,
            padding: 18,
          }}
        >
          <Text
            style={[
              typeScale.label,
              { fontSize: 11, letterSpacing: 2.6, color: colors.accent },
            ]}
          >
            {t('more.signinEyebrow')}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.display.extraBold,
              fontSize: 18,
              letterSpacing: -0.36,
              color: onInk.text,
              marginTop: spacing.sm,
              marginBottom: 5,
            }}
          >
            {t('more.signinTitle')}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 13,
              lineHeight: 19,
              color: onInk.sub,
              marginBottom: 14,
            }}
          >
            {t('more.signinBody')}
          </Text>
          <Button
            label={t('more.signin')}
            variant="accent"
            fullWidth
            onPress={() => {
              router.push('/auth');
            }}
          />
        </View>

        <MenuLabel label={t('more.sections.grow')} />
        <MenuCard>
          <MenuRow
            icon="🎓"
            label={t('more.rows.academy')}
            onPress={() => {
              router.push('/academy');
            }}
          />
          <MenuRow
            icon="📖"
            label={t('more.rows.devotional')}
            onPress={() => {
              router.push('/plan');
            }}
          />
        </MenuCard>

        <MenuLabel label={t('more.sections.church')} />
        <MenuCard>
          <MenuRow
            icon="📍"
            label={t('more.rows.branches')}
            onPress={() => {
              router.push('/branches');
            }}
          />
          <MenuRow
            icon="📅"
            label={t('more.rows.events')}
            onPress={() => {
              router.push('/events');
            }}
          />
          <MenuRow
            icon="ℹ️"
            label={t('more.rows.about')}
            onPress={() => {
              router.push('/about');
            }}
          />
          <MenuRow
            icon="✉️"
            label={t('more.rows.contact')}
            onPress={() => {
              router.push('/contact');
            }}
          />
        </MenuCard>

        <MenuLabel label={t('more.sections.read')} />
        <MenuCard>
          <MenuRow
            icon="🛒"
            label={t('more.rows.bookstore')}
            onPress={() => {
              router.push('/store');
            }}
          />
          <MenuRow
            icon="📚"
            label={t('more.rows.library')}
            badge={t('more.signin')}
            onPress={() => {
              router.push('/auth');
            }}
          />
        </MenuCard>

        <MenuLabel label={t('more.sections.app')} />
        <MenuCard>
          <MenuRow
            icon="⚙️"
            label={t('more.rows.settings')}
            onPress={() => {
              router.push('/settings');
            }}
          />
        </MenuCard>
      </View>
    </Screen>
  );
}
