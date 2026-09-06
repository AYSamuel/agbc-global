import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

import { fontFamily, icon, radius, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  Chip,
  EmptyState,
  Screen,
  SearchIcon,
  Skeleton,
} from '@/components/ui';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import {
  useSermonKindQuery,
  useSermonSearchQuery,
  type SermonSummary,
} from '@/features/watch/queries';
import { useSearchHistoryStore } from '@/features/watch/searchHistory';
import { isAudioOnly } from '@/features/watch/segment';
import { SermonRow } from '@/features/watch/SermonRow';
import { useTheme } from '@/theme';
import { useOpenExternal } from '@/lib/openExternal';

// The three-row placeholder shared by search results and the see-all list while
// their query loads (mockup STATE loading): a thumb + two text lines per row.
function SermonRowSkeletons() {
  return (
    <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.md }}>
          <Skeleton width={120} height={72} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton height={13} width="80%" />
            <Skeleton height={11} width="50%" />
          </View>
        </View>
      ))}
    </View>
  );
}

// WATCH-SEARCH (docs/spec/08): query title/speaker/series; empty input shows
// recent searches; no results shows a clear path back. Series chips arrive
// with ?q= prefilled; the sections' See all arrives with ?list= (videos|live)
// and shows that tab's full rail until a search term takes over.
export default function WatchSearch() {
  const router = useRouter();
  const { t } = useTranslation();
  const openLink = useOpenExternal();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ q?: string; list?: string }>();
  const [term, setTerm] = useState(params.q ?? '');
  const history = useSearchHistoryStore();

  const query = useSermonSearchQuery(term);
  const active = term.trim().length >= 2;
  const results = query.data ?? [];

  // Which See all arrived: the Video half, the live streams, or the Audio half
  // (W4.9 slice 4). The route stays routable with any value or none (`04`: no
  // dead ends); an unknown value is search mode.
  const listMode =
    params.list === 'live' ||
    params.list === 'videos' ||
    params.list === 'audio'
      ? params.list
      : null;
  const listKind =
    listMode === 'live' ? ('live_replay' as const) : ('video' as const);
  // Only fetch the list in list mode; in search mode the result is discarded.
  // Audio-only messages share the `video` kind (it is the sync's default and
  // they were never synced), so both halves read that list and split it here,
  // the same filter the tab applies to its feed.
  const listQuery = useSermonKindQuery(listKind, listMode !== null);
  const listRows =
    listMode === null
      ? []
      : (listQuery.data ?? []).filter((sermon) =>
          listMode === 'audio' ? isAudioOnly(sermon) : !isAudioOnly(sermon),
        );

  // Deeper history lives on the channel itself (decision 2026-07-20): the list
  // ends with a link to the matching channel tab.
  const branches = useBranchesQuery();
  const hqChannelId =
    branches.data?.find((b) => b.is_hq)?.youtube_channel_id ?? null;
  // No channel link under the Audio list: nothing there came from YouTube.
  const channelTabUrl =
    hqChannelId === null || listMode === 'audio'
      ? null
      : `https://www.youtube.com/channel/${hqChannelId}/${
          listKind === 'live_replay' ? 'streams' : 'videos'
        }`;

  const openSermon = (sermon: SermonSummary) => {
    history.remember(term);
    router.push({ pathname: '/sermon/[id]', params: { id: sermon.id } });
  };

  return (
    <Screen padded={false} widthClass="capped">
      <AppHeader
        title={t('watch:searchTitle')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />
      {/* Mockup .searchbar: card surface, 14 radius, icon + input + cancel. */}
      <View style={{ paddingHorizontal: spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm + 2,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.button,
            paddingHorizontal: 14,
            paddingVertical: 4,
          }}
        >
          <SearchIcon size={icon.lg} color={colors.muted} />
          <TextInput
            accessibilityLabel={t('watch:searchTitle')}
            value={term}
            onChangeText={setTerm}
            placeholder={t('watch:searchPlaceholder')}
            placeholderTextColor={colors.muted}
            autoFocus={!params.q}
            returnKeyType="search"
            onSubmitEditing={() => {
              history.remember(term);
            }}
            style={{
              flex: 1,
              minHeight: 44,
              fontFamily: fontFamily.body.regular,
              fontSize: 15,
              color: colors.text,
            }}
          />
          {term.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('watch:cancelSearch')}
              onPress={() => {
                setTerm('');
              }}
              hitSlop={spacing.sm}
            >
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 14,
                  color: colors.blue,
                }}
              >
                {t('watch:cancelSearch')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {!active && listMode !== null ? (
          // See-all list mode: the full section rail with its own four states, so
          // a cold-offline open shows a skeleton then a retry, never a bare header.
          <>
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: colors.muted,
                paddingTop: spacing.lg,
                paddingBottom: spacing.sm,
              }}
            >
              {listMode === 'audio'
                ? t('watch:allAudio')
                : listMode === 'live'
                  ? t('watch:allLiveStreams')
                  : t('watch:allMessages')}
            </Text>
            {listQuery.data === undefined && !listQuery.isError ? (
              <SermonRowSkeletons />
            ) : listQuery.isError && listRows.length === 0 ? (
              <EmptyState
                title={t('errors:somethingWrong')}
                body={t('errors:couldntLoad')}
                actionLabel={t('errors:tryAgain')}
                onAction={() => {
                  void listQuery.refetch();
                }}
              />
            ) : listRows.length === 0 && listMode === 'audio' ? (
              <EmptyState
                title={t('watch:audioEmptyTitle')}
                body={t('watch:audioEmptyBody')}
              />
            ) : listRows.length === 0 ? (
              <EmptyState
                title={t('watch:emptyTitle')}
                body={t('watch:emptyBody')}
                {...(channelTabUrl !== null
                  ? {
                      actionLabel: t('watch:seeMoreOnYoutube'),
                      onAction: () => {
                        openLink(channelTabUrl);
                      },
                    }
                  : {})}
              />
            ) : (
              <>
                {listRows.map((sermon) => (
                  <SermonRow
                    key={sermon.id}
                    sermon={sermon}
                    onPress={() => {
                      openSermon(sermon);
                    }}
                  />
                ))}
                {channelTabUrl !== null ? (
                  <View
                    style={{ marginTop: spacing.lg, marginBottom: spacing.md }}
                  >
                    <Button
                      label={t('watch:seeMoreOnYoutube')}
                      variant="outline"
                      fullWidth
                      onPress={() => {
                        openLink(channelTabUrl);
                      }}
                    />
                  </View>
                ) : null}
              </>
            )}
          </>
        ) : !active ? (
          history.terms.length > 0 ? (
            <>
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: colors.muted,
                  paddingTop: spacing.lg,
                  paddingBottom: spacing.sm,
                }}
              >
                {t('watch:recentSearches')}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing.sm,
                }}
              >
                {history.terms.map((recent) => (
                  <Chip
                    key={recent}
                    label={recent}
                    accessibilityLabel={recent}
                    onPress={() => {
                      setTerm(recent);
                    }}
                  />
                ))}
              </View>
            </>
          ) : (
            <EmptyState
              title={t('watch:searchHintTitle')}
              body={t('watch:searchHintBody')}
            />
          )
        ) : query.data === undefined && !query.isError ? (
          <SermonRowSkeletons />
        ) : query.isError ? (
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void query.refetch();
            }}
          />
        ) : results.length === 0 ? (
          <EmptyState
            title={t('watch:noResults')}
            body={t('watch:noResultsBody')}
            actionLabel={t('watch:clearSearch')}
            onAction={() => {
              setTerm('');
            }}
          />
        ) : (
          <>
            <Text
              accessibilityLiveRegion="polite"
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: colors.muted,
                paddingTop: spacing.lg,
                paddingBottom: spacing.sm,
              }}
            >
              {t('watch:resultsCount', { count: results.length })}
            </Text>
            {results.map((sermon) => (
              <SermonRow
                key={sermon.id}
                sermon={sermon}
                onPress={() => {
                  openSermon(sermon);
                }}
              />
            ))}
          </>
        )}
      </View>
    </Screen>
  );
}
