import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  palette,
  spacing,
} from '@agbc/shared/theme';

import { ActionSheet, ClockIcon, HomeTabIcon, useToast } from '@/components/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { mapAskError } from '@/features/branch-change/askErrors';
import { cooldownUntil } from '@/features/branch-change/cooldown';
import { useMyBranchRequests } from '@/features/branch-change/queries';
import { useAskToJoin } from '@/features/branch-change/useAskToJoin';
import { BranchRow } from '@/features/onboarding/BranchRow';
import { BRANCHES_SNAPSHOT } from '@/features/onboarding/branches-snapshot';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import { useMyProfile } from '@/features/profile/queries';
import { useTheme } from '@/theme';

/**
 * BRANCH-CHANGE · pick (docs/spec/16, ADR 0015): the only route to a home-branch change.
 *
 * SETTINGS ONLY, NEVER HOME, and the distinction is the whole point of the frame's title.
 * Home's branch chip changes what you are BROWSING and touches nothing; this changes where
 * you belong, and needs a leader at the other end to agree. Two different acts, and only
 * one of them asks anybody's permission.
 *
 * Borrows the auth flow's `.authwrap` layout, which is this app's language for a single
 * focused task: floating back button, gold icon tile, display title, lead, then the choice.
 *
 * THE 90-DAY SETTLE IS MET BEFORE THE CHOICE, not after it. `022`'s guard refuses the write
 * and would be a perfectly correct error, but a member who has just picked a branch and
 * pressed a button has already made a decision this screen knew was impossible. So the
 * sheet opens as soon as they arrive.
 */
export default function BranchChangeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();

  const profile = useMyProfile();
  const requests = useMyBranchRequests();
  const branches = useBranchesQuery();
  const ask = useAskToJoin();

  const [chosen, setChosen] = useState<string | null>(null);
  const [tooSoonSeen, setTooSoonSeen] = useState(false);

  const settledUntil = cooldownUntil(requests.data);
  const list = (branches.data ?? BRANCHES_SNAPSHOT).filter(
    (branch) => branch.id !== profile.data?.branchId,
  );
  const current = (branches.data ?? BRANCHES_SNAPSHOT).find(
    (branch) => branch.id === profile.data?.branchId,
  );
  const chosenBranch = list.find((branch) => branch.id === chosen);

  const askAgainOn = settledUntil
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
      }).format(settledUntil)
    : '';
  const movedOn = requests.data?.lastApproved?.decidedAt
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
      }).format(new Date(requests.data.lastApproved.decidedAt))
    : '';

  return (
    <AuthLayout
      title={t('settings:branchChange.title')}
      lead={t('settings:branchChange.lead')}
      icon={<HomeTabIcon size={icon.x2l} color={palette.navy} strokeWidth={1.8} />}
      backLabel={t('back')}
      onBack={() => {
        router.back();
      }}
    >
      {/* `.pickrow`: what is true right now, before anything is chosen. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.md,
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.cardline,
          borderRadius: 14,
          paddingVertical: spacing.lg - 2,
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.md,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 12,
            letterSpacing: 0.72,
            textTransform: 'uppercase',
            color: colors.muted,
          }}
        >
          {t('settings:branchChange.rightNow')}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 15,
            color: colors.text,
            flexShrink: 1,
            textAlign: 'right',
          }}
        >
          {current?.name ?? ''}
        </Text>
      </View>

      <Text
        style={{
          fontFamily: fontFamily.body.extraBold,
          fontSize: 11,
          letterSpacing: 2.6,
          textTransform: 'uppercase',
          color: palette.gold,
          marginTop: spacing.lg,
          marginBottom: spacing.sm + 2,
        }}
      >
        {t('settings:branchChange.moveTo')}
      </Text>

      {/* Scrolls: four branches today, and a longer list at 200% text must not push the
          note off the screen (mobile.md: never assume a fixed viewport height). */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {list.map((branch) => (
          <BranchRow
            key={branch.id}
            branch={branch}
            selected={chosen === branch.id}
            onSelect={() => {
              setChosen(branch.id);
            }}
          />
        ))}
      </ScrollView>

      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 12.5,
          lineHeight: 19,
          color: colors.muted,
          textAlign: 'center',
          marginTop: spacing.lg - 2,
        }}
      >
        {t('settings:branchChange.confirmedBy')}
      </Text>

      {/* Confirm: says plainly that nothing has changed yet. */}
      <ActionSheet
        visible={chosenBranch !== undefined && settledUntil === null}
        icon={<HomeTabIcon size={icon.x2l} color={palette.navy} strokeWidth={1.8} />}
        title={t('settings:branchChange.confirmTitle', {
          branch: chosenBranch?.name ?? '',
        })}
        body={t('settings:branchChange.confirmBody', {
          branch: chosenBranch?.name ?? '',
          current: current?.name ?? '',
        })}
        primaryLabel={t('settings:branchChange.ask')}
        secondaryLabel={t('settings:branchChange.notNow')}
        dismissAnnouncement={t('settings:branchChange.dismissed')}
        onPrimary={() => {
          if (!chosenBranch) return;
          ask.mutate(chosenBranch.id, {
            onSuccess: () => {
              setChosen(null);
              // Back to Profile, where the awaiting panel is now the answer.
              router.back();
            },
            onError: (error) => {
              setChosen(null);
              toast.show(t(`settings:branchChange.${mapAskError(error)}`));
            },
          });
        }}
        onDismiss={() => {
          setChosen(null);
        }}
      />

      {/* The 90-day settle, met on arrival rather than after a wasted choice. */}
      <ActionSheet
        visible={settledUntil !== null && !tooSoonSeen}
        icon={<ClockIcon size={icon.x2l} color={palette.navy} strokeWidth={1.8} />}
        title={t('settings:branchChange.tooSoonTitle', { date: askAgainOn })}
        body={t('settings:branchChange.tooSoonBody', {
          branch: current?.name ?? '',
          date: movedOn,
        })}
        primaryLabel={t('settings:branchChange.gotIt')}
        dismissAnnouncement={t('settings:branchChange.dismissed')}
        onPrimary={() => {
          setTooSoonSeen(true);
          router.back();
        }}
        onDismiss={() => {
          setTooSoonSeen(true);
          router.back();
        }}
      />
    </AuthLayout>
  );
}
