import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import {
  BellIcon,
  Card,
  ChevronDownIcon,
  EmptyState,
  GateSheet,
  GradientFill,
  PersonIcon,
  Screen,
  Skeleton,
  useManualRefresh,
  useToast,
} from '@/components/ui';
import { initials, joinMeta } from '@/features/family/format';
import { useLatestTestimonyQuery } from '@/features/family/queries';
import { shareText, testimonyShareText } from '@/features/family/share';
import { TestimonyCard } from '@/features/family/TestimonyCard';
import { useBranchColors } from '@/features/family/useBranchColors';
import { useBranchNames } from '@/features/family/useBranchNames';
import { resolveAddressLine } from '@/features/home/address';
import { BranchSwitchSheet } from '@/features/home/BranchSwitchSheet';
import {
  BranchWelcome,
  shortBranchName,
} from '@/features/branch-change/BranchWelcome';
import { PendingBranchNote } from '@/features/branch-change/PendingBranchNote';
import { useMyBranchRequests } from '@/features/branch-change/queries';
import { useBranchOutcomeStore } from '@/features/branch-change/seen';
import { NextServiceCard } from '@/features/home/NextServiceCard';
import { checkInOpen, resolveNextService } from '@/features/home/nextService';
import {
  useBranchServicesQuery,
  useDailyVerseQuery,
} from '@/features/home/queries';
import { useLocalDate } from '@/features/home/useLocalDate';
import { VerseCard } from '@/features/home/VerseCard';
import { resolveBranchList } from '@/features/onboarding/branchList';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import { useUnreadCount } from '@/features/notifications/nc';
import { useCheckInAnnounceStore } from '@/features/rhythm/announce';
import { useRhythmQuery } from '@/features/rhythm/queries';
import { StreakStrip } from '@/features/rhythm/StreakStrip';
import { useImHerePress } from '@/features/rhythm/useImHere';
import { useSermonsQuery } from '@/features/watch/queries';
import { SermonRow } from '@/features/watch/SermonRow';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { useGateStore, type GateAction } from '@/state/gate';
import { useTheme } from '@/theme';

// HOME (docs/spec/07, mockups "Home · guest" and W2.8 "HOME · checked in"):
// greeting + branch chip + bell, next-service hero, the member's rhythm strip,
// daily verse (no devotional CTA until Phase 4 per 07's phasing), the "From the
// family" testimony highlight (wired to the Family feed at W1.5), and the
// latest message. The one part that knows who is reading is split by where it
// belongs rather than kept together: a member gets their name, "I'm here"
// (W2.8) and the rhythm strip under the hero; a guest gets the Join card at the
// foot of the screen, and a gate. Section order is 07's, and 07 carries why.
//
// Everything else follows the BROWSED branch, including where a check-in counts.
function greetingKey(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'home:goodMorning';
  if (hour < 17) return 'home:goodAfternoon';
  return 'home:goodEvening';
}

/**
 * The greeting takes a first name (mockup: "Good morning, Ayo"). Display names
 * are free text, so this takes the first word and nothing else: a full name on
 * that line pushes the branch chip down at large text scale, and "Good morning,
 * Oluwatobiloba Adewale" is not how anyone greets anyone.
 */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
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
  const toast = useToast();
  const branch = useBranchStore((s) => s.branch);
  const setBranch = useBranchStore((s) => s.setBranch);
  const isMember = useAuthStore((s) => s.status === 'member');
  const profile = useAuthStore((s) => s.profile);
  const beginGateSignIn = useGateStore((s) => s.beginGateSignIn);
  // The bell's dot (docs/spec/15): unread EXISTS, not how many; the count
  // lives on MORE's row. One source: the same query MORE reads.
  const unreadQuery = useUnreadCount(isMember);
  const unreadCount = unreadQuery.data ?? 0;
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // The gate carries the action that needs an account, so one sheet serves both
  // of Home's gated taps (Glory on the highlight, and "I'm here") with its own
  // copy and its own gate-return (docs/spec/03).
  const [gateAction, setGateAction] = useState<GateAction | null>(null);
  const openGate = (action: GateAction) => {
    // The funnel's first half (docs/spec/22 §5), beside the visibility write.
    track('gate_shown', { action_type: action.kind });
    setGateAction(action);
  };

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
  // Display-string service times for the hero fallback (docs/spec/07 §3): shown
  // only when a branch has no branch_services rows (so `next` is null). Ordered
  // Sunday first; the snapshot omits service_times, so an offline first launch
  // simply has none and falls to "coming soon".
  const displayTimes = [
    currentBranch?.service_times?.sunday,
    currentBranch?.service_times?.classes,
    currentBranch?.service_times?.midweek,
  ].filter((s): s is string => Boolean(s));

  // The branch-change outcomes a member meets on Home (docs/spec/16, ADR 0015): the
  // quiet line while a request is open, and the welcome once one has been approved.
  // Both are keyed by request id in a local store; `seen.ts` says why that is local.
  const branchRequests = useMyBranchRequests();
  const acknowledged = useBranchOutcomeStore((s) => s.acknowledged);
  const dismissed = useBranchOutcomeStore((s) => s.dismissed);
  const acknowledge = useBranchOutcomeStore((s) => s.acknowledge);
  const dismissNote = useBranchOutcomeStore((s) => s.dismiss);

  const openRequest = branchRequests.data?.pending ?? null;
  const dismissedNote =
    openRequest !== null && dismissed.includes(openRequest.id);
  const arrived = branchRequests.data?.lastApproved ?? null;
  const unwelcomed =
    arrived !== null && !acknowledged.includes(arrived.id) ? arrived : null;
  const branchNameOf = (id: string | undefined) =>
    branches.find((option) => option.id === id)?.name ?? '';
  const askedBranchName = branchNameOf(openRequest?.toBranchId);
  // Named from `arrived` rather than `unwelcomed`, because acknowledging empties the
  // second one immediately and the welcome would spend its fade-out saying "Welcome to".
  const arrivedBranchName = branchNameOf(arrived?.toBranchId);

  // The member's rhythm, from the one function that owns it (docs/spec/10).
  // Keyed on the BROWSED branch, because "today" and "checked in" are answered
  // in that branch's timezone.
  const rhythmQuery = useRhythmQuery(branch?.id ?? null, isMember);
  const rhythm = rhythmQuery.data ?? null;

  const now = new Date();
  const next = resolveNextService(
    servicesQuery.data ?? [],
    branch?.timezone ?? 'UTC',
    now,
  );
  // "I'm here" is offered around service time (docs/spec/10), to guests too:
  // the tap gates rather than the control being hidden (docs/spec/07).
  const serviceToday = checkInOpen(
    servicesQuery.data ?? [],
    branch?.timezone ?? 'UTC',
    now,
  );
  const imHere = useImHerePress(
    branch?.id ?? null,
    rhythm?.checkedIn ?? false,
    () => {
      if (branch) openGate({ kind: 'im_here', branchId: branch.id });
    },
  );
  // Browsing a branch that is not where they belong (docs/spec/07): the card
  // says where the tap will count. Guests have no home branch to differ from.
  const visitingBranchName =
    isMember &&
    profile !== null &&
    branch !== null &&
    profile.branchId !== branch.id
      ? branch.name
      : null;

  // What to say about a check-in. The tap says the warm thing itself; the
  // server's correction ("you're already checked in") arrives later, from the
  // write queue handler, which has no screen of its own to say it on.
  const announcement = useCheckInAnnounceStore((s) => s.announcement);
  const clearAnnouncement = useCheckInAnnounceStore((s) => s.clear);
  useEffect(() => {
    if (announcement === null) return;
    toast.show(
      announcement === 'already'
        ? t('rhythm:toastAlready')
        : t('rhythm:toastRecorded'),
    );
    clearAnnouncement();
  }, [announcement, clearAnnouncement, toast, t]);
  const latestSermon = (sermonsQuery.data ?? []).find(
    (s) => s.kind === 'video',
  );

  // Pull-to-refresh is Home's retry path: the cache is persisted so nothing blanks
  // offline, but a failed surface (verse, service, latest message, family) recovers
  // by refetching all four rather than needing an app restart (docs/spec/04).
  const { refreshing, onRefresh: refreshAll } = useManualRefresh(() =>
    Promise.all([
      verseQuery.refetch(),
      servicesQuery.refetch(),
      sermonsQuery.refetch(),
      branchesQuery.refetch(),
      testimonyHighlight.refetch(),
      rhythmQuery.refetch(),
    ]),
  );

  return (
    <Screen
      padded={false}
      widthClass="capped"
      refreshing={refreshing}
      onRefresh={refreshAll}
    >
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
            {isMember && profile !== null
              ? t('home:greetingNamed', {
                  greeting: t(greetingKey(now)),
                  name: firstName(profile.displayName),
                })
              : t(greetingKey(now))}
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
              // flexShrink so a long name ellipsizes INSIDE the row: without
              // it the text takes full content width and pushes the chevron
              // (the selector affordance) off-screen at large scale (#76).
              style={{
                flexShrink: 1,
                fontFamily: fontFamily.display.extraBold,
                fontSize: 20,
                letterSpacing: -0.4,
                color: colors.text,
              }}
            >
              {branch?.name ?? t('appName')}
            </Text>
            <ChevronDownIcon size={icon.md} color={colors.blue} />
          </Pressable>
        </View>
        {/* Mockup .head .rt: bell + avatar. The member's bell opens NC and
            carries the unread dot (docs/spec/15: a dot, not a count; the number
            lives on MORE's row). The guest's bell is the sign-in prompt, and it
            gates with the notifications kind so the finished sign-in lands on
            the log they asked for (the gate-return promise). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isMember && unreadCount > 0
                ? t('home:notificationsUnread')
                : t('home:notifications')
            }
            onPress={() => {
              if (isMember) {
                router.push('/notifications');
                return;
              }
              track('gate_shown', { action_type: 'notifications' });
              beginGateSignIn({ kind: 'notifications' });
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
            {isMember && unreadCount > 0 ? (
              // Mockup .bell .dot: 8px red, ringed by 2px of the disc's own
              // colour so it reads as sitting ON the bell. CSS draws that ring
              // OUTSIDE the 8px; RN draws borders inside, so the box is 12.
              <View
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 7,
                  width: 12,
                  height: 12,
                  borderRadius: radius.full,
                  backgroundColor: palette.red,
                  borderWidth: 2,
                  borderColor: colors.alt,
                }}
              />
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isMember && profile !== null
                ? t('home:openProfile', { name: profile.displayName })
                : t('more.signin')
            }
            onPress={() => {
              router.push(isMember ? '/settings/profile' : '/auth');
            }}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: radius.full,
              // Mockup .avatar: the member's initial on the blue-to-navy
              // gradient; .avatar.guest is the flat alt disc with the glyph.
              backgroundColor: isMember ? palette.navy : colors.alt,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
              overflow: 'hidden',
            })}
          >
            {isMember && profile !== null ? (
              <>
                <GradientFill from={palette.blue} to={palette.navy} />
                <Text
                  style={{
                    fontFamily: fontFamily.body.bold,
                    fontSize: 15,
                    color: onInk.text,
                  }}
                >
                  {initials(profile.displayName)}
                </Text>
              </>
            ) : (
              <PersonIcon color={colors.sub} />
            )}
          </Pressable>
        </View>
      </View>

      {openRequest && !dismissedNote ? (
        <PendingBranchNote
          shortName={shortBranchName(askedBranchName)}
          branchName={askedBranchName}
          onDismiss={() => {
            dismissNote(openRequest.id);
          }}
        />
      ) : null}

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {servicesQuery.data === undefined && !servicesQuery.isError ? (
          <Skeleton height={190} />
        ) : (
          <NextServiceCard
            next={next}
            displayTimes={displayTimes}
            branchName={branch?.name ?? ''}
            addressLine={resolveAddressLine(
              currentBranch?.address ?? null,
              branch?.name ?? '',
            )}
            onPlanVisit={() => {
              // BRANCH-INFO is the 04 destination; the list is the fallback
              // when no browsing branch is set.
              if (branch) {
                router.push({
                  pathname: '/branch/[id]',
                  params: { id: branch.id },
                });
              } else {
                router.push('/branches');
              }
            }}
            onWatchLive={() => {
              router.push('/watch');
            }}
            imHere={
              serviceToday
                ? { checkedIn: imHere.checkedIn, onPress: imHere.press }
                : null
            }
            visitingBranchName={visitingBranchName}
          />
        )}

        {/* The rhythm strip sits directly under the service card because it is
            what "I'm here" pays off (docs/spec/07 §3, ordering rationale). A tap
            on the card above and the streak it feeds are one loop, so nothing
            goes between them: the member must not have to scroll to see that
            their tap landed. Members only; the guest's Join card is the last
            block on the screen instead. It is also the entry to RHYTHM
            (docs/spec/04), which reads the same cached `rhythm_state` row this
            panel is drawn from, so opening it costs nothing and can say nothing
            different. */}
        {isMember ? (
          rhythm === null && !rhythmQuery.isError ? (
            <Skeleton height={92} />
          ) : rhythm !== null ? (
            <StreakStrip
              rhythm={rhythm}
              onPress={() => {
                router.push('/rhythm');
              }}
            />
          ) : null
        ) : null}

        {verseQuery.data === undefined && !verseQuery.isError ? (
          <Skeleton height={150} />
        ) : verseQuery.data ? (
          <VerseCard verse={verseQuery.data} />
        ) : null}

        {/* From the family (docs/spec/07): the latest testimony, the same card the
            Family feed uses. Its Glory/Share gate for guests; the card taps
            through to the detail. Empty only if the family has posted nothing.
            It sits ABOVE the latest message on purpose: sermons already own a
            bottom tab, testimonies live two levels deep under Family, so Home
            surfaces the harder-to-reach thing (docs/spec/07, ordering
            rationale). */}
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
              onGloryGate={() => {
                const id = testimonyHighlight.data?.id;
                if (id) openGate({ kind: 'glory', testimonyId: id });
              }}
              // Sharing is outbound, not a gated contribution (matches the Family
              // feed): open the OS sheet rather than the gate.
              onShare={() => {
                const item = testimonyHighlight.data;
                if (!item) return;
                void shareText(
                  testimonyShareText(
                    item.body,
                    joinMeta([
                      item.author_name,
                      branchNames[item.branch_id] ?? null,
                    ]),
                    t('appName'),
                  ),
                );
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

        {sermonsQuery.data === undefined && !sermonsQuery.isError ? (
          <View>
            <SectionHeader
              label={t('home:latestMessage')}
              actionLabel={t('watch:seeAll')}
              onAction={() => {
                router.push('/watch');
              }}
            />
            <Skeleton height={96} />
          </View>
        ) : latestSermon ? (
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

        {/* The guest's Join card (docs/spec/07 §7), the last block on the
            screen: a member has their rhythm strip up under the service card
            instead, so only one of the two ever renders. */}
        {isMember ? null : (
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
        )}
      </View>

      {/* Arriving takes the whole screen, tab bar included, which is why it is a Modal
          over Home rather than Home's own content: `BranchWelcome` says why. Home still
          renders underneath, so Continue reveals a screen already painted with the new
          branch instead of a blank one filling in. */}
      <BranchWelcome
        visible={unwelcomed !== null}
        branchName={arrivedBranchName}
        shortName={shortBranchName(arrivedBranchName)}
        onContinue={() => {
          if (unwelcomed) acknowledge(unwelcomed.id);
        }}
      />

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

      {/* One sheet, whichever gated tap opened it. The copy names the action the
          member reached for, because "sign in to continue" tells them nothing
          about what they were doing (docs/spec/03). */}
      <GateSheet
        visible={gateAction !== null}
        title={
          gateAction?.kind === 'im_here'
            ? t('rhythm:gateTitle')
            : t('family:gateTitle')
        }
        body={
          gateAction?.kind === 'im_here'
            ? t('rhythm:gateBody')
            : t('family:gateBody')
        }
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={
          gateAction?.kind === 'im_here'
            ? t('rhythm:gateDismissed')
            : t('family:gateDismissed')
        }
        onSignIn={() => {
          // Gate-return (W2.2): remember the action so AUTH-4 replays it.
          if (gateAction) {
            useGateStore.getState().beginGateSignIn(gateAction);
          }
          setGateAction(null);
          router.push('/auth');
        }}
        onDismiss={() => {
          if (gateAction) useGateStore.getState().dismissGate(gateAction.kind);
          setGateAction(null);
        }}
      />
    </Screen>
  );
}
