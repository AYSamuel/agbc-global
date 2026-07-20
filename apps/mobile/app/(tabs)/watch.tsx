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
} from '@/components/ui';
import { durationMinutes, joinMeta } from '@/features/watch/format';
import { resolveLiveSermon } from '@/features/watch/live';
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
        hitSlop={spacing.sm}
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

// WATCH tab (docs/spec/08): featured hero (live banner when the stale-bound
// allows), Recent messages (Videos tab) + Recent live streams (Live tab)
// sections, Series chips, search entry. Four states per docs/spec/04.
export default function Watch() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const query = useSermonsQuery();

  const openSermon = (sermon: SermonSummary) => {
    router.push({ pathname: '/sermon/[id]', params: { id: sermon.id } });
  };

  const sermons = query.data ?? [];
  const live = resolveLiveSermon(sermons, new Date());
  const videos = sermons.filter((s) => s.kind === 'video');
  const liveReplays = sermons.filter((s) => s.kind === 'live_replay');
  // Explicit length check: without noUncheckedIndexedAccess, [0] types non-null.
  const featured = videos.length > 0 ? videos[0] : null;
  const hero = live ?? featured;
  const rail = videos.filter((s) => s.id !== hero?.id).slice(0, SECTION_LIMIT);
  // A running broadcast stays listed here even while it leads as the hero
  // (mirrors the website's live section).
  const liveRail = liveReplays.slice(0, SECTION_LIMIT);

  return (
    <Screen widthClass="capped">
      {/* Mockup .stitle with the search .ic-btn. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: spacing.md,
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
                eyebrow={
                  live
                    ? t('watch:liveEyebrow')
                    : (hero.series ?? t('watch:latestMessage'))
                }
                title={hero.title}
                meta={
                  live
                    ? t('watch:liveNow')
                    : joinMeta([
                        hero.speaker || null,
                        durationMinutes(hero.duration_sec) === null
                          ? null
                          : t('watch:minutes', {
                              count: durationMinutes(hero.duration_sec) ?? 0,
                            }),
                      ])
                }
                thumbnailUrl={hero.thumbnail_url || null}
                liveBadge={live ? t('watch:liveBadge') : undefined}
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
    </Screen>
  );
}
