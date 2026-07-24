import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, spacing } from '@agbc/shared/theme';

import {
  BankIcon,
  Button,
  CardIcon,
  EmptyState,
  GiveTabIcon,
  Screen,
  Skeleton,
} from '@/components/ui';
import { GiveHero } from '@/features/give/GiveHero';
import { GiveRow } from '@/features/give/GiveRow';
import { useGivingConfigQuery } from '@/features/give/queries';
import { localizedGiveUrl } from '@/features/give/url';
import { StubIcon } from '@/features/shell/StubIcon';
import { useTheme } from '@/theme';

// GIVE tab (docs/spec/12): link out to the church's web giving (in-app browser),
// PayPal, and copyable bank details. No account needed. No Apple IAP: a donation
// handled off-app is store-compliant (docs/spec/12 note, standards/mobile.md).
// Composed from the mockup GIVE frame: the hero and intro are static copy and
// never wait on data; only the config-driven actions below them gate on the
// giving-config read (four states there).
export default function Give() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const query = useGivingConfigQuery();
  const config = query.data;

  const hasAnyAction =
    config !== undefined &&
    (config.giveUrl !== null ||
      config.paypalUrl !== null ||
      config.accounts.length > 0);
  // Mockup .givemeta shows the destination bare ("Opens agbc.org/give"): data,
  // not copy, so the giver sees where the button takes them.
  const giveUrlDisplay =
    config === undefined || config.giveUrl === null
      ? null
      : config.giveUrl.replace(/^https?:\/\/(www\.)?/, '');

  return (
    <Screen widthClass="capped" padded={false}>
      {/* Mockup .stitle: 26px display title, 10px below before the hero. */}
      <View
        style={{
          marginTop: spacing.md,
          paddingHorizontal: spacing.gutter,
          paddingBottom: 10,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 26,
            letterSpacing: -0.52,
            color: colors.text,
          }}
        >
          {t('tabs.give')}
        </Text>
      </View>

      {/* Mockup .mediahero: margin 4px 16px 0. */}
      <View style={{ marginTop: spacing.xs, paddingHorizontal: spacing.lg }}>
        <GiveHero
          eyebrow={t('give:heroEyebrow')}
          title={t('give:heroTitle')}
          verse={t('give:heroVerse')}
        />
      </View>

      {/* Mockup .giveexp: padding 14px 22px 4px, 15/1.6 in sub. */}
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 15,
          lineHeight: 24,
          color: colors.sub,
          paddingTop: 14,
          paddingHorizontal: 22,
          paddingBottom: spacing.xs,
        }}
      >
        {t('give:intro')}
      </Text>

      <View style={{ paddingHorizontal: spacing.lg }}>
        {config === undefined && !query.isError ? (
          // Loading: the primary action and the two rows at their real heights.
          <View style={{ gap: spacing.md, marginTop: spacing.md }}>
            <Skeleton height={48} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : query.isError && config === undefined ? (
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void query.refetch();
            }}
          />
        ) : config !== undefined && hasAnyAction ? (
          <>
            {config.giveUrl !== null ? (
              // Mockup: button block padding 12px 16px 6px.
              <View style={{ marginTop: spacing.md, marginBottom: 6 }}>
                <Button
                  label={t('give:giveNow')}
                  variant="accent"
                  fullWidth
                  onPress={() => {
                    void WebBrowser.openBrowserAsync(
                      localizedGiveUrl(config.giveUrl ?? '', i18n.language),
                    );
                  }}
                />
                <Text
                  style={{
                    fontFamily: fontFamily.body.regular,
                    fontSize: 12,
                    color: colors.muted,
                    textAlign: 'center',
                    marginTop: spacing.sm + 2,
                  }}
                >
                  {t('give:giveNowMeta', { url: giveUrlDisplay ?? '' })}
                </Text>
              </View>
            ) : null}

            {/* Mockup .sectitle: margin 20px 20px 10px (4px past the 16 gutter). */}
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 18,
                letterSpacing: -0.36,
                color: colors.text,
                paddingHorizontal: spacing.xs,
                marginTop: spacing.xl,
                marginBottom: 10,
              }}
            >
              {t('give:otherWays')}
            </Text>

            <View style={{ gap: spacing.sm + 2 }}>
              {config.paypalUrl !== null ? (
                <GiveRow
                  icon={<CardIcon size={18} color={colors.text} />}
                  title={t('give:paypalTitle')}
                  // The handle (data, not copy) so the giver sees where they go.
                  subtitle={config.paypalUrl.replace(/^https?:\/\//, '')}
                  accessibilityLabel={t('give:paypalTitle')}
                  onPress={() => {
                    void WebBrowser.openBrowserAsync(config.paypalUrl ?? '');
                  }}
                />
              ) : null}
              {config.accounts.length > 0 ? (
                <GiveRow
                  icon={<BankIcon size={18} color={colors.text} />}
                  title={t('give:bankTitle')}
                  // Mockup: "GBP · EUR · NGN · copyable details", codes from data.
                  subtitle={t('give:bankSubtitle', {
                    codes: config.accounts
                      .map((account) => account.code)
                      .join(' · '),
                  })}
                  accessibilityLabel={t('give:bankTitle')}
                  onPress={() => {
                    router.push('/give/bank');
                  }}
                />
              ) : null}
            </View>
          </>
        ) : (
          // Config loaded but empty of actions: still inform, never blank.
          <View style={{ marginTop: spacing.md }}>
            <EmptyState
              title={t('give:emptyTitle')}
              body={t('give:emptyBody')}
              icon={<StubIcon Icon={GiveTabIcon} />}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
