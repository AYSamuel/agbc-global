import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { fontFamily, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  BlockedIcon,
  Button,
  GlobeIcon,
  InfoIcon,
  LegalIcon,
  LockIcon,
  MailIcon,
  MenuCard,
  MenuLabel,
  MenuRow,
  PersonIcon,
  Screen,
  SegmentedControl,
  ToggleList,
  ToggleRow,
  useToast,
} from '@/components/ui';
import { useBlockedMembers } from '@/features/family/moderation';
import { shutdownAnalytics, useAnalyticsConsentStore } from '@/lib/analytics';
import { LANGUAGE_AUTONYMS, type SupportedLanguage } from '@/i18n';
import { useAuthStore } from '@/state/auth';
import { PRIVACY_URL, TERMS_URL } from '@/lib/links';
import { useTheme } from '@/theme';
import { useThemePrefStore, type ThemePref } from '@/theme/store';

const THEME_SEGMENTS: readonly { key: ThemePref; labelKey: string }[] = [
  { key: 'system', labelKey: 'settings:themeSystem' },
  { key: 'light', labelKey: 'settings:themeLight' },
  { key: 'dark', labelKey: 'settings:themeDark' },
];

// SETTINGS hub, guest level (docs/spec/16; W1.2 scope): appearance + language work
// locally; member rows (profile, notification prefs, blocked members, delete)
// arrive with their phases. Composed from the mockup SETTINGS frame's classes.
export default function Settings() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const themePref = useThemePrefStore((s) => s.pref);
  // The member rows this hub was always going to grow (docs/spec/16). Profile is the
  // first, and it is the ONLY route to a home-branch change (ADR 0015): the branch chip
  // on Home changes what you BROWSE and never where you belong.
  const isMember = useAuthStore((s) => s.status === 'member');
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const setThemePref = useThemePrefStore((s) => s.setPref);
  // The frame's `.val` on the Blocked members row. The same query the screen behind it
  // reads, so the number in the row and the list it opens are one fact; zero shows
  // nothing rather than a "0", which would read as a score.
  const blockedCount = useBlockedMembers().data?.length ?? 0;
  // The consent store IS the switch's state: one fact, one owner. A local mirror here
  // would be the second source, and the row would then disagree with what is captured.
  const analyticsConsent = useAnalyticsConsentStore((s) => s.consent);
  const grantAnalytics = useAnalyticsConsentStore((s) => s.grant);
  const denyAnalytics = useAnalyticsConsentStore((s) => s.deny);

  const currentLanguage = LANGUAGE_AUTONYMS[i18n.language as SupportedLanguage];
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen padded={false} widthClass="capped">
      <AppHeader
        title={t('settings:title')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />
      <View style={{ paddingHorizontal: spacing.lg }}>
        {isMember ? (
          <>
            <MenuLabel label={t('settings:youSection')} />
            <MenuCard>
              <MenuRow
                icon={PersonIcon}
                label={t('settings:profileRow')}
                onPress={() => {
                  router.push('/settings/profile');
                }}
              />
            </MenuCard>

            {/* The frame gives Blocked members its own section, labelled Community, and
                a count in the value slot. Member-only, and not because the screen would
                break for a guest: a guest has blocked nobody, so the row would lead to
                an empty state explaining a control they were never offered. */}
            <MenuLabel label={t('settings:communitySection')} />
            <MenuCard>
              <MenuRow
                icon={BlockedIcon}
                label={t('settings:blocked.title')}
                value={blockedCount > 0 ? String(blockedCount) : undefined}
                onPress={() => {
                  router.push('/settings/blocked');
                }}
              />
            </MenuCard>
          </>
        ) : null}

        <MenuLabel label={t('settings:appearance')} />
        <MenuCard>
          {/* Mockup .setseg: a plain row label above the segmented control. */}
          <View style={{ paddingVertical: 13, paddingHorizontal: 15 }}>
            <Text
              style={{
                fontFamily: fontFamily.body.semiBold,
                fontSize: 14.5,
                color: colors.text,
                marginBottom: spacing.sm + 2,
              }}
            >
              {t('settings:theme')}
            </Text>
            <SegmentedControl
              segments={THEME_SEGMENTS.map(({ key, labelKey }) => ({
                key,
                label: t(labelKey),
              }))}
              value={themePref}
              onChange={setThemePref}
              accessibilityLabel={t('settings:theme')}
            />
          </View>
        </MenuCard>

        <View style={{ height: spacing.sm + 2 }} />
        <MenuCard>
          <MenuRow
            icon={GlobeIcon}
            label={t('settings:language')}
            value={currentLanguage}
            onPress={() => {
              router.push('/settings/language');
            }}
          />
        </MenuCard>

        <MenuLabel label={t('settings:privacyData')} />
        {/* The analytics switch (W2.10, mockup SETTINGS "Privacy & data"). Above the
            Privacy row because it is the only thing in this section the member can
            actually change here, and it works signed out: consent is per DEVICE, not per
            account (ADR 0020). */}
        <ToggleList>
          <ToggleRow
            title={t('settings:analytics.toggleTitle')}
            body={t('settings:analytics.toggleBody')}
            value={analyticsConsent === 'granted'}
            onValueChange={(next) => {
              if (next) {
                grantAnalytics();
                return;
              }
              denyAnalytics();
              // Withdrawal has to reach the data, not just the future: stop sending and
              // drop the stored device id (`20` §Consent mechanics).
              void shutdownAnalytics();
            }}
          />
        </ToggleList>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            lineHeight: 12 * 1.5,
            color: colors.muted,
            paddingHorizontal: spacing.md + 4,
            paddingTop: spacing.sm + 4,
            paddingBottom: spacing.sm + 4,
          }}
        >
          {t('settings:analytics.crashNote')}
        </Text>
        <MenuCard>
          <MenuRow
            icon={LockIcon}
            label={t('settings:privacy')}
            onPress={() => {
              void WebBrowser.openBrowserAsync(PRIVACY_URL);
            }}
          />
        </MenuCard>

        <MenuLabel label={t('settings:aboutSection')} />
        <MenuCard>
          <MenuRow
            icon={InfoIcon}
            label={t('settings:aboutRow')}
            onPress={() => {
              router.push('/about');
            }}
          />
          <MenuRow
            icon={MailIcon}
            label={t('settings:contact')}
            onPress={() => {
              router.push('/contact');
            }}
          />
          <MenuRow
            icon={LegalIcon}
            label={t('settings:legal')}
            onPress={() => {
              void WebBrowser.openBrowserAsync(TERMS_URL);
            }}
          />
        </MenuCard>

        {/* Guest: Sign in. Member: Sign out, as `.btn.outline` with a red label
            (mockup SETTINGS tablet frame), because it is an ordinary control
            that names a consequence and not the solid red of Delete.
            docs/spec/16 §79 and `03` §79 define what it does: tokens and the
            personal caches go, the guest-browsable ones and the local
            theme/language/branch stay, which is why signing out leaves you
            browsing rather than at a wall. */}
        <View style={{ marginTop: spacing.lg }}>
          {isMember ? (
            <Button
              label={t('settings:signout')}
              variant="outline"
              tone="danger"
              fullWidth
              loading={signingOut}
              onPress={() => {
                setSigningOut(true);
                void useAuthStore
                  .getState()
                  .signOut()
                  .catch(() => {
                    // The local session is gone either way (supabase-js clears
                    // it before the network call); saying otherwise would be a
                    // lie the next screen contradicts.
                  })
                  .finally(() => {
                    setSigningOut(false);
                    toast.show(t('settings:signedOut'));
                  });
              }}
            />
          ) : (
            <Button
              label={t('settings:signin')}
              variant="accent"
              fullWidth
              onPress={() => {
                router.push('/auth');
              }}
            />
          )}
        </View>

        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            color: colors.muted,
            textAlign: 'center',
            paddingTop: spacing.xl,
            paddingBottom: spacing.md,
          }}
        >
          {t('settings:appVersion', { version: appVersion })}
        </Text>
      </View>
    </Screen>
  );
}
