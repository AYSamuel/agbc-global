import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  ChurchIcon,
  EmptyGlyph,
  EmptyState,
  HeartIcon,
  MenuLabel,
  NoteBanner,
  Screen,
  Skeleton,
  useManualRefresh,
} from '@/components/ui';
import { resolveAddressLine } from '@/features/home/address';
import { resolveNextService } from '@/features/home/nextService';
import { useBranchServicesQuery } from '@/features/home/queries';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import { resolveBranchList } from '@/features/onboarding/branchList';
import { AttendanceList } from '@/features/rhythm/AttendanceList';
import { heroContent } from '@/features/rhythm/heroContent';
import {
  useAttendanceQuery,
  useMilestonesQuery,
} from '@/features/rhythm/history';
import { aheadBadges, earnedBadges } from '@/features/rhythm/milestones';
import { MilestoneBadges } from '@/features/rhythm/MilestoneBadges';
import { NextMilestone } from '@/features/rhythm/NextMilestone';
import { useRhythmQuery } from '@/features/rhythm/queries';
import { StreakHero } from '@/features/rhythm/StreakHero';
import { WheneverReadyCard } from '@/features/rhythm/WheneverReadyCard';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { useGateStore } from '@/state/gate';

/**
 * RHYTHM · My Rhythm (docs/spec/10 §RHYTHM, docs/spec/04; mockup frames
 * "RHYTHM · streak, grace-framed" and the W2.8 `none` / `grace` / `lapsed`
 * states).
 *
 * THE SCREEN DECIDES NOTHING ABOUT THE RHYTHM ITSELF. `rhythm_state()` hands it
 * the state, the live run, the longest and the last service date; `attendance`
 * and `milestones` hand it their own rows. Which weeks counted, whether grace
 * carried one, and what day it is are all settled in SQL and asserted in pgTAP
 * 030. What is decided here is which of those numbers leads and what is said
 * about it, which is the whole of `10`'s "a streak is a gift, not a debt".
 *
 * Three things follow from that, and each is the frames' decision rather than
 * this file's taste:
 *  - LAPSED LEADS WITH THE LONGEST. `current_weeks` reads 0 there, and a 58px
 *    gold 0 is the scold `10` forbids.
 *  - THE GRACE WEEK IS NEVER DRAWN IN THE HISTORY, only said once, from
 *    `state = 'grace'`: as the hero's sentence and one gold banner you may
 *    ignore. Drawing it would mean the app working out which week is missing.
 *  - THE DEVOTIONAL SECTION IS OMITTED until W4.4. The approved active frame
 *    ends with a plan card, and there is no plan to route to yet; `07` and `10`
 *    both forbid routing into an empty PLAN.
 */
export default function RhythmScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const isMember = useAuthStore((state) => state.status === 'member');
  const branch = useBranchStore((state) => state.branch);
  const beginGateSignIn = useGateStore((state) => state.beginGateSignIn);

  // Keyed on the BROWSED branch, exactly as Home's strip is, so the two share
  // one cache entry and cannot disagree: "today" and `checked_in` are answered
  // in that branch's timezone (docs/spec/10).
  const rhythmQuery = useRhythmQuery(branch?.id ?? null, isMember);
  const attendanceQuery = useAttendanceQuery(isMember);
  const milestonesQuery = useMilestonesQuery(isMember);
  // Both already warm from the launch prefetch, and both persisted: the branch
  // list names the rows in the history, and the services feed the lapsed card.
  const branchesQuery = useBranchesQuery();
  const servicesQuery = useBranchServicesQuery(branch?.id ?? null);
  const branchNames = useBranchNames();

  const { refreshing, onRefresh } = useManualRefresh(() =>
    Promise.all([
      rhythmQuery.refetch(),
      attendanceQuery.refetch(),
      milestonesQuery.refetch(),
    ]),
  );

  const back = () => {
    // Reachable by deep link as well as from Home's strip, so "back" needs a
    // destination even with nothing behind it (docs/spec/04: no dead ends).
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const openBranch = () => {
    if (branch)
      router.push({ pathname: '/branch/[id]', params: { id: branch.id } });
    else router.push('/branches');
  };

  return (
    <Screen
      widthClass="capped"
      padded={false}
      refreshing={refreshing}
      onRefresh={isMember ? onRefresh : undefined}
    >
      <AppHeader
        title={t('rhythm:title')}
        onBack={back}
        backLabel={t('common:back')}
      />
      {body()}
    </Screen>
  );

  function body() {
    if (!isMember) {
      // Only reachable by deep link: Home shows the Join card to a guest, not a
      // strip to tap. Same machine as every other gate all the same, so signing
      // in lands back here rather than on Home (docs/spec/03 rule 9).
      return (
        <EmptyState
          title={t('rhythm:guestTitle')}
          body={t('rhythm:guestBody')}
          actionLabel={t('common:signIn')}
          onAction={() => {
            beginGateSignIn({ kind: 'rhythm' });
            router.push('/auth');
          }}
        />
      );
    }

    // One gate for all three reads rather than three independent ones: they are
    // one answer about one member, they go to the same server in the same
    // moment, and a half-loaded rhythm (a hero with no history under it) reads
    // as broken rather than as loading.
    const loading =
      rhythmQuery.isPending ||
      attendanceQuery.isPending ||
      milestonesQuery.isPending;
    if (loading) {
      return (
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Skeleton height={188} />
          <Skeleton height={124} />
          <Skeleton height={160} />
        </View>
      );
    }

    const rhythm = rhythmQuery.data ?? null;
    const failed =
      rhythmQuery.isError ||
      attendanceQuery.isError ||
      milestonesQuery.isError ||
      // No answer at all: no browsing branch is set, so there was nothing to
      // ask about. Retry is still the honest offer, because choosing a branch
      // and coming back is what fixes it.
      rhythm === null;
    if (failed) {
      return (
        <EmptyState
          title={t('errors:somethingWrong')}
          body={t('errors:couldntLoad')}
          actionLabel={t('errors:tryAgain')}
          onAction={onRefresh}
        />
      );
    }

    // Both are resolved by here: the gates above rule out pending and errored,
    // which is the whole point of taking them together.
    const kinds = milestonesQuery.data.map((row) => row.kind);
    const earned = earnedBadges(kinds);
    const entries = attendanceQuery.data;
    const hero = heroContent(rhythm, i18n.language, t);

    if (hero === null) {
      // `none`: nothing recorded yet. The invitation IS the screen (the frame's
      // `.empty`), and the ladder below it says what is ahead rather than what
      // is missing.
      return (
        <>
          <EmptyState
            icon={<EmptyGlyph Icon={ChurchIcon} />}
            title={t('rhythm:emptyTitle')}
            body={t('rhythm:emptyBody')}
            actionLabel={t('rhythm:emptyAction')}
            actionVariant="accent"
            onAction={openBranch}
          />
          {/* Not in the frame, because the frame draws a member with nothing at
              all. A content milestone is awarded on approval and owes nothing to
              Sundays, so somebody can stand here having already earned one, and
              this screen is the only place it is ever shown. */}
          {earned.length > 0 ? (
            <Section label={t('rhythm:milestonesLabel')}>
              <MilestoneBadges badges={earned} />
            </Section>
          ) : null}
          <Section label={t('rhythm:aheadLabel')}>
            <MilestoneBadges badges={aheadBadges(kinds)} tone="ahead" />
          </Section>
        </>
      );
    }

    const { branches } = resolveBranchList(branchesQuery);
    const current = branches.find((option) => option.id === branch?.id) ?? null;

    return (
      <>
        <StreakHero content={hero} />

        {rhythm.phase === 'grace' ? (
          // The ONE place the missed week is named, and it names it as covered
          // (`.linkbanner.gold`, the shape W2.7 made for a line you may ignore).
          <View
            style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
          >
            <NoteBanner
              tone="gold"
              icon={(accent) => <HeartIcon size={18} color={accent} />}
              lead={t('rhythm:graceLead')}
              body={t('rhythm:graceBody')}
            />
          </View>
        ) : null}

        {rhythm.phase === 'lapsed' ? (
          <WheneverReadyCard
            next={resolveNextService(
              servicesQuery.data ?? [],
              branch?.timezone ?? 'UTC',
              new Date(),
            )}
            displayTimes={[current?.service_times?.sunday].filter(
              (value): value is string => typeof value === 'string',
            )}
            branchName={branch?.name ?? ''}
            addressLine={resolveAddressLine(
              current?.address ?? null,
              branch?.name ?? '',
            )}
            onDetails={openBranch}
          />
        ) : null}

        {earned.length > 0 ? (
          <Section label={t('rhythm:milestonesLabel')}>
            <MilestoneBadges badges={earned} />
          </Section>
        ) : null}

        {/* Progress THROUGH a run, so only while one is running. A lapsed member
            has none, and counting them down to a rung they are not climbing is
            the nag `10` forbids. */}
        {rhythm.phase === 'active' || rhythm.phase === 'grace' ? (
          <NextMilestone weeks={rhythm.currentWeeks} />
        ) : null}

        {entries.length > 0 ? (
          <Section label={t('rhythm:attendanceLabel')}>
            <AttendanceList entries={entries} branchNames={branchNames} />
          </Section>
        ) : null}

        <View style={{ height: spacing.xl }} />
      </>
    );
  }
}

/**
 * The mockup's `.mlabel{padding:16px 20px 8px}`. `MenuLabel` is that type ramp
 * already (11/800/uppercase/muted, 16 above and 8 below); the wrapper supplies
 * the remaining 16 of its 20px inset, so a section header lines up with the
 * screen gutter while the cards under it keep the frame's narrower 16.
 */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <MenuLabel label={label} />
      </View>
      {children}
    </>
  );
}
