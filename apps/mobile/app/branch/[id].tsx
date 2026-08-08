import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import {
  Button,
  ChevronLeftIcon,
  CircleIconButton,
  EmptyState,
  GateSheet,
  GradientFill,
  Screen,
  ShareIcon,
  Skeleton,
  useToast,
} from '@/components/ui';
import { useFormattingLocale } from '@/i18n';
import { canRouteTo, directionsUrl } from '@/features/church/directions';
import { useBranchDetailQuery } from '@/features/church/queries';
import { shareText } from '@/features/family/share';
import { branchInitial } from '@/features/onboarding/branchInitial';
import {
  checkInOpen,
  formatServiceDay,
  formatServiceTime,
  resolveNextService,
} from '@/features/home/nextService';
import { useBranchServicesQuery } from '@/features/home/queries';
import { CheckedInBadge } from '@/features/rhythm/CheckedInBadge';
import { useRhythmQuery } from '@/features/rhythm/queries';
import { useImHerePress } from '@/features/rhythm/useImHere';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

const HERO_MIN_HEIGHT = 196;

// BRANCH-INFO (docs/spec/04 church screens, mockup BRANCH-INFO frame): one
// branch's hero, next service (computed from branch_services with the
// display-string fallback, docs/spec/07 zero-rows rule), lead + leaders,
// welcome word, and the "Watch this branch" browsing-context action. "I'm
// here" appears around service time only (`checkInOpen`, shared with Home so
// the same action is offered at the same moments) and records attendance at
// THIS branch, whether or not it is the member's own (docs/spec/07, W2.8).
export default function BranchInfo() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useFormattingLocale();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const setBranch = useBranchStore((s) => s.setBranch);

  const branchId = typeof id === 'string' ? id : null;
  const query = useBranchDetailQuery(branchId);
  const servicesQuery = useBranchServicesQuery(branchId);
  const [gateVisible, setGateVisible] = useState(false);

  // The check-in state for THIS branch, from the server (docs/spec/10). Read
  // here rather than passed from Home, because a member can arrive on this
  // screen from the map or the branch list without Home ever being involved.
  const isMember = useAuthStore((s) => s.status === 'member');
  const rhythmQuery = useRhythmQuery(branchId, isMember);
  const imHere = useImHerePress(
    branchId,
    rhythmQuery.data?.checkedIn ?? false,
    () => {
      setGateVisible(true);
    },
  );

  const branch = query.data;
  const loading = query.data === undefined && !query.isError;

  const back = () => {
    router.back();
  };
  const seeAllBranches = () => {
    router.replace('/branches');
  };

  // Loading / error / not-found keep the standard header layout; only the
  // loaded screen goes flush-top under its hero.
  if (loading || query.isError || branch === null || branch === undefined) {
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
              <Skeleton height={140} />
              <Skeleton height={76} />
              <Skeleton height={92} />
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
            <EmptyState
              title={t('church:branchNotFoundTitle')}
              body={t('church:branchNotFoundBody')}
              actionLabel={t('church:seeAllBranches')}
              onAction={seeAllBranches}
            />
          )}
        </View>
      </Screen>
    );
  }

  const services = servicesQuery.data ?? [];
  const next = resolveNextService(services, branch.timezone, new Date());
  const displaySunday = branch.service_times.sunday;

  // Mockup .svccard .when: "Sunday · 11:00 AM"; display-string fallback when
  // the branch has no machine schedule (docs/spec/07).
  const nextServiceLine = next
    ? `${formatServiceDay(next.service.weekday, locale)} · ${formatServiceTime(next.service.start_time, locale)}`
    : (displaySunday ?? t('home:serviceTimesSoon'));

  const addressLine = [branch.address?.line1, branch.address?.line2]
    .filter(Boolean)
    .join(', ');
  const heroLoc = displaySunday
    ? `${branch.languages} · ${displaySunday}`
    : branch.languages;
  const heroEyebrow = `${branch.city} · ${branch.country}`;
  const welcomeQuote = `“${branch.welcome}”`;

  const leaders = [
    ...(branch.lead ? [branch.lead] : []),
    ...branch.leaders,
  ].filter(
    (row, index, all) =>
      all.findIndex((other) => other.name === row.name) === index,
  );

  const share = () => {
    void shareText(
      `${branch.name} · ${branch.city}, ${branch.country}${displaySunday ? ` · ${displaySunday}` : ''} · ${t('appName')}`,
    );
  };

  // City + country ride along so the maps app geocodes the venue even when
  // line1 is a building name (Ogbomosho's is).
  const routeTarget = {
    address:
      addressLine === ''
        ? ''
        : `${addressLine}, ${branch.city}, ${branch.country}`,
    lat: branch.lat,
    lng: branch.lng,
    label: branch.name,
  };

  const openDirections = () => {
    void Linking.openURL(directionsUrl(routeTarget)).catch(() => {
      toast.show(t('errors:somethingWrong'));
    });
  };

  const watchThisBranch = () => {
    setBranch({
      id: branch.id,
      slug: branch.slug,
      name: branch.name,
      timezone: branch.timezone,
    });
    toast.show(t('church:watchingToast', { branch: branch.name }));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.x2l }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 680,
          alignSelf: 'center',
        }}
      >
        {/* Mockup .branchhero: flush-top ink gradient, bottom radius 22. */}
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
          <GradientFill direction="diagonal" from="#25406e" to={palette.ink} />
          <GradientFill
            direction="vertical"
            from={palette.ink}
            to={palette.ink}
            fromOpacity={0.2}
            toOpacity={0.9}
          />
          <View
            style={{
              position: 'absolute',
              top: insets.top + 14,
              left: spacing.lg,
              right: spacing.lg,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <CircleIconButton
              icon={<ChevronLeftIcon size={20} color={onInk.text} />}
              accessibilityLabel={t('back')}
              onPress={back}
            />
            <CircleIconButton
              icon={<ShareIcon size={18} color={onInk.text} />}
              accessibilityLabel={t('events:share')}
              onPress={share}
            />
          </View>
          <View style={{ padding: 18 }}>
            <Text
              style={[
                typeScale.label,
                { fontSize: 11, letterSpacing: 1.8, color: palette.gold },
              ]}
            >
              {heroEyebrow}
            </Text>
            <Text
              accessibilityRole="header"
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 24,
                letterSpacing: -0.48,
                color: onInk.text,
                marginTop: 6,
                marginBottom: 3,
              }}
            >
              {branch.name}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13,
                color: onInk.sub,
              }}
            >
              {heroLoc}
            </Text>
          </View>
        </View>

        {/* Mockup .svccard. */}
        <View
          style={{
            marginTop: 14,
            marginHorizontal: spacing.lg,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.card,
            padding: 18,
          }}
        >
          <Text
            style={{
              fontFamily: fontFamily.body.extraBold,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: colors.eye,
              marginBottom: spacing.sm,
            }}
          >
            {t('church:nextService')}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.display.extraBold,
              fontSize: 22,
              letterSpacing: -0.44,
              color: colors.text,
            }}
          >
            {nextServiceLine}
          </Text>
          {addressLine !== '' ? (
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13.5,
                color: colors.muted,
                marginTop: 3,
              }}
            >
              {addressLine}
            </Text>
          ) : null}
          <View
            style={{ flexDirection: 'row', gap: spacing.sm + 2, marginTop: 14 }}
          >
            {/* "I'm here" only around service time (docs/spec/04): from the
                30-minute lead to the end of the branch's day. No dead button
                outside it, and once the day is recorded the action quietens
                into the same badge Home's hero uses. */}
            {checkInOpen(
              servicesQuery.data ?? [],
              branch.timezone,
              new Date(),
            ) ? (
              <View style={{ flex: 1 }}>
                {imHere.checkedIn ? (
                  <CheckedInBadge surface="card" />
                ) : (
                  <Button
                    label={t('church:imHere')}
                    variant="accent"
                    fullWidth
                    onPress={imHere.press}
                  />
                )}
              </View>
            ) : null}
            {canRouteTo(routeTarget) ? (
              <View style={{ flex: 1 }}>
                <Button
                  label={t('church:directions')}
                  variant="outline"
                  fullWidth
                  onPress={openDirections}
                />
              </View>
            ) : null}
          </View>
        </View>

        {/* Mockup .leadcard. */}
        {leaders.length > 0 ? (
          <View
            style={{
              marginTop: 14,
              marginHorizontal: spacing.lg,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.cardline,
              borderRadius: radius.card,
              padding: spacing.lg,
              gap: spacing.md,
            }}
          >
            {leaders.map((leader) => (
              <View
                key={`${leader.name ?? ''}-${leader.role ?? ''}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: radius.full,
                    overflow: 'hidden',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <GradientFill from={palette.blue} to={palette.navy} />
                  <Text
                    style={{
                      fontFamily: fontFamily.body.bold,
                      fontSize: 14,
                      color: onInk.text,
                    }}
                  >
                    {branchInitial(leader.name ?? '')}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: fontFamily.body.bold,
                      fontSize: 15,
                      color: colors.text,
                    }}
                  >
                    {leader.name}
                  </Text>
                  {leader.role ? (
                    <Text
                      style={{
                        fontFamily: fontFamily.body.regular,
                        fontSize: 12.5,
                        color: colors.muted,
                        marginTop: 1,
                      }}
                    >
                      {[leader.role, branch.city].join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Mockup .welcomecard: ink card, gold eyebrow, display quote. */}
        {branch.welcome !== '' ? (
          <View
            style={{
              marginTop: 14,
              marginHorizontal: spacing.lg,
              backgroundColor: palette.ink,
              borderRadius: radius.card,
              padding: 18,
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.extraBold,
                fontSize: 10.5,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: palette.gold,
                marginBottom: spacing.sm,
              }}
            >
              {t('church:welcomeEyebrow')}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.display.bold,
                fontSize: 18,
                lineHeight: 26,
                color: onInk.text,
              }}
            >
              {welcomeQuote}
            </Text>
          </View>
        ) : null}

        <View
          style={{ paddingHorizontal: spacing.lg, paddingTop: 14, gap: 14 }}
        >
          <Button
            label={t('church:watchThisBranch')}
            variant="outline"
            fullWidth
            onPress={watchThisBranch}
          />
          {/* Contact email (docs/spec/04; no mockup element, composed from the
              give screen's mailto line and flagged in the PR). */}
          {branch.email !== '' ? (
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12,
                lineHeight: 18,
                color: colors.muted,
                textAlign: 'center',
              }}
            >
              {t('church:branchEmailNote')}{' '}
              <Text
                accessibilityRole="link"
                onPress={() => {
                  void Linking.openURL(`mailto:${branch.email}`);
                }}
                style={{
                  fontFamily: fontFamily.body.bold,
                  color: colors.blue,
                }}
              >
                {branch.email}
              </Text>
            </Text>
          ) : null}
        </View>
      </View>

      <GateSheet
        visible={gateVisible}
        title={t('church:imHereGateTitle')}
        body={t('church:imHereGateBody')}
        signInLabel={t('signIn')}
        dismissLabel={t('notNow')}
        dismissAnnouncement={t('church:gateDismissed')}
        onSignIn={() => {
          // Gate-return (W2.2 + W2.8): the branch travels with the action, so
          // signing in records the check-in HERE and not wherever the browsing
          // chip happens to point afterwards.
          if (branchId) {
            useGateStore
              .getState()
              .beginGateSignIn({ kind: 'im_here', branchId });
          }
          setGateVisible(false);
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore.getState().dismissGate('im_here');
          setGateVisible(false);
        }}
      />
    </ScrollView>
  );
}
