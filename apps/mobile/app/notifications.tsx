import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import {
  AppHeader,
  BellIcon,
  CalendarIcon,
  CheckIcon,
  ChurchIcon,
  ClockIcon,
  EmptyGlyph,
  EmptyState,
  HeartIcon,
  PersonIcon,
  ListRow,
  ListScreen,
  Skeleton,
  StarIcon,
} from '@/components/ui';
import {
  useMarkAllRead,
  useMarkRead,
  useNotificationsList,
  type NotificationRow,
} from '@/features/notifications/nc';
import {
  renderNotification,
  tintForType,
} from '@/features/notifications/render';
import {
  FALLBACK_ROUTE,
  resolveDeepLink,
} from '@/features/notifications/deepLinks';
import { useRelativeAgeLabel } from '@/features/family/useRelativeAgeLabel';
import { useFormattingLocale } from '@/i18n';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

/**
 * NC, the notification centre (docs/spec/15, frames `NC · notification center`
 * and `NC · empty (all caught up)`).
 *
 * The log is the durable half of push: a member with push off still finds
 * everything here. Rows arrive in two shapes (template and pre-rendered) and
 * `render.ts` narrates both; a tap marks the row read and goes wherever its
 * stored deep link resolves to, through the same allowlist a push tap uses,
 * because a stored path is untrusted no matter which door it came in by.
 *
 * Pagination is the spec's keyset cursor at ~30 a page, surfaced as a "Show
 * older" row rather than a scroll listener: the house list idiom is mapped rows
 * inside Screen's own scroll, and an explicit affordance stays honest about
 * where a page ends. The retention footer appears only once the last page has
 * been reached, which is where the boundary it describes actually is.
 */

const ICONS = {
  prayer: HeartIcon,
  testimony_glory: StarIcon,
  moderation: CheckIcon,
  registration: CheckIcon,
  purchase: CheckIcon,
  rsvp_reminder: CalendarIcon,
  service_reminder: ClockIcon,
  ministry: CalendarIcon,
  branch: ChurchIcon,
  event: CalendarIcon,
} as const;

/**
 * Returns the ELEMENT rather than the component: every entry above is a module
 * constant, but a capitalized variable assigned in render trips the compiler's
 * static-components rule, and an element is what the row wants anyway.
 */
function typeIcon(type: string, color: string) {
  const Icon = type in ICONS ? ICONS[type as keyof typeof ICONS] : BellIcon;
  return <Icon size={18} color={color} />;
}

function NotificationRowView({
  row,
  onPress,
}: {
  row: NotificationRow;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = useFormattingLocale();
  const time = useRelativeAgeLabel(row.createdAt);
  const rendered = renderNotification(t, row, locale);
  const tint = tintForType(row.type);
  const unread = row.readAt === null;

  const disc =
    tint === 'pray'
      ? { bg: tonal.green.bg, fg: palette.green }
      : tint === 'glory'
        ? { bg: tonal.gold.bg, fg: colors.eye }
        : tint === 'txn'
          ? { bg: tonal.blue.bg, fg: colors.blue }
          : { bg: colors.alt, fg: colors.text };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        unread
          ? t('notifications:rowUnread', { title: rendered.title })
          : rendered.title
      }
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 13,
        paddingVertical: 14,
        paddingHorizontal: spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: colors.cardline,
        // Mockup `.ncrow.unread`: the blue wash at 5%.
        backgroundColor: unread
          ? tonal.blueFaint.bg
          : pressed
            ? colors.alt
            : 'transparent',
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.full,
          backgroundColor: disc.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {typeIcon(row.type, disc.fg)}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 14,
            lineHeight: 14 * 1.3,
            color: colors.text,
          }}
        >
          {rendered.title}
        </Text>
        {rendered.body !== '' ? (
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12.5,
              lineHeight: 12.5 * 1.35,
              color: colors.sub,
              marginTop: 2,
            }}
          >
            {rendered.body}
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 11,
          color: colors.muted,
        }}
      >
        {time}
      </Text>
      {unread ? (
        <View
          style={{
            position: 'absolute',
            right: spacing.lg,
            bottom: 18,
            width: 8,
            height: 8,
            borderRadius: radius.full,
            backgroundColor: colors.blue,
          }}
        />
      ) : null}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = useAuthStore((state) => state.status);
  const beginGateSignIn = useGateStore((state) => state.beginGateSignIn);

  const signedIn = status === 'member';
  const query = useNotificationsList(signedIn);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const rows = query.data?.pages.flatMap((page) => page.rows) ?? [];
  const hasUnread = rows.some((row) => row.readAt === null);

  const open = (row: NotificationRow) => {
    if (row.readAt === null) markRead.mutate(row.id);
    // The stored path is untrusted (the push-tap rule); unrecognised targets
    // fall back to this screen, which the member is already on, so only a
    // resolvable link navigates.
    const route = resolveDeepLink(row.deepLink);
    // THE ASSERTION AND THE DISABLE ARE BOTH LOAD-BEARING, in opposite
    // environments, exactly as in useNotifications.ts: expo-router generates its
    // typed routes into `.expo/types`, which is gitignored, so `router.push`
    // takes a narrow union of real route literals on a machine that has run the
    // dev server and a broad type on a CI runner that has not. Without the
    // assertion local typecheck fails; with it, CI's lint calls it unnecessary.
    // `resolveDeepLink` has already narrowed this to an allowlisted route.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    if (route !== FALLBACK_ROUTE) router.push(route as Href);
  };

  // Rows apart from placeholders so the list can virtualize (W4.7 slice 3). This
  // is the one list in the app that genuinely paginates, so it is also the one
  // where mounting every row was least defensible: "show older" appends a page
  // each time and nothing ever unmounts.
  const showRows = signedIn && !query.isPending && !query.isError;

  const placeholder = !signedIn ? (
    // Reachable signed-out only by deep link (the bell gates earlier);
    // the same full-screen gate MY-LIST wears.
    <EmptyState
      icon={<EmptyGlyph Icon={PersonIcon} />}
      title={t('notifications:guestTitle')}
      body={t('notifications:guestBody')}
      actionLabel={t('common:signIn')}
      onAction={() => {
        track('gate_shown', { action_type: 'notifications' });
        beginGateSignIn({ kind: 'notifications' });
        router.push('/auth');
      }}
    />
  ) : query.isPending ? (
    <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
      <Skeleton height={68} />
      <Skeleton height={68} />
      <Skeleton height={68} />
      <Skeleton height={68} />
    </View>
  ) : query.isError ? (
    <EmptyState
      title={t('errors:somethingWrong')}
      body={t('errors:couldntLoad')}
      actionLabel={t('errors:tryAgain')}
      onAction={() => {
        void query.refetch();
      }}
    />
  ) : (
    // Frame `NC · empty (all caught up)`.
    <EmptyState
      icon={<EmptyGlyph Icon={BellIcon} />}
      title={t('notifications:emptyTitle')}
      body={t('notifications:emptyBody')}
    />
  );

  return (
    <ListScreen
      widthClass="capped"
      padded={false}
      data={showRows ? rows : []}
      keyExtractor={(row) => row.id}
      renderItem={(row) => (
        <NotificationRowView
          row={row}
          onPress={() => {
            open(row);
          }}
        />
      )}
      header={
        <>
          <AppHeader
            title={t('notifications:title')}
            onBack={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/home');
            }}
            backLabel={t('common:back')}
            trailing={
              signedIn && hasUnread ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('notifications:markAllRead')}
                  onPress={() => {
                    markAllRead.mutate();
                  }}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Text
                    style={{
                      fontFamily: fontFamily.body.bold,
                      fontSize: 12.5,
                      color: colors.blue,
                    }}
                  >
                    {t('notifications:markAllRead')}
                  </Text>
                </Pressable>
              ) : undefined
            }
          />
          {showRows && rows.length > 0 ? <View style={{ height: 4 }} /> : null}
        </>
      }
      empty={<ListRow>{placeholder}</ListRow>}
      footer={
        showRows && rows.length > 0 ? (
          query.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('notifications:showOlder')}
              disabled={query.isFetchingNextPage}
              onPress={() => {
                void query.fetchNextPage();
              }}
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: spacing.lg,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 13.5,
                  color: colors.blue,
                }}
              >
                {query.isFetchingNextPage
                  ? t('common:loading')
                  : t('notifications:showOlder')}
              </Text>
            </Pressable>
          ) : (
            <Text
              style={{
                // Mockup `.ncfoot`: the retention boundary, where it truly is.
                textAlign: 'center',
                fontFamily: fontFamily.body.regular,
                fontSize: 12,
                color: colors.muted,
                padding: spacing.lg,
              }}
            >
              {t('notifications:retentionFooter')}
            </Text>
          )
        ) : null
      }
    />
  );
}
