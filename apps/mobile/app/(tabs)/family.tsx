import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, spacing } from '@agbc/shared/theme';

import {
  EmptyState,
  FamilyTabIcon,
  GateSheet,
  Screen,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { AnsweredPrayerCard, PrayerCard } from '@/features/family/PrayerCard';
import {
  usePrayerFeedQuery,
  useTestimonyFeedQuery,
  type FamilyScope,
} from '@/features/family/queries';
import { ScopeToggle } from '@/features/family/ScopeToggle';
import { TestimonyCard } from '@/features/family/TestimonyCard';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useFamilyRealtime } from '@/features/family/useFamilyRealtime';
import { StubIcon } from '@/features/shell/StubIcon';
import { useBranchStore } from '@/state/branch';
import { useTheme } from '@/theme';

// docs/spec/09 specifies three sub-tabs: Testimonies, Prayer, Map. The Map lands
// in the next slice on this branch (bundled topojson + projected branch pins, ADR
// 0009, agreed 2026-07-20) and its segment is deliberately ABSENT until then: a
// segment that opens a placeholder is a dead end, and docs/spec/04 does not allow
// one. Adding it back is a one-line change once FamilyMap exists.
type SubTab = 'testimonies' | 'prayer';

// FAMILY tab (docs/spec/09): the wedge. Read-only in W1.5; every contribution
// action opens the gate, and W2.2 wires gate-return so the action completes after
// sign-in. Feeds are realtime-first with a 60s polling bound (docs/spec/02).
export default function Family() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const branch = useBranchStore((s) => s.branch);

  const [tab, setTab] = useState<SubTab>('testimonies');
  // Everywhere is the default so "one family, many nations" is what you meet
  // first; narrowing to your branch is the deliberate act (docs/spec/09).
  const [scope, setScope] = useState<FamilyScope>('everywhere');
  const [gateVisible, setGateVisible] = useState(false);

  const branchId = branch?.id ?? null;
  const branchNames = useBranchNames();
  useFamilyRealtime(branchId);

  const testimonies = useTestimonyFeedQuery(scope, branchId);
  const prayers = usePrayerFeedQuery(scope, branchId);
  const active = tab === 'prayer' ? prayers : testimonies;

  const subhead =
    tab === 'testimonies'
      ? t('family:subheadTestimonies')
      : t('family:subheadPrayer');

  const openGate = () => {
    setGateVisible(true);
  };

  const renderFeed = () => {
    // Loading: skeleton cards at the real card height so nothing shifts when
    // content lands (mockup STATE loading). Primary actions stay hidden rather
    // than disabled while loading (project convention, 2026-07-20).
    if (active.data === undefined && !active.isError) {
      return (
        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={150} />
          ))}
        </View>
      );
    }

    // Error: only when there is nothing cached to show. With cached rows we keep
    // rendering them (stale-while-revalidate) rather than blanking the feed.
    if (active.isError && (active.data ?? []).length === 0) {
      return (
        <EmptyState
          title={t('errors:somethingWrong')}
          body={t('errors:couldntLoad')}
          actionLabel={t('errors:tryAgain')}
          onAction={() => {
            void active.refetch();
          }}
        />
      );
    }

    if (tab === 'testimonies') {
      const rows = testimonies.data ?? [];
      if (rows.length === 0) {
        return (
          <EmptyState
            title={t('family:emptyTestimoniesTitle')}
            body={t('family:emptyTestimoniesBody')}
            icon={<StubIcon Icon={FamilyTabIcon} />}
            actionLabel={t('family:shareTestimony')}
            onAction={openGate}
          />
        );
      }
      return rows.map((item) => (
        <TestimonyCard
          key={item.id}
          testimony={item}
          branchName={branchNames[item.branch_id] ?? null}
          onPress={() => {
            router.push({
              pathname: '/testimony/[id]',
              params: { id: item.id },
            });
          }}
          onGlory={openGate}
          onShare={openGate}
        />
      ));
    }

    const rows = prayers.data ?? [];
    if (rows.length === 0) {
      return (
        <EmptyState
          title={t('family:emptyPrayerTitle')}
          body={t('family:emptyPrayerBody')}
          icon={<StubIcon Icon={FamilyTabIcon} />}
          actionLabel={t('family:sharePrayer')}
          onAction={openGate}
        />
      );
    }
    return rows.map((item) =>
      item.answered_at ? (
        <AnsweredPrayerCard
          key={item.id}
          prayer={item}
          onPress={() => {
            router.push({ pathname: '/prayer/[id]', params: { id: item.id } });
          }}
        />
      ) : (
        <PrayerCard
          key={item.id}
          prayer={item}
          branchName={branchNames[item.branch_id] ?? null}
          onPress={() => {
            router.push({ pathname: '/prayer/[id]', params: { id: item.id } });
          }}
          onCommit={openGate}
        />
      ),
    );
  };

  return (
    <Screen widthClass="capped">
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: fontFamily.display.extraBold,
          fontSize: 26,
          letterSpacing: -0.52,
          color: colors.text,
          marginTop: spacing.md,
        }}
      >
        {t('tabs.family')}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 13.5,
          color: colors.sub,
          marginBottom: spacing.md,
        }}
      >
        {subhead}
      </Text>

      <SegmentedControl
        segments={[
          { key: 'testimonies', label: t('family:tabTestimonies') },
          { key: 'prayer', label: t('family:tabPrayer') },
        ]}
        value={tab}
        onChange={setTab}
        accessibilityLabel={t('family:sectionLabel')}
      />

      <View style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        <ScopeToggle
          value={scope}
          onChange={setScope}
          branchName={branch?.name ?? null}
        />
      </View>

      <View style={{ marginTop: spacing.sm }}>{renderFeed()}</View>

      <GateSheet
        visible={gateVisible}
        title={t('family:gateTitle')}
        body={t('family:gateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('family:gateDismissed')}
        onSignIn={() => {
          setGateVisible(false);
          router.push('/auth');
        }}
        onDismiss={() => {
          setGateVisible(false);
        }}
      />
    </Screen>
  );
}
