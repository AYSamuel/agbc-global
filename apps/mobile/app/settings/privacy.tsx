import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  hitTarget,
  icon,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import {
  AppHeader,
  Bullets,
  Button,
  ChevronRightIcon,
  MenuLabel,
  Screen,
} from '@/components/ui';
import { privacyUrl } from '@/lib/links';
import { useAuthStore } from '@/state/auth';
import { useTheme } from '@/theme';

/**
 * PRIVACY (frame `PRIVACY · plain-language`; docs/spec/16 §PRIVACY, `20`, `04`
 * line 137).
 *
 * `04` has listed this as a SCREEN since the navigation map was written, and
 * Settings had quietly replaced it with a row that opened the website. The
 * difference matters: the website's policy is the complete legal document, and
 * this is the plain-language summary somebody actually reads, with the three
 * things they can do about it in reach at the bottom.
 *
 * THE BULLETS ARE FACTS ABOUT THIS APP, so they were checked against the code
 * rather than copied from the frame, and three of the frame's claims were not
 * true of it (corrected there, with the reasoning recorded on the frame at
 * W4.6). No profile photo is collected: `profiles.avatar_url` is read by the
 * feed and written by nothing, so the photo we DO collect is the one attached to
 * a testimony, which now says so. No reading progress is collected either:
 * `reading_state` has no writer until the reader ships. And the device push
 * token was collected and unmentioned. A privacy notice that overstates is as
 * wrong as one that understates.
 *
 * THE DIAGNOSTICS LINE IS REQUIRED BY `20`, which says the notice states plainly
 * that analytics is opt-in and that crash reports are sent scrubbed. Its wording
 * is drawn from the copy already under the analytics switch, so the two places a
 * member reads about it cannot drift apart.
 *
 * STATIC SURFACE: everything here is bundled copy, so there is no loading, empty,
 * error or offline state to implement. The only variant is the delete line,
 * which a guest does not see because a guest has no account to remove, exactly
 * as the Settings row itself behaves.
 */
export default function Privacy() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const isMember = useAuthStore((s) => s.status === 'member');

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  }

  return (
    <Screen padded={false}>
      <AppHeader
        title={t('settings:privacy')}
        backLabel={t('back')}
        onBack={goBack}
      />

      {/* ONE gutter of 16 for the whole body, as DELETE and the SETTINGS hub do
          it, and load-bearing for the same reason: `MenuLabel` and `Bullets`
          each carry only `spacing.xs` because the frame's `.mlabel` and
          `.bullets` sit at 20 and expect the container to supply the other 16. */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 14.5,
            lineHeight: 14.5 * 1.55,
            color: colors.sub,
            paddingHorizontal: spacing.xs,
            paddingTop: 2,
          }}
        >
          {t('settings:privacyScreen.intro')}
        </Text>

        <MenuLabel label={t('settings:privacyScreen.collectLabel')} />
        <Bullets
          items={[
            t('settings:privacyScreen.collectEmail'),
            t('settings:privacyScreen.collectProfile'),
            t('settings:privacyScreen.collectPosts'),
            t('settings:privacyScreen.collectActivity'),
            t('settings:privacyScreen.collectDevice'),
          ]}
        />

        <MenuLabel label={t('settings:privacyScreen.useLabel')} />
        <Bullets
          items={[
            t('settings:privacyScreen.useAccount'),
            t('settings:privacyScreen.useNotifications'),
            t('settings:privacyScreen.useSafety'),
            t('settings:privacyScreen.useDiagnostics'),
            t('settings:privacyScreen.useNeverSell'),
          ]}
        />

        <MenuLabel label={t('settings:privacyScreen.moderationLabel')} />
        <Prose>{t('settings:privacyScreen.moderationBody')}</Prose>

        <MenuLabel label={t('settings:privacyScreen.choicesLabel')} />
        <Prose>{t('settings:privacyScreen.choicesBody')}</Prose>

        {/* The frame's outline button. CONTACT is the data-request route: `16`
            asks for "contact for data requests", and the app already has one
            form that reaches the church rather than a mailto nobody monitors. */}
        <View style={{ paddingTop: spacing.md }}>
          <Button
            variant="outline"
            label={t('settings:privacyScreen.contactAction')}
            onPress={() => {
              router.push('/contact');
            }}
          />
        </View>

        {/* `.linkrow`. Out to the full policy, in the reader's language (W4.6
            slice 2), because this summary is deliberately not the legal text. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('settings:privacyScreen.fullPolicy')}
          onPress={() => {
            void WebBrowser.openBrowserAsync(privacyUrl(i18n.language));
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
            marginTop: 14,
            minHeight: hitTarget.min,
            backgroundColor: pressed ? colors.alt : colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.button,
            paddingVertical: 14,
            paddingHorizontal: spacing.lg,
          })}
        >
          <Text
            style={{
              flex: 1,
              fontFamily: fontFamily.body.bold,
              fontSize: 14.5,
              color: colors.text,
            }}
          >
            {t('settings:privacyScreen.fullPolicy')}
          </Text>
          <ChevronRightIcon size={icon.lg} color={colors.muted} />
        </Pressable>

        {/* `.alwayson`, and members only: a guest has no account to remove.
            THE WHOLE LINE IS THE TARGET, not just the red words. The frame draws
            a 12px inline link, which is a 18px-tall touch area, and W4.7 spent a
            slice on exactly this class of miss. Nothing destructive is one tap
            away: DELETE is itself all friction. */}
        {isMember ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('settings:privacyScreen.deletePrompt')} ${t('settings:privacyScreen.deleteAction')}`}
            onPress={() => {
              router.push('/settings/delete');
            }}
            style={({ pressed }) => ({
              justifyContent: 'center',
              minHeight: hitTarget.min,
              paddingHorizontal: spacing.xs,
              paddingTop: spacing.md,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12,
                lineHeight: 18,
                color: colors.muted,
              }}
            >
              {t('settings:privacyScreen.deletePrompt')}{' '}
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  color: palette.red,
                }}
              >
                {t('settings:privacyScreen.deleteAction')}
              </Text>
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

/** The frame's `.aboutsec p`: a short paragraph under a section label. */
function Prose({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: fontFamily.body.regular,
        fontSize: 14.5,
        lineHeight: 14.5 * 1.6,
        color: colors.sub,
        paddingHorizontal: spacing.xs,
      }}
    >
      {children}
    </Text>
  );
}
