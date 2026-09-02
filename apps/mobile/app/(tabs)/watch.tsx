import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import {
  EmptyState,
  Screen,
  SearchIcon,
  Skeleton,
  WatchTabIcon,
  useManualRefresh,
} from '@/components/ui';
import { sermonArtworkUrl } from '@/features/watch/artwork';
import { durationMinutes, joinMeta } from '@/features/watch/format';
import { MediaHero } from '@/features/watch/MediaHero';
import { useSermonsQuery, type SermonSummary } from '@/features/watch/queries';
import { SermonRow } from '@/features/watch/SermonRow';
import { StubIcon } from '@/features/shell/StubIcon';
import { useTheme } from '@/theme';

// Mirrors the website's watch page (decision 2026-07-20): three per section,
// See all for the rest.
const SECTION_LIMIT = 3;

function SectionHeader({
  label,
  seeAllLabel,
  onSeeAll,
}: {
  label: string;
  seeAllLabel: string;
  onSeeAll: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginTop: spacing.xl,
        marginBottom: spacing.sm,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: fontFamily.display.extraBold,
          fontSize: 18,
          letterSpacing: -0.36,
          color: colors.text,
        }}
      >
        {label}
      </Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${seeAllLabel}: ${label}`}
        onPress={onSeeAll}
        // 12.5px of bold text is a ~16dp line box, so `spacing.sm` left this
        // 32dp tall: under the 44 floor (`hitTarget.min`). 16 + 14 + 14 = 44.
        // Measured from the accessibility tree at W4.7 slice 5.
        hitSlop={{ top: 14, bottom: 14, left: spacing.sm, right: spacing.sm }}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 12.5,
            color: colors.blue,
          }}
        >
          {seeAllLabel}
        </Text>
      </Pressable>
    </View>
  );
}

// WATCH tab (docs/spec/08): featured hero (the newest message), Recent messages
// (Videos tab) + Recent live streams (Live tab)
// sections, Series chips, search entry. Four states per docs/spec/04.
export default function Watch() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const query = useSermonsQuery();
  // Only a pull spins the indicator, never a refetch the app started itself
  // (see components/ui/useManualRefresh).
  const manualRefresh = useManualRefresh(() => query.refetch());

  const openSermon = (sermon: SermonSummary) => {
    router.push({ pathname: '/sermon/[id]', params: { id: sermon.id } });
  };

  const sermons = query.data ?? [];
  const videos = sermons.filter((s) => s.kind === 'video');
  // `live_replay` is the channel TAB these were synced from, not a live state: they are
  // recorded messages, and this rail survives the LIVE cut untouched (ADR 0021).
  const liveReplays = sermons.filter((s) => s.kind === 'live_replay');
  // Explicit length check: without noUncheckedIndexedAccess, [0] types non-null.
  const featured = videos.length > 0 ? videos[0] : null;
  // The hero is simply the newest message now. It used to be led by a running broadcast
  // when one was detected; the app carries no live state at all any more.
  const hero = featured;
  const rail = videos.filter((s) => s.id !== hero?.id).slice(0, SECTION_LIMIT);
  const liveRail = liveReplays.slice(0, SECTION_LIMIT);

  return (
    <Screen
      widthClass="capped"
      padded={false}
      refreshing={manualRefresh.refreshing}
      onRefresh={manualRefresh.onRefresh}
    >
      {/* Mockup .stitle with the search .ic-btn: the title sits at the 20px
          gutter, the cards below at 16 (matching Home + Family). */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing.md,
          paddingHorizontal: spacing.gutter,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 26,
            letterSpacing: -0.52,
            color: colors.text,
          }}
        >
          {t('tabs.watch')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('watch:searchLabel')}
          onPress={() => {
            router.push('/watch-search');
          }}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: radius.full,
            backgroundColor: colors.alt,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <SearchIcon color={colors.text} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        {query.data === undefined && !query.isError ? (
          // STATE loading frame: hero skeleton + three row skeletons.
          <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
            <Skeleton height={200} />
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
        ) : query.isError && sermons.length === 0 ? (
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void query.refetch();
            }}
          />
        ) : sermons.length === 0 ? (
          <EmptyState
            title={t('watch:emptyTitle')}
            body={t('watch:emptyBody')}
            icon={<StubIcon Icon={WatchTabIcon} />}
          />
        ) : (
          <>
            {hero ? (
              <View style={{ marginTop: spacing.xs + spacing.xs }}>
                <MediaHero
                  eyebrow={hero.series ?? t('watch:latestMessage')}
                  title={hero.title}
                  meta={joinMeta([
                    hero.speaker || null,
                    durationMinutes(hero.duration_sec) === null
                      ? null
                      : t('watch:minutes', {
                          count: durationMinutes(hero.duration_sec) ?? 0,
                        }),
                  ])}
                  artworkUrl={sermonArtworkUrl(hero)}
                  onPress={() => {
                    openSermon(hero);
                  }}
                  accessibilityLabel={hero.title}
                />
              </View>
            ) : null}

            {rail.length > 0 ? (
              <>
                <SectionHeader
                  label={t('watch:recent')}
                  seeAllLabel={t('watch:seeAll')}
                  onSeeAll={() => {
                    router.push({
                      pathname: '/watch-search',
                      params: { list: 'videos' },
                    });
                  }}
                />
                {rail.map((sermon) => (
                  <SermonRow
                    key={sermon.id}
                    sermon={sermon}
                    onPress={() => {
                      openSermon(sermon);
                    }}
                  />
                ))}
              </>
            ) : null}

            {liveRail.length > 0 ? (
              <>
                <SectionHeader
                  label={t('watch:liveStreams')}
                  seeAllLabel={t('watch:seeAll')}
                  onSeeAll={() => {
                    router.push({
                      pathname: '/watch-search',
                      params: { list: 'live' },
                    });
                  }}
                />
                {liveRail.map((sermon) => (
                  <SermonRow
                    key={sermon.id}
                    sermon={sermon}
                    onPress={() => {
                      openSermon(sermon);
                    }}
                  />
                ))}
              </>
            ) : null}

            {/* YouTube attribution on the rails (ToS box, docs/spec/08). */}
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 11.5,
                color: colors.muted,
                textAlign: 'center',
                marginTop: spacing.x2l,
              }}
            >
              {t('watch:viaYoutube')}
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
