import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { fontFamily, icon, palette, spacing } from '@agbc/shared/theme';

import { ActionSheet, Button, HomeTabIcon, useToast } from '@/components/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { BranchRow } from '@/features/onboarding/BranchRow';
import { BRANCHES_SNAPSHOT } from '@/features/onboarding/branches-snapshot';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import { useBranchHasClosed, useRehome } from '@/features/rehome/queries';
import { useTheme } from '@/theme';

/**
 * RE-HOME (frames approved 2026-08-21): the member's half of a branch that has closed.
 *
 * `02` promises this exactly: a member whose home branch is archived is asked on next
 * launch to pick a new one, HQ offered first. It is the ONE branch change that needs no
 * approval and ignores the 90-day settle, because there is no branch left to stay in and no
 * leader to ask.
 *
 * IT DOES NOT GATE THE APP, and that was decided rather than inherited (with Ayo,
 * 2026-08-20). Browsing has never required a branch, and `02` already assumes a member can
 * go un-homed for a while, since it withholds only the branch TIER of notifications
 * meanwhile. So this screen can be put off, and Home carries a card that cannot.
 *
 * THE LIST IS THE OPEN BRANCHES, from the same shared query every other picker uses, which
 * is why the closed one cannot appear in it. HQ leads because `02` says so and because it is
 * the one branch that can never itself close.
 *
 * If the branch has been re-opened between launch and now, or the member re-homed on another
 * device, this screen has nothing to ask: it leaves rather than offering a choice the
 * database would refuse.
 */
export default function RehomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();

  const { closed, branch } = useBranchHasClosed();
  const branches = useBranchesQuery();
  const rehome = useRehome();

  const [chosen, setChosen] = useState<string | null>(null);
  // Separate from `chosen` on purpose. The frame selects a row FIRST (the radio and its
  // check) and confirms on the primary, unlike BRANCH-CHANGE where tapping a row opens the
  // sheet straight away. Driving the sheet off `chosen` would make every exploratory tap a
  // confirmation prompt.
  const [confirming, setConfirming] = useState(false);

  // `BRANCHES_SNAPSHOT` is the bundled fallback every branch surface falls back to offline
  // (W1.1). It is right here too: a member with no connection can still read the list and
  // choose, and the write itself will fail loudly rather than silently.
  const list = branches.data ?? BRANCHES_SNAPSHOT;

  // HQ IS OFFERED FIRST, which `02` asks for by name ("HQ preselected"). Derived rather
  // than held in state, so it lands the moment the list arrives without an effect that
  // could overwrite a choice the member has already made: their tap wins, and the
  // preselection is only what shows before there is one.
  const selected = chosen ?? list.find((one) => one.is_hq)?.id ?? list[0]?.id;
  const chosenBranch = list.find((one) => one.id === selected);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  return (
    <AuthLayout
      title={t('settings:rehome.title', { branch: branch?.name ?? '' })}
      lead={t('settings:rehome.lead')}
      icon={
        <HomeTabIcon size={icon.x2l} color={palette.navy} strokeWidth={1.8} />
      }
    >
      {/* The mockup's `.pickrow`: what is true right now, which here is a cost rather than
          a place. It is the reason to choose today instead of next month. */}
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
          {t('settings:rehome.untilYouChoose')}
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
          {t('settings:rehome.noBranchNews')}
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
        {t('settings:rehome.whereNow')}
      </Text>

      {/* Scrolls: the list grows with the ministry, and at 200% text three branches already
          fill a phone (mobile.md: never assume a fixed viewport height). */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {list.map((one) => (
          <BranchRow
            key={one.id}
            branch={one}
            selected={selected === one.id}
            onSelect={() => {
              setChosen(one.id);
            }}
          />
        ))}
      </ScrollView>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg - 2 }}>
        <Button
          label={t('settings:rehome.choose')}
          onPress={() => {
            // Nothing selected yet: the frame's primary is always present, so it says what
            // is missing rather than sitting dead under a list nobody has touched.
            if (!chosenBranch) {
              toast.show(t('settings:rehome.pickOne'));
              return;
            }
            setConfirming(true);
          }}
        />
        <Button
          label={t('settings:rehome.notNow')}
          variant="ghost"
          onPress={leave}
        />
      </View>

      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 12.5,
          lineHeight: 19,
          color: colors.muted,
          textAlign: 'center',
          marginTop: spacing.md,
        }}
      >
        {t('settings:rehome.note')}
      </Text>

      {/* The confirm (kept with Ayo, 2026-08-21). It says the thing that makes this act
          unlike every other branch change: it lands immediately, because there is nobody
          left to ask. */}
      <ActionSheet
        visible={confirming && chosenBranch !== undefined && closed}
        icon={
          <HomeTabIcon size={icon.x2l} color={palette.navy} strokeWidth={1.8} />
        }
        title={t('settings:rehome.confirmTitle', {
          branch: chosenBranch?.name ?? '',
        })}
        body={t('settings:rehome.confirmBody', {
          branch: chosenBranch?.name ?? '',
        })}
        primaryLabel={t('settings:rehome.confirmYes')}
        secondaryLabel={t('settings:rehome.confirmPickAnother')}
        dismissAnnouncement={t('settings:rehome.dismissed')}
        onPrimary={() => {
          if (!chosenBranch) return;
          rehome.mutate(
            {
              id: chosenBranch.id,
              slug: chosenBranch.slug,
              name: chosenBranch.name,
              timezone: chosenBranch.timezone,
            },
            {
              onSuccess: () => {
                setConfirming(false);
                setChosen(null);
                toast.show(
                  t('settings:rehome.settled', { branch: chosenBranch.name }),
                );
                leave();
              },
              onError: () => {
                setConfirming(false);
                toast.show(t('settings:rehome.failed'));
              },
            },
          );
        }}
        onDismiss={() => {
          // The row stays selected: "pick a different one" means the list, with their
          // choice still showing, not a cleared screen.
          setConfirming(false);
        }}
      />
    </AuthLayout>
  );
}
