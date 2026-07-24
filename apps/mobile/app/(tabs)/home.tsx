import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import {
  BellIcon,
  Card,
  ChevronDownIcon,
  EmptyState,
  GateSheet,
  PersonIcon,
  Screen,
  Skeleton,
} from '@/components/ui';
import { useLatestTestimonyQuery } from '@/features/family/queries';
import { TestimonyCard } from '@/features/family/TestimonyCard';
import { useBranchColors } from '@/features/family/useBranchColors';
import { useBranchNames } from '@/features/family/useBranchNames';
import { resolveAddressLine } from '@/features/home/address';
import { BranchSwitchSheet } from '@/features/home/BranchSwitchSheet';
import { NextServiceCard } from '@/features/home/NextServiceCard';
import { resolveNextService } from '@/features/home/nextService';
import { QuickActions } from '@/features/home/QuickActions';
import {
  useBranchServicesQuery,
  useDailyVerseQuery,
} from '@/features/home/queries';
import { useLocalDate } from '@/features/home/useLocalDate';
import { VerseCard } from '@/features/home/VerseCard';
import { resolveBranchList } from '@/features/onboarding/branchList';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import { useSermonsQuery } from '@/features/watch/queries';
import { SermonRow } from '@/features/watch/SermonRow';
import { useBranchStore } from '@/state/branch';
import { useTheme } from '@/theme';

// HOME (docs/spec/07, mockup "Home · guest"): greeting + branch chip + bell,
// next-service hero, quick actions, daily verse (no devotional CTA until
// Phase 4 per 07's phasing), latest message, the "From the family" testimony
// highlight (wired to the Family feed at W1.5), guest Join card. Everything
// follows the BROWSED branch.
function greetingKey(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'home:goodMorning';
  if (hour < 17) return 'home:goodAfternoon';
  return 'home:goodEvening';
}

function SectionHeader({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
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
        accessibilityLabel={`${actionLabel}: ${label}`}
        onPress={onAction}
        hitSlop={spacing.sm}
      >
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 12.5,
            color: colors.blue,
          }}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const branch = useBranchStore((s) => s.branch);
  const setBranch = useBranchStore((s) => s.setBranch);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [gateVisible, setGateVisible] = useState(false);

  // Date-anchored reads re-key at local midnight and on foreground.
  const dateKey = useLocalDate();
  const verseQuery = useDailyVerseQuery(dateKey, i18n.language);
  const servicesQuery = useBranchServicesQuery(branch?.id ?? null);
  const sermonsQuery = useSermonsQuery();
  const branchesQuery = useBranchesQuery();
  // The "From the family" highlight (docs/spec/07): the latest approved testimony,
  // wired now that the Family domain has landed (W1.5).
  const testimonyHighlight = useLatestTestimonyQuery();
  const branchNames = useBranchNames();
  const branchColorFor = useBranchColors();
  const { branches } = resolveBranchList(branchesQuery);
  // The hero's address line comes from the branch row (mockup .hero .where).
  const currentBranch = branches.find((b) => b.id === branch?.id) ?? null;

  const now = new Date();
  const next = resolveNextService(
    servicesQuery.data ?? [],
    branch?.timezone ?? 'UTC',
    now,
  );
  const latestSermon = (sermonsQuery.data ?? []).find(
    (s) => s.kind === 'video',
  );

  return (
    <Screen padded={false} widthClass="capped">
      {/* Mockup .head: greeting + branch chip on the left, bell on the right. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.sm,
          paddingBottom: spacing.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: fontFamily.body.medium,
              fontSize: 13,
              color: colors.sub,
            }}
          >
            {t(greetingKey(now))}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home:changeBranch', {
              branch: branch?.name ?? '',
            })}
            onPress={() => {
              setSwitcherOpen(true);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              marginTop: 1,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 20,
                letterSpacing: -0.4,
                color: colors.text,
              }}
            >
              {branch?.name ?? t('appName')}
            </Text>
            <ChevronDownIcon size={16} color={colors.blue} />
          </Pressable>
        </View>
        {/* Mockup .head .rt: bell AND the guest avatar (sign-in entry). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home:notifications')}
            onPress={() => {
              router.push('/auth');
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
            <BellIcon color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('more.signin')}
            onPress={() => {
              router.push('/auth');
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
            <PersonIcon color={colors.sub} />
          </Pressable>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {servicesQuery.data === undefined && !servicesQuery.isError ? (
          <Skeleton height={190} />
        ) : (
          <NextServiceCard
            next={next}
            displayTimes={[]}
            branchName={branch?.name ?? ''}
            addressLine={resolveAddressLine(
              currentBranch?.address ?? null,
              branch?.name ?? '',
            )}
            onPlanVisit={() => {
              router.push('/branches');
            }}
            onWatchLive={() => {
              router.push('/watch');
            }}
          />
        )}

        <QuickActions
          onVisit={() => {
            router.push('/branches');
          }}
          onWatch={() => {
            router.push('/watch');
          }}
          onGive={() => {
            router.push('/give');
          }}
          onAcademy={() => {
            router.push('/academy');
          }}
        />

        {verseQuery.data === undefined && !verseQuery.isError ? (
          <Skeleton height={150} />
        ) : verseQuery.data ? (
          <VerseCard verse={verseQuery.data} />
        ) : null}

        {latestSermon ? (
          <View>
            <SectionHeader
              label={t('home:latestMessage')}
              actionLabel={t('watch:seeAll')}
              onAction={() => {
                router.push('/watch');
              }}
            />
            {/* Mockup .sermon: a 12px card, not the 20px default: the row
                carries its own spacing (2026-07-20). */}
            <Card style={{ padding: spacing.md }}>
              <SermonRow
                sermon={latestSermon}
                size="featured"
                onPress={() => {
                  router.push({
                    pathname: '/sermon/[id]',
                    params: { id: latestSermon.id },
                  });
                }}
              />
            </Card>
          </View>
        ) : null}

        {/* From the family (docs/spec/07): the latest testimony, the same card the
            Family feed uses. Its Glory/Share gate for guests; the card taps
            through to the detail. Empty only if the family has posted nothing. */}
        <View>
          <SectionHeader
            label={t('home:fromTheFamily')}
            actionLabel={t('watch:seeAll')}
            onAction={() => {
              // Land on the Testimonies sub-tab specifically (the section is
              // testimonies); `k` forces it even if Family was left elsewhere.
              router.push({
                pathname: '/family',
                params: { tab: 'testimonies', k: String(Date.now()) },
              });
            }}
          />
          {testimonyHighlight.data === undefined &&
          !testimonyHighlight.isError ? (
            <Skeleton height={150} />
          ) : testimonyHighlight.data ? (
            <TestimonyCard
              testimony={testimonyHighlight.data}
              branchName={
                branchNames[testimonyHighlight.data.branch_id] ?? null
              }
              branchColor={branchColorFor(testimonyHighlight.data.branch_id)}
              onPress={() => {
                router.push({
                  pathname: '/testimony/[id]',
                  params: { id: testimonyHighlight.data?.id ?? '' },
                });
              }}
              onGlory={() => {
                setGateVisible(true);
              }}
              onShare={() => {
                setGateVisible(true);
              }}
            />
          ) : (
            <Card>
              <EmptyState
                title={t('home:familySoonTitle')}
                body={t('home:familySoonBody')}
              />
            </Card>
          )}
        </View>

        {/* Guest Join card (docs/spec/07 §8); the member rhythm strip replaces
            it at W2.8. */}
        <Card>
          <Text
            style={{
              fontFamily: fontFamily.display.extraBold,
              fontSize: 18,
              letterSpacing: -0.36,
              color: colors.text,
            }}
          >
            {t('home:joinTitle')}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 13,
              lineHeight: 19,
              color: colors.sub,
              marginTop: spacing.xs,
              marginBottom: spacing.md,
            }}
          >
            {t('home:joinBody')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('more.signin')}
            onPress={() => {
              router.push('/auth');
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 14,
                color: colors.blue,
              }}
            >
              {t('more.signin')}
            </Text>
          </Pressable>
        </Card>
      </View>

      <BranchSwitchSheet
        visible={switcherOpen}
        branches={branches}
        selectedId={branch?.id ?? null}
        onSelect={(chosen) => {
          setBranch({
            id: chosen.id,
            slug: chosen.slug,
            name: chosen.name,
            timezone: chosen.timezone,
          });
          setSwitcherOpen(false);
        }}
        onDismiss={() => {
          setSwitcherOpen(false);
        }}
        onSeeAll={() => {
          setSwitcherOpen(false);
          router.push('/branches');
        }}
      />

      <GateSheet
        visible={gateVisible}
        title={t('family:gateTitle')}
        body={t('family:gateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('family:gateDismissed')}
        onSignIn={() => {
          setGateVisible(false);
          router.push('/auth');
        }}
        onDismiss={() => {
          setGateVisible(false);
        }}
      />
    </Screen>
  );
}
