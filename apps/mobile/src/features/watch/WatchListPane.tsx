import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, radius, spacing, tonal } from '@agbc/shared/theme';

import { EmptyState, Skeleton } from '@/components/ui';
import { useTheme } from '@/theme';

import { useSermonsQuery, type SermonSummary } from './queries';
import { SermonRow } from './SermonRow';

/**
 * The list half of WATCH's tablet two-pane (mockup `WATCH · tablet landscape ·
 * rail + two-pane`, the `.pane-list` block): a `.thead` title over the messages,
 * with the one you are watching held selected.
 *
 * It draws the SAME `SermonRow` the phone draws, from the same query, so the two
 * cannot describe a sermon differently. What it adds is the selected state,
 * which a phone list has no need of because the detail covers the list.
 *
 * The route is what says which row is selected, not this component's own state
 * (see `TwoPane`): a deep link into a sermon therefore lights the right row
 * without anything extra.
 */
export interface WatchListPaneProps {
  /** The sermon the detail pane is showing, from the route. */
  selectedId: string | null;
}

export function WatchListPane({ selectedId }: WatchListPaneProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const query = useSermonsQuery();

  const rows = query.data ?? [];

  const open = (sermon: SermonSummary) => {
    // `navigate`, not `push`: moving between messages in a two-pane replaces
    // what the detail shows rather than stacking a sermon on a sermon.
    router.navigate({ pathname: '/sermon/[id]', params: { id: sermon.id } });
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(sermon) => sermon.id}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.screenTop,
        paddingBottom: insets.bottom + spacing.x2l,
      }}
      ListHeaderComponent={
        // `.thead`: 24/22/12 padding, 26px display title.
        <View style={{ paddingHorizontal: 22, paddingTop: 24, paddingBottom: 12 }}>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fontFamily.display.extraBold,
              fontSize: 26,
              letterSpacing: -0.52,
              color: colors.text,
            }}
          >
            {t('watch:paneTitle')}
          </Text>
        </View>
      }
      ListEmptyComponent={
        query.data === undefined && !query.isError ? (
          <View style={{ gap: spacing.sm, paddingHorizontal: spacing.md }}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </View>
        ) : query.isError ? (
          <View style={{ paddingHorizontal: spacing.md }}>
            <EmptyState
              title={t('errors:somethingWrong')}
              body={t('errors:couldntLoad')}
              actionLabel={t('errors:tryAgain')}
              onAction={() => {
                void query.refetch();
              }}
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: spacing.md }}>
            <EmptyState
              title={t('watch:emptyTitle')}
              body={t('watch:emptyBody')}
            />
          </View>
        )
      }
      renderItem={({ item }) => {
        const selected = item.id === selectedId;
        return (
          <View
            // The frame's selected row: the blue wash it gives `.rrow` when it
            // is the one open in the detail pane, inset so the highlight reads
            // as a rounded row rather than a full-bleed band.
            style={{
              // The frame's own: `margin:8px 12px`, radius 12, and the blue
              // wash it gives the row that is open in the detail pane.
              marginHorizontal: 12,
              marginVertical: 8,
              borderRadius: radius.control,
              backgroundColor: selected ? tonal.bluePane.bg : 'transparent',
            }}
          >
            <SermonRow
              sermon={item}
              onPress={() => {
                open(item);
              }}
            />
          </View>
        );
      }}
    />
  );
}
