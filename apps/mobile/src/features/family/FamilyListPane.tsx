import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, spacing } from '@agbc/shared/theme';

import { EmptyState, SegmentedControl, Skeleton } from '@/components/ui';
import { useTheme } from '@/theme';

import { joinMeta } from './format';
import { AnsweredPrayerCard } from './PrayerCard';
import { PrayerRow } from './PrayerRow';
import {
  usePrayerFeedQuery,
  useTestimonyFeedQuery,
  type PrayerFeedItem,
  type TestimonyFeedItem,
} from './queries';
import { ScopeToggle } from './ScopeToggle';
import { shareText, testimonyShareText } from './share';
import { TestimonyCard } from './TestimonyCard';
import { useBranchColors } from './useBranchColors';
import { useBranchNames } from './useBranchNames';
import { useFamilyViewStore } from './viewState';

import { useBranchStore } from '@/state/branch';

/**
 * The list half of FAMILY's tablet two-pane (mockup `FAMILY · tablet landscape ·
 * feed + detail`, the `.pane-list` block): the same title, scope pills and
 * sub-tabs the phone has, over the same cards, with the open post held selected.
 *
 * THE SELECTED CARD IS A BLUE BORDER, not the wash WATCH's rows use. That is the
 * frame's own choice and worth keeping straight: a `.rrow` is a row in a list,
 * so a wash reads as "this line"; a `.testi` is already a bordered card, so the
 * border is what it has to say it with.
 *
 * It reads the sub-tab and scope from the shared store rather than holding its
 * own, so the feed beside an open post is the feed you were reading when you
 * opened it (see `viewState`).
 */
export interface FamilyListPaneProps {
  /** The post the detail pane is showing, from the route. */
  selectedId: string | null;
}

export function FamilyListPane({ selectedId }: FamilyListPaneProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const branchNames = useBranchNames();
  const branchColorFor = useBranchColors();
  const branch = useBranchStore((s) => s.branch);
  const branchId = branch?.id ?? null;

  const tab = useFamilyViewStore((s) => s.tab);
  const setTab = useFamilyViewStore((s) => s.setTab);
  const scope = useFamilyViewStore((s) => s.scope);
  const setScope = useFamilyViewStore((s) => s.setScope);

  // Same guard the tab applies: "My branch" without a chosen branch would
  // skeleton-lock on a disabled query, so it falls back to Everywhere.
  const effectiveScope = branchId ? scope : 'everywhere';
  const testimonies = useTestimonyFeedQuery(effectiveScope, branchId);
  const prayers = usePrayerFeedQuery(effectiveScope, branchId);
  const active = tab === 'prayer' ? prayers : testimonies;

  type Row =
    | { kind: 'testimony'; item: TestimonyFeedItem }
    | { kind: 'prayer'; item: PrayerFeedItem };

  const rows: Row[] =
    tab === 'prayer'
      ? (prayers.data ?? []).map((item) => ({ kind: 'prayer' as const, item }))
      : (testimonies.data ?? []).map((item) => ({
          kind: 'testimony' as const,
          item,
        }));

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.item.id}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.screenTop,
        paddingBottom: insets.bottom + spacing.x2l,
      }}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 12 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fontFamily.display.extraBold,
              fontSize: 26,
              letterSpacing: -0.52,
              color: colors.text,
              marginBottom: spacing.sm,
            }}
          >
            {t('tabs.family')}
          </Text>
          <ScopeToggle
            value={effectiveScope}
            onChange={setScope}
            branchName={branch?.name ?? null}
          />
          <View style={{ marginTop: spacing.sm }}>
            {/* Map is absent on purpose: a map has no detail pane to sit beside,
                so the two-pane offers only the two feeds. Tapping Family in the
                rail returns to the full tab, map included. */}
            <SegmentedControl
              accessibilityLabel={t('family:sectionLabel')}
              segments={[
                { key: 'testimonies', label: t('family:tabTestimonies') },
                { key: 'prayer', label: t('family:tabPrayer') },
              ]}
              value={tab === 'prayer' ? 'prayer' : 'testimonies'}
              onChange={(key) => {
                setTab(key);
              }}
            />
          </View>
        </View>
      }
      ListEmptyComponent={
        active.data === undefined && !active.isError ? (
          <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <EmptyState
              title={
                active.isError
                  ? t('errors:somethingWrong')
                  : tab === 'prayer'
                    ? t('family:emptyPrayerTitle')
                    : t('family:emptyTestimoniesTitle')
              }
              body={
                active.isError
                  ? t('errors:couldntLoad')
                  : tab === 'prayer'
                    ? t('family:emptyPrayerBody')
                    : t('family:emptyTestimoniesBody')
              }
              {...(active.isError
                ? {
                    actionLabel: t('errors:tryAgain'),
                    onAction: () => {
                      void active.refetch();
                    },
                  }
                : {})}
            />
          </View>
        )
      }
      renderItem={({ item: row }) => {
        const selected = row.item.id === selectedId;
        return (
          // The selection belongs to the CARD, not to this padded row. Ringing
          // the wrapper drew the border a whole gutter outside the card, which
          // read as "the space is selected" rather than "this post is" (Ayo,
          // 2026-09-02). The frame sets `border-color` on the `.testi` itself,
          // so `selected` goes down to the card and recolours its own border.
          <View style={{ paddingHorizontal: spacing.lg }}>
            {row.kind === 'testimony' ? (
              <TestimonyCard
                selected={selected}
                testimony={row.item}
                branchName={branchNames[row.item.branch_id] ?? null}
                branchColor={branchColorFor(row.item.branch_id)}
                scope={effectiveScope}
                onPress={() => {
                  router.navigate({
                    pathname: '/testimony/[id]',
                    params: { id: row.item.id },
                  });
                }}
                onGloryGate={() => {
                  router.navigate('/auth');
                }}
                onShare={() => {
                  void shareText(
                    testimonyShareText(
                      row.item.body,
                      joinMeta([
                        row.item.author_name,
                        branchNames[row.item.branch_id] ?? null,
                      ]),
                      t('appName'),
                    ),
                  );
                }}
              />
            ) : row.item.answered_at ? (
              <AnsweredPrayerCard
                prayer={row.item}
                onPress={() => {
                  router.navigate({
                    pathname: '/prayer/[id]',
                    params: { id: row.item.id },
                  });
                }}
              />
            ) : (
              <PrayerRow
                selected={selected}
                prayer={row.item}
                branchName={branchNames[row.item.branch_id] ?? null}
                scope={effectiveScope}
                onOpen={() => {
                  router.navigate({
                    pathname: '/prayer/[id]',
                    params: { id: row.item.id },
                  });
                }}
                onGate={() => {
                  router.navigate('/auth');
                }}
              />
            )}
          </View>
        );
      }}
    />
  );
}
