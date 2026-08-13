import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, spacing } from '@agbc/shared/theme';

import {
  EmptyState,
  Fab,
  FamilyTabIcon,
  GateSheet,
  Screen,
  SegmentedControl,
  Skeleton,
  useManualRefresh,
} from '@/components/ui';
import { FamilyMap } from '@/features/family/FamilyMap';
import { joinMeta } from '@/features/family/format';
import { useBlockedAuthorIds } from '@/features/family/moderation';
import { AnsweredPrayerCard, PrayerCard } from '@/features/family/PrayerCard';
import {
  usePrayerFeedQuery,
  useTestimonyFeedQuery,
  type FamilyScope,
  type PrayerFeedItem,
} from '@/features/family/queries';
import { ScopeToggle } from '@/features/family/ScopeToggle';
import { shareText, testimonyShareText } from '@/features/family/share';
import { TestimonyCard } from '@/features/family/TestimonyCard';
import { useBranchColors } from '@/features/family/useBranchColors';
import { useIntercessionPress } from '@/features/family/useIntercession';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useFamilyRealtime } from '@/features/family/useFamilyRealtime';
import { useMapBranches } from '@/features/family/useMapBranches';
import { StubIcon } from '@/features/shell/StubIcon';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { useGateStore, type GateAction } from '@/state/gate';
import { useTheme } from '@/theme';

// docs/spec/09: three sub-tabs (Testimonies, Prayer, Map; ADR 0009).
type SubTab = 'testimonies' | 'prayer' | 'map';

function asSubTab(value: string | string[] | undefined): SubTab | null {
  return value === 'testimonies' || value === 'prayer' || value === 'map'
    ? value
    : null;
}

// FAMILY tab (docs/spec/09): the wedge. Read-only in W1.5; every contribution
// action opens the gate, and W2.2 wires gate-return so the action completes after
// sign-in. Feeds are realtime-first with a 60s polling bound (docs/spec/02).
export default function Family() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const branch = useBranchStore((s) => s.branch);
  const isMember = useAuthStore((s) => s.status === 'member');

  // The sub-tab is local state the segmented control drives, but a caller can
  // land the user on a specific one: Home's "From the family > See all" pushes
  // `?tab=testimonies` (with a nonce `k` so a repeat tap still re-applies it).
  // Applied with React's "adjust state on a changed prop" pattern (no effect):
  // track the nonce and set the tab during render when it changes.
  const params = useLocalSearchParams<{ tab?: string; k?: string }>();
  const [tab, setTab] = useState<SubTab>(asSubTab(params.tab) ?? 'testimonies');
  const [lastNav, setLastNav] = useState(params.k);
  if (params.k !== lastNav) {
    setLastNav(params.k);
    const requested = asSubTab(params.tab);
    if (requested) setTab(requested);
  }
  // Everywhere is the default so "one family, many nations" is what you meet
  // first; narrowing to your branch is the deliberate act (docs/spec/09).
  const [scope, setScope] = useState<FamilyScope>('everywhere');
  const [gateVisible, setGateVisible] = useState(false);

  const branchId = branch?.id ?? null;
  // Guard: "My branch" needs a chosen branch. If it is somehow selected without
  // one, fall back to Everywhere so the feed loads instead of skeleton-locking on
  // a disabled query (the ScopeToggle also disables the option in that state).
  const effectiveScope: FamilyScope = branchId ? scope : 'everywhere';
  const branchNames = useBranchNames();
  const branchColorFor = useBranchColors();
  const mapBranches = useMapBranches();
  // The feed VIEWS already filter blocked authors both ways; a broadcast cannot,
  // because one payload goes to every subscriber (docs/spec/02). So the live drop is
  // the client's last step, and its list is the same query the Blocked members screen
  // reads rather than a second copy of who is blocked.
  useFamilyRealtime(branchId, useBlockedAuthorIds());

  const testimonies = useTestimonyFeedQuery(effectiveScope, branchId);
  const prayers = usePrayerFeedQuery(effectiveScope, branchId);
  const active = tab === 'prayer' ? prayers : testimonies;
  // Only a pull shows the spinner: a reaction refreshing its caches in the
  // background must not look like the screen reloading (see useManualRefresh).
  const manualRefresh = useManualRefresh(() => active.refetch());

  const subhead =
    tab === 'testimonies'
      ? t('family:subheadTestimonies')
      : tab === 'prayer'
        ? t('family:subheadPrayer')
        : t('family:subheadMap');

  // Wrapped setters so the two events follow the state writes they describe,
  // and only real transitions count: both controls report taps on the segment
  // that is already selected. The deep-link path above (the nonce block) runs
  // during render and deliberately does not fire; nothing pushes `tab=map`
  // today, so every way onto the map goes through here.
  const changeTab = (next: SubTab) => {
    if (next === 'map' && tab !== 'map') {
      track('map_opened', { scope: effectiveScope });
    }
    setTab(next);
  };
  const changeScope = (to: FamilyScope) => {
    if (to !== effectiveScope) track('scope_toggled', { to });
    setScope(to);
  };

  // Gate-return (W2.2): each trigger passes its typed action so AUTH-4 can
  // replay it; the sheet title follows the action (docs/spec/03 framing).
  const [gateAction, setGateAction] = useState<GateAction | null>(null);
  const openGate = (action: GateAction) => {
    // The funnel's first half (docs/spec/22 §5): the sheet became visible, with
    // the action the guest was reaching for. Beside the visibility write, since
    // that state has no store to own it.
    track('gate_shown', { action_type: action.kind });
    setGateAction(action);
    setGateVisible(true);
  };

  // W2.3: the composer exists now, so a signed-in member goes straight there
  // and only a guest meets the gate (which then replays this exact action after
  // sign-in, docs/spec/03). Membership is a UI routing decision; the write
  // itself is still refused server-side for anyone else (docs/spec/02).
  const startCompose = (target: 'testimony' | 'prayer') => {
    if (isMember) {
      router.push(
        target === 'prayer' ? '/prayer/compose' : '/testimony/compose',
      );
      return;
    }
    openGate({ kind: 'compose', target });
  };
  const gateTitle =
    gateAction?.kind === 'intercede'
      ? t('family:gatePrayerTitle')
      : gateAction?.kind === 'compose'
        ? t('family:gateComposeTitle')
        : t('family:gateTitle');

  // The share FAB (mockup .fab) shows on a populated feed only: the empty state
  // carries its own centred "Share" CTA, and a map has nothing to compose.
  const showFab = tab !== 'map' && (active.data?.length ?? 0) > 0;

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
            onAction={() => {
              startCompose('testimony');
            }}
          />
        );
      }
      return rows.map((item) => {
        const branchName = branchNames[item.branch_id] ?? null;
        return (
          <TestimonyCard
            key={item.id}
            testimony={item}
            branchName={branchName}
            branchColor={branchColorFor(item.branch_id)}
            // This screen is the one surface with a scope; the tap's event
            // carries it from here (docs/spec/22 §5, W2.4's one-owner rule).
            scope={effectiveScope}
            onPress={() => {
              router.push({
                pathname: '/testimony/[id]',
                params: { id: item.id },
              });
            }}
            onGloryGate={() => {
              openGate({ kind: 'glory', testimonyId: item.id });
            }}
            // Sharing is outbound, not a gated contribution: open the OS sheet.
            onShare={() => {
              void shareText(
                testimonyShareText(
                  item.body,
                  joinMeta([item.author_name, branchName]),
                  t('appName'),
                ),
              );
            }}
          />
        );
      });
    }

    const rows = prayers.data ?? [];
    if (rows.length === 0) {
      return (
        <EmptyState
          title={t('family:emptyPrayerTitle')}
          body={t('family:emptyPrayerBody')}
          icon={<StubIcon Icon={FamilyTabIcon} />}
          actionLabel={t('family:sharePrayer')}
          onAction={() => {
            startCompose('prayer');
          }}
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
        <PrayerRow
          key={item.id}
          prayer={item}
          branchName={branchNames[item.branch_id] ?? null}
          scope={effectiveScope}
          onOpen={() => {
            router.push({ pathname: '/prayer/[id]', params: { id: item.id } });
          }}
          onGate={() => {
            openGate({ kind: 'intercede', prayerId: item.id });
          }}
        />
      ),
    );
  };

  // The top chrome is shared by every sub-tab; only the body below it differs
  // (a scrolling feed vs a full-height map). The scope toggle now shows on the
  // map too (docs/spec/09): there it narrows the recent-testimony pins and the
  // "family, lately" sheet to your branch, while every branch stays pinned.
  const header = (
    <>
      {/* Title + subhead sit at the 20px gutter (mockup .stitle/.subhead 20). */}
      <View style={{ paddingHorizontal: spacing.gutter }}>
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
      </View>

      {/* The toggles align with the cards at 16px, not the title's 20px (mockup
          .seg / .scoperow2 both margin 16). */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <SegmentedControl
          segments={[
            { key: 'testimonies', label: t('family:tabTestimonies') },
            { key: 'prayer', label: t('family:tabPrayer') },
            { key: 'map', label: t('family:tabMap') },
          ]}
          value={tab}
          onChange={changeTab}
          accessibilityLabel={t('family:sectionLabel')}
        />

        <View style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
          <ScopeToggle
            value={effectiveScope}
            onChange={changeScope}
            branchName={branch?.name ?? null}
          />
        </View>
      </View>
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      {tab === 'map' ? (
        // Non-scrolling: the header is fixed and the map fills the rest. Full-bleed
        // (padded={false}) and no bottom inset so the sheet meets the tab bar,
        // which already owns the home-indicator inset.
        <Screen
          scroll={false}
          padded={false}
          bottomInset={false}
          widthClass="capped"
        >
          {header}
          <View style={{ flex: 1, marginTop: spacing.sm }}>
            <FamilyMap
              branches={mapBranches}
              homeBranchId={branchId}
              testimonies={testimonies.data ?? []}
              testimoniesError={
                testimonies.isError && (testimonies.data ?? []).length === 0
              }
              onRetryTestimonies={() => {
                void testimonies.refetch();
              }}
              branchNames={branchNames}
              onOpenTestimony={(id) => {
                router.push({ pathname: '/testimony/[id]', params: { id } });
              }}
              onOpenBranch={(id) => {
                router.push({ pathname: '/branch/[id]', params: { id } });
              }}
            />
          </View>
        </Screen>
      ) : (
        <Screen
          widthClass="capped"
          padded={false}
          refreshing={manualRefresh.refreshing}
          onRefresh={manualRefresh.onRefresh}
        >
          {header}
          {/* Cards sit at 16px (mockup .testi/.prayer margin 16), inside the
              title's 20px gutter. */}
          <View
            style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}
          >
            {renderFeed()}
          </View>
          {/* Clears the last card from under the pinned FAB (mockup's spacer). */}
          {showFab ? <View style={{ height: 88 }} /> : null}
        </Screen>
      )}

      {showFab ? (
        <Fab
          label={
            tab === 'prayer' ? t('family:fabPrayer') : t('family:fabTestimony')
          }
          onPress={() => {
            startCompose(tab === 'prayer' ? 'prayer' : 'testimony');
          }}
        />
      ) : null}

      <GateSheet
        visible={gateVisible}
        title={gateTitle}
        body={t('family:gateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('family:gateDismissed')}
        onSignIn={() => {
          if (gateAction) useGateStore.getState().beginGateSignIn(gateAction);
          setGateVisible(false);
          router.push('/auth');
        }}
        onDismiss={() => {
          if (gateAction) useGateStore.getState().dismissGate(gateAction.kind);
          setGateVisible(false);
        }}
      />
    </View>
  );
}

/**
 * One prayer card. Its own component because the commitment hook has to be
 * called per row, and a hook cannot live inside the `map` that renders the feed.
 */
function PrayerRow({
  prayer,
  branchName,
  scope,
  onOpen,
  onGate,
}: {
  prayer: PrayerFeedItem;
  branchName: string | null;
  scope: FamilyScope;
  onOpen: () => void;
  onGate: () => void;
}) {
  const { commitment, onPress, onUndo } = useIntercessionPress(
    prayer,
    onGate,
    scope,
  );
  return (
    <PrayerCard
      prayer={prayer}
      branchName={branchName}
      commitment={commitment}
      onPress={onOpen}
      onCommit={onPress ?? (() => undefined)}
      onUndo={onUndo}
    />
  );
}
