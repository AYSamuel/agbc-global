import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  EmptyState,
  Screen,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { EventRow } from '@/features/events/EventRow';
import { isPastEvent } from '@/features/events/format';
import { useEventsQuery } from '@/features/events/queries';
import { useBranchCities } from '@/features/events/useBranchCities';
import { useBranchStore } from '@/state/branch';
import { useTheme } from '@/theme';

type Range = 'upcoming' | 'past';

// EVENTS (docs/spec/11, mockup EVENTS frame): the browsing branch's events plus
// ministry-wide ones, tagged apart, with the upcoming/past toggle (the segmented
// control is composed; the frame shows only the "Upcoming" label). Rows open
// EVENT-DETAIL whatever their state: cancelled and past get their treatments
// there, never a dead link.
export default function Events() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const branch = useBranchStore((s) => s.branch);
  const query = useEventsQuery(branch?.id ?? null);
  const cities = useBranchCities();
  const [range, setRange] = useState<Range>('upcoming');

  const events = query.data ?? [];
  const now = new Date();
  const upcoming = events.filter(
    (event) => !isPastEvent(event.starts_at_local, event.timezone, now),
  );
  // Past runs newest-first: the most recent gathering is the relevant one.
  const past = events
    .filter((event) => isPastEvent(event.starts_at_local, event.timezone, now))
    .reverse();
  const visible = range === 'upcoming' ? upcoming : past;

  const renderList = () => {
    if (query.data === undefined && !query.isError) {
      return (
        <View style={{ gap: spacing.sm + 2, marginTop: spacing.sm }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={80} />
          ))}
        </View>
      );
    }
    // Error blanks only when nothing is cached (offline shows the cached list).
    if (query.isError && query.data === undefined) {
      return (
        <EmptyState
          title={t('errors:somethingWrong')}
          body={t('errors:couldntLoad')}
          actionLabel={t('errors:tryAgain')}
          onAction={() => {
            void query.refetch();
          }}
        />
      );
    }
    if (visible.length === 0) {
      return range === 'upcoming' ? (
        <EmptyState
          title={t('events:emptyUpcomingTitle')}
          body={t('events:emptyUpcomingBody')}
        />
      ) : (
        <EmptyState
          title={t('events:emptyPastTitle')}
          body={t('events:emptyPastBody')}
        />
      );
    }
    return (
      <View style={{ gap: spacing.sm + 2 }}>
        {visible.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            branchCity={
              event.branch_id === null
                ? null
                : (cities[event.branch_id] ?? null)
            }
            muted={range === 'past' || event.status === 'cancelled'}
            onPress={() => {
              router.push({
                pathname: '/event/[id]',
                params: { id: event.id },
              });
            }}
          />
        ))}
      </View>
    );
  };

  return (
    <Screen
      widthClass="capped"
      padded={false}
      refreshing={query.isRefetching}
      onRefresh={() => {
        void query.refetch();
      }}
    >
      <AppHeader
        title={t('events:title')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />

      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={{ marginTop: 6 }}>
          <SegmentedControl
            segments={[
              { key: 'upcoming', label: t('events:upcoming') },
              { key: 'past', label: t('events:past') },
            ]}
            value={range}
            onChange={(key) => {
              setRange(key === 'past' ? 'past' : 'upcoming');
            }}
            accessibilityLabel={t('events:rangeLabel')}
          />
        </View>

        {/* Mockup .mlabel above the rows. */}
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: colors.muted,
            paddingTop: spacing.lg,
            paddingBottom: spacing.sm,
            paddingHorizontal: spacing.xs,
          }}
        >
          {range === 'upcoming' ? t('events:upcoming') : t('events:past')}
        </Text>

        {renderList()}
      </View>
    </Screen>
  );
}
