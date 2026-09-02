import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import {
  AppHeader,
  EmptyState,
  Screen,
  Skeleton,
  useManualRefresh,
} from '@/components/ui';
import { formatFeeMinor } from '@/features/academy/fees';
import {
  PathwayCard,
  type PathwayStatus,
} from '@/features/academy/PathwayCard';
import {
  liveRegistrationFor,
  useCoursesQuery,
  useRegistrationsQuery,
  type Course,
} from '@/features/academy/queries';
import { useFormattingLocale } from '@/i18n';
import { useLocalizedText } from '@/lib/localizedJson';
import { useAuthStore } from '@/state/auth';
import { useTheme } from '@/theme';

// ACADEMY (docs/spec/13, mockup ACADEMY frames reworked 2026-08-10): the intro
// band, then the real catalog as pathway cards: step tile, name, level tag,
// pathway_summary blurb, compact formats · fee meta, the prerequisite lock, and
// the status chip. A member's live registration turns a card's chip to Enrolled
// (the member-enrolled frame); guests see the identical screen. Every card
// navigates, upcoming included: COURSE gives "Coming soon" its honest treatment
// rather than this list holding a dead row.
export default function Academy() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = useFormattingLocale();
  const localized = useLocalizedText();

  const isMember = useAuthStore((state) => state.status === 'member');
  const query = useCoursesQuery();
  const registrations = useRegistrationsQuery(isMember);
  const manualRefresh = useManualRefresh(() => query.refetch());

  const courses = query.data;

  const cardStatus = (course: Course): PathwayStatus => {
    if (course.upcoming) return 'soon';
    return liveRegistrationFor(registrations.data, course) !== null
      ? 'enrolled'
      : 'available';
  };

  // "Intensive or part-time · £25": formats collapse to one phrase on the card
  // (durations live on COURSE); nothing renders when the row carries neither.
  const cardMeta = (course: Course): string | null => {
    const parts: string[] = [];
    if (course.formats.length === 2) {
      parts.push(t('academy:formatsBoth'));
    } else if (course.formats.length === 1) {
      parts.push(
        t(
          course.formats[0].key === 'intensive'
            ? 'academy:formatIntensive'
            : 'academy:formatPartTime',
        ),
      );
    }
    if (course.feeMinor !== null && course.feeCurrency !== null) {
      parts.push(formatFeeMinor(course.feeMinor, course.feeCurrency, locale));
    }
    return parts.length === 0 ? null : parts.join(' · ');
  };

  const prereqName = (course: Course): string | null => {
    if (course.prereqSlug === null) return null;
    return courses?.find((c) => c.slug === course.prereqSlug)?.name ?? null;
  };

  const body = () => {
    if (courses === undefined && !query.isError) {
      return (
        <View
          style={{
            gap: spacing.md,
            marginTop: spacing.md,
            paddingHorizontal: spacing.lg,
          }}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={132} />
          ))}
        </View>
      );
    }
    // Error blanks only when nothing is cached (offline shows the cached catalog).
    if (query.isError && courses === undefined) {
      return (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void query.refetch();
            }}
          />
        </View>
      );
    }
    if (courses === undefined || courses.length === 0) {
      return (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <EmptyState
            title={t('academy:emptyTitle')}
            body={t('academy:emptyBody')}
          />
        </View>
      );
    }
    return (
      <>
        {courses.map((course) => {
          const status = cardStatus(course);
          const prereq = prereqName(course);
          return (
            <PathwayCard
              key={course.id}
              step={course.level}
              name={course.name}
              tag={course.levelName}
              blurb={localized(course.pathwaySummary ?? course.summary)}
              meta={cardMeta(course)}
              lockNote={
                prereq === null ? null : t('academy:prereqLock', { prereq })
              }
              status={status}
              statusLabel={t(`academy:status.${status}`)}
              onPress={() => {
                router.push({
                  pathname: '/course/[slug]',
                  params: { slug: course.slug },
                });
              }}
            />
          );
        })}
        {/* Mockup .formcap footer: 12 muted, 14 above, 18 below. */}
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            lineHeight: 17,
            color: colors.muted,
            paddingTop: 14,
            paddingBottom: 18,
            paddingHorizontal: spacing.xl,
          }}
        >
          {t('academy:newLevelsNote')}
        </Text>
      </>
    );
  };

  return (
    <Screen
      // The frame's `.tcol`, 600 rather than the 680 reading measure: ACADEMY
      // tablet portrait is a centred LIST, not a page of prose (W4.7 slice 4).
      widthClass="column"
      padded={false}
      refreshing={manualRefresh.refreshing}
      onRefresh={manualRefresh.onRefresh}
    >
      <AppHeader
        title={t('academy:title')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />

      {/* Mockup .introband: ink card, margin 6 16 4, r18, p18; gold eyebrow
          10.5/800/.16em, white display h2 21, onInk.sub body 13.5/1.5. The ink
          surface is constant across themes (the band token pair). */}
      <View
        style={{
          marginTop: 6,
          marginHorizontal: spacing.lg,
          marginBottom: spacing.xs,
          backgroundColor: palette.ink,
          borderRadius: radius.card,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.extraBold,
            fontSize: 10.5,
            letterSpacing: 1.68,
            textTransform: 'uppercase',
            color: palette.gold,
            marginBottom: 9,
          }}
        >
          {t('academy:introEyebrow')}
        </Text>
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 21,
            letterSpacing: -0.42,
            color: onInk.text,
            marginBottom: 7,
          }}
        >
          {t('academy:introTitle')}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 13.5,
            lineHeight: 20,
            color: onInk.sub,
          }}
        >
          {t('academy:introBody')}
        </Text>
      </View>

      {body()}
    </Screen>
  );
}
