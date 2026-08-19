import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  EmptyState,
  MenuLabel,
  Screen,
  Skeleton,
  ToggleList,
  ToggleRow,
} from '@/components/ui';
import { useNotificationAskStore } from '@/features/notifications/ask';
import {
  permissionState,
  type PermissionState,
} from '@/features/notifications/permission';
import { usePrefs, useSetPref } from '@/features/notifications/prefs';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useAuthStore } from '@/state/auth';
import { useTheme } from '@/theme';

/**
 * NOTIF-PREFS (docs/spec/15 tiers; frames `NOTIF-PREFS · category toggles` and
 * `NOTIF-PREFS · push disabled (OS)`).
 *
 * Five switches over six columns: the prayer control writes both prayer columns
 * (W3.3 decision 2, the frame's own caption). Transactional confirmations have
 * no switch on purpose: they answer something the member did, and the footer
 * line says so instead of offering a control that could not honestly exist.
 *
 * The OS banner appears when the OS has push off AND this app has already had
 * its one ask (ask.ts's persisted flag): before the ask, the value moment
 * still owns the conversation and a banner would jump its queue. The ask flag
 * is the signal, NOT `canAskAgain`: instrumented on device (2026-08-19), a
 * revoked or even user-fixed denial still reports `canAskAgain: true` here,
 * because Android's rationale bit only means anything after an in-process
 * request, so a mapping built on it can never reach `denied` from the state
 * this banner exists for. The in-app log keeps working either way (docs/spec/15
 * push-denied state), so the toggles stay live rather than greying out.
 * Permission is re-read on focus, because the member may come BACK from the
 * very settings screen the banner sends them to.
 */
export default function NotificationPrefsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = useAuthStore((state) => state.status);

  const signedIn = status === 'member';
  const profile = useAuthStore((state) => state.profile);
  const branchNames = useBranchNames();
  const branchName =
    profile !== null ? (branchNames[profile.branchId] ?? '') : '';
  const prefs = usePrefs(signedIn);
  const setPref = useSetPref();
  const asked = useNotificationAskStore((state) => state.asked);
  const [permission, setPermission] = useState<PermissionState>('granted');

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void permissionState().then((state) => {
        if (live) setPermission(state);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  const osOff =
    asked && permission !== 'granted' && permission !== 'unavailable';

  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t('notifications:prefsTitle')}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/settings');
        }}
        backLabel={t('common:back')}
      />

      <View style={{ paddingHorizontal: spacing.lg }}>
        {osOff ? (
          <View
            style={{
              // Mockup .osbanner: the alt surface with a cardline hairline.
              marginTop: 6,
              backgroundColor: colors.alt,
              borderWidth: 1,
              borderColor: colors.cardline,
              borderRadius: radius.cardTight,
              paddingVertical: 13,
              paddingHorizontal: 15,
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13,
                lineHeight: 13 * 1.45,
                color: colors.text,
                marginBottom: 10,
              }}
            >
              {t('notifications:osOffBody')}
            </Text>
            <Button
              label={t('notifications:osOffAction')}
              variant="outline"
              fullWidth
              onPress={() => {
                void Linking.openSettings();
              }}
            />
          </View>
        ) : null}

        <MenuLabel label={t('notifications:prefsSection')} />

        {!signedIn || prefs.isPending ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : prefs.isError ? (
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void prefs.refetch();
            }}
          />
        ) : (
          <ToggleList>
            {/* Titles and captions are the CHANNEL names and descriptions (one
                source for the copy: the Android channel and its switch must
                never describe two different things). The branch caption is the
                frame's one data-driven region: the member's own branch name. */}
            <ToggleRow
              title={t('notifications:channels.ministry.name')}
              body={t('notifications:channels.ministry.description')}
              value={prefs.data.ministryAnnouncements}
              onValueChange={(next) => {
                setPref.mutate({ toggle: 'ministry_announcements', next });
              }}
            />
            <ToggleRow
              title={t('notifications:channels.branch.name')}
              body={
                branchName === ''
                  ? t('notifications:channels.branch.description')
                  : t('notifications:branchBody', { branch: branchName })
              }
              value={prefs.data.branchUpdates}
              onValueChange={(next) => {
                setPref.mutate({ toggle: 'branch_updates', next });
              }}
            />
            <ToggleRow
              title={t('notifications:channels.serviceReminders.name')}
              body={t('notifications:channels.serviceReminders.description')}
              value={prefs.data.serviceReminders}
              onValueChange={(next) => {
                setPref.mutate({ toggle: 'service_reminders', next });
              }}
            />
            <ToggleRow
              title={t('notifications:channels.prayer.name')}
              body={t('notifications:channels.prayer.description')}
              value={prefs.data.prayerActivity}
              onValueChange={(next) => {
                setPref.mutate({ toggle: 'prayer_activity', next });
              }}
            />
            <ToggleRow
              title={t('notifications:channels.testimony.name')}
              body={t('notifications:channels.testimony.description')}
              value={prefs.data.testimonyActivity}
              onValueChange={(next) => {
                setPref.mutate({ toggle: 'testimony_activity', next });
              }}
            />
          </ToggleList>
        )}

        <Text
          style={{
            // Mockup .alwayson: 12px muted, at the frame's 20px side inset
            // (the screen's 16 plus this 4).
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            lineHeight: 12 * 1.5,
            color: colors.muted,
            paddingHorizontal: spacing.xs,
            paddingTop: spacing.md,
            paddingBottom: 18,
          }}
        >
          {t('notifications:alwaysOn')}
        </Text>
      </View>
    </Screen>
  );
}
