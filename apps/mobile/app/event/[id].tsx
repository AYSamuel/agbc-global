import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import {
  Button,
  ChevronLeftIcon,
  CircleIconButton,
  EmptyState,
  GateSheet,
  GradientFill,
  Screen,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  eventDateParts,
  formatEventDay,
  formatEventTime,
  formatViewerDayTime,
  isPastEvent,
  wallClockToInstant,
} from '@/features/events/format';
import { useFormattingLocale } from '@/i18n';
import { addEventToCalendar } from '@/features/events/calendar';
import { useEventDetailQuery } from '@/features/events/queries';
import { RsvpControls } from '@/features/events/RsvpControls';
import { queueRsvp, useRsvpAnswer, useRsvpQuery } from '@/features/events/rsvp';
import { useAuthStore } from '@/state/auth';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useBranchCities } from '@/features/events/useBranchCities';
import { shareText } from '@/features/family/share';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

const HERO_MIN_HEIGHT = 186;

// EVENT-DETAIL (docs/spec/11, mockup EVENT-DETAIL frame): hero with the date
// badge, time in the EVENT's zone with a clear label (ministry-wide adds the
// viewer-local line), description, and the RSVP affordance in its honest
// state: gated for guests, closed / past / cancelled treatments instead of
// dead buttons. Add-to-calendar arrives with W2.9 (expo-calendar is a native
// module the current dev clients don't carry).
export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useFormattingLocale();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const eventId = typeof id === 'string' ? id : null;
  const query = useEventDetailQuery(eventId);
  const branchNames = useBranchNames();
  const branchCities = useBranchCities();
  const [gateVisible, setGateVisible] = useState(false);
  const toast = useToast();

  // The member's own answer, from the server unless the queue is holding a
  // newer one (docs/spec/01 §8: an RSVP tapped on a train stays answered).
  const isMember = useAuthStore((state) => state.status === 'member');
  const rsvpQuery = useRsvpQuery(eventId, isMember);
  const answer = useRsvpAnswer(eventId, rsvpQuery.data ?? null);

  const event = query.data;
  const loading = query.data === undefined && !query.isError;

  const back = () => {
    router.back();
  };
  const seeOtherEvents = () => {
    router.replace('/events');
  };

  /**
   * The device calendar (docs/spec/11). Every outcome says something: a refused
   * permission is not a failure and never touches the RSVP (`06`), and a dev
   * client without the native module says so rather than failing silently.
   */
  const addToCalendar = async () => {
    if (event === null || event === undefined) return;
    const outcome = await addEventToCalendar({
      title: event.title,
      startsAtLocal: event.starts_at_local,
      endsAtLocal: event.ends_at_local,
      timeZone: event.timezone,
      location: event.location,
      notes: event.description,
    });
    toast.show(t(`events:calendar.${outcome}`));
  };

  if (loading || query.isError || event === null || event === undefined) {
    return (
      <Screen widthClass="capped" padded={false}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <CircleIconButton
            icon={<ChevronLeftIcon size={20} color={colors.text} />}
            accessibilityLabel={t('back')}
            onPress={back}
            backgroundColor={colors.alt}
          />
          {loading ? (
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <Skeleton height={HERO_MIN_HEIGHT} />
              <Skeleton height={26} width={220} />
              <Skeleton height={18} width={180} />
              <Skeleton height={90} />
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
            // A deep link to a removed event lands here, never on a 404
            // (docs/spec/11): honest copy plus a way onward.
            <EmptyState
              title={t('events:notFoundTitle')}
              body={t('events:notFoundBody')}
              actionLabel={t('events:seeOtherEvents')}
              onAction={seeOtherEvents}
            />
          )}
        </View>
      </Screen>
    );
  }

  const isGlobal = event.branch_id === null;
  const cancelled = event.status === 'cancelled';
  const past = isPastEvent(event.starts_at_local, event.timezone, new Date());
  const date = eventDateParts(event.starts_at_local, locale);
  const day = formatEventDay(event.starts_at_local, locale);
  const time = formatEventTime(event.starts_at_local, locale);
  const city = isGlobal ? null : (branchCities[event.branch_id ?? ''] ?? null);
  const branchName = isGlobal
    ? t('events:allBranches')
    : (branchNames[event.branch_id ?? ''] ?? '');

  // "Saturday · 7:00 PM · Berlin time" (docs/spec/11 timezone rule). The city
  // stands in for the IANA id: clearer to a person, same information here.
  const eyebrow = [
    `${day} · ${time}`,
    city ? t('events:cityTime', { city }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Ministry-wide: origin time above, the viewer's own clock underneath.
  const viewerInstant = isGlobal
    ? wallClockToInstant(event.starts_at_local, event.timezone)
    : null;

  const meta = [branchName, event.location].filter(Boolean).join(' · ');

  const share = () => {
    void shareText(
      `${event.title} · ${day} ${time}${event.location ? ` · ${event.location}` : ''} · ${t('appName')}`,
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.x2l }}
    >
      <View style={{ width: '100%', maxWidth: 680, alignSelf: 'center' }}>
        {/* Mockup .mediahero variant: flush-top, bottom radius 22. */}
        <View
          style={{
            minHeight: HERO_MIN_HEIGHT + insets.top,
            justifyContent: 'flex-end',
            backgroundColor: palette.ink,
            borderBottomLeftRadius: radius.cardHero,
            borderBottomRightRadius: radius.cardHero,
            overflow: 'hidden',
          }}
        >
          <GradientFill direction="diagonal" from="#3a2c5e" to={palette.ink} />
          {event.image_url ? (
            <Image
              source={{ uri: event.image_url }}
              style={{ position: 'absolute', width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
            />
          ) : null}
          <GradientFill
            direction="vertical"
            from={palette.ink}
            to={palette.ink}
            fromOpacity={0.05}
            toOpacity={0.92}
          />
          <View
            style={{
              position: 'absolute',
              top: insets.top + 14,
              left: spacing.lg,
            }}
          >
            <CircleIconButton
              icon={<ChevronLeftIcon size={20} color={onInk.text} />}
              accessibilityLabel={t('back')}
              onPress={back}
            />
          </View>
          {/* Mockup .datebadge. */}
          {date ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: 'absolute',
                top: insets.top + 14,
                right: spacing.lg,
                backgroundColor: 'rgba(20,33,61,0.82)',
                borderRadius: radius.button,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: fontFamily.display.extraBold,
                  fontSize: 18,
                  lineHeight: 20,
                  color: onInk.text,
                }}
              >
                {date.day}
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.body.extraBold,
                  fontSize: 9,
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                  color: onInk.text,
                  marginTop: 3,
                }}
              >
                {date.month}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.lg }}
        >
          {cancelled ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                backgroundColor: tonal.gold.bg,
                borderWidth: 1,
                borderColor: tonal.gold.border,
                borderRadius: radius.control,
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.lg,
                marginBottom: spacing.md,
              }}
            >
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 13.5,
                  color: colors.text,
                }}
              >
                {t('events:cancelledBanner')}
              </Text>
            </View>
          ) : null}

          <Text
            style={{
              fontFamily: fontFamily.body.extraBold,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: colors.eye,
            }}
          >
            {eyebrow}
          </Text>
          <Text
            accessibilityRole="header"
            style={{
              fontFamily: fontFamily.display.extraBold,
              fontSize: 24,
              letterSpacing: -0.48,
              color: colors.text,
              marginTop: spacing.sm,
              marginBottom: 5,
            }}
          >
            {event.title}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.body.semiBold,
              fontSize: 13.5,
              color: colors.sub,
              marginBottom: 14,
            }}
          >
            {meta}
          </Text>

          {/* Ministry-wide treatment (docs/spec/11). */}
          {isGlobal ? (
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 12.5,
                color: palette.goldDeep,
                marginBottom: spacing.md,
              }}
            >
              {t('events:ministryWide')}
              {viewerInstant
                ? ` · ${t('events:yourTime', { time: formatViewerDayTime(viewerInstant, locale) })}`
                : ''}
            </Text>
          ) : null}

          {event.description !== '' ? (
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 15,
                lineHeight: 24,
                color: colors.sub,
              }}
            >
              {event.description}
            </Text>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
          {cancelled ? (
            <Button
              label={t('events:seeOtherEvents')}
              variant="outline"
              fullWidth
              onPress={seeOtherEvents}
            />
          ) : past ? (
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13,
                color: colors.muted,
                textAlign: 'center',
              }}
            >
              {t('events:pastNote')}
            </Text>
          ) : event.rsvp_enabled ? (
            <RsvpControls
              answer={answer}
              onAnswer={(status) => {
                // Browsing is free, contributing signs you in (docs/spec/03):
                // the tap gates rather than the control being hidden.
                if (!isMember) {
                  setGateVisible(true);
                  return;
                }
                // Raises the value moment itself, so an RSVP made through the
                // gate counts the same as one made from here (features/events/rsvp).
                queueRsvp(id, status);
                toast.show(
                  status === 'cancelled'
                    ? t('events:rsvpCancelledToast')
                    : status === 'going'
                      ? t('events:rsvpGoingToast')
                      : t('events:rsvpInterestedToast'),
                );
              }}
            />
          ) : (
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13,
                color: colors.muted,
                textAlign: 'center',
              }}
            >
              {t('events:rsvpClosed')}
            </Text>
          )}
        </View>

        {/* Mockup .ev-actions. */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm + 2,
            paddingHorizontal: spacing.lg,
            paddingTop: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Button
              label={t('events:addCalendar')}
              variant="outline"
              fullWidth
              onPress={() => {
                void addToCalendar();
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('events:share')}
              variant="outline"
              fullWidth
              onPress={share}
            />
          </View>
        </View>
      </View>

      <GateSheet
        visible={gateVisible}
        title={t('events:gateTitle')}
        body={t('events:gateBody')}
        signInLabel={t('signIn')}
        dismissLabel={t('notNow')}
        dismissAnnouncement={t('events:gateDismissed')}
        onSignIn={() => {
          // Gate-return: signing in completes the RSVP they tapped (replay.ts).
          useGateStore
            .getState()
            .beginGateSignIn({ kind: 'rsvp', eventId: id });
          setGateVisible(false);
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore.getState().dismissGate('rsvp');
          setGateVisible(false);
        }}
      />
    </ScrollView>
  );
}
