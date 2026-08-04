import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  CheckIcon,
  UndoIcon,
  EmptyState,
  GateSheet,
  HeartIcon,
  Screen,
  Skeleton,
} from '@/components/ui';
import { joinMeta } from '@/features/family/format';
import { PostActionsMenu } from '@/features/family/PostActionsMenu';
import { usePrayerQuery, type PrayerFeedItem } from '@/features/family/queries';
import { shareText, testimonyShareText } from '@/features/family/share';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useRelativeAgeLabel } from '@/features/family/useRelativeAgeLabel';
import { useIntercessionPress } from '@/features/family/useIntercession';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

// PRAYER-DETAIL (mockup frame + docs/spec/09): the request in a card (meta, the
// body as a display quote, the two counts), then the actions: "I will pray"
// (gated for a guest) + the reminder explainer + Share. The ⋯ menu (edit/delete
// for the author, report/block otherwise) landed with W2.6; mark-answered is W2.5.
export default function PrayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [gateVisible, setGateVisible] = useState(false);

  const query = usePrayerQuery(id);
  const branchNames = useBranchNames();
  const prayer = query.data ?? null;
  // Guests are gated; a member's tap moves them along the two-step. Called with
  // a placeholder row while the query is loading, because a hook cannot be
  // conditional; the controls it feeds do not render until `prayer` exists.
  const {
    commitment,
    onPress: onCommit,
    onUndo,
  } = useIntercessionPress(prayer ?? PLACEHOLDER_PRAYER, () => {
    setGateVisible(true);
  });
  const branchName = prayer ? (branchNames[prayer.branch_id] ?? null) : null;
  const age = useRelativeAgeLabel(prayer?.created_at ?? '');

  // Back, and also where a request goes when it stops being this member's to see:
  // deleted, or its author blocked.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/family');
  };

  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t('family:detailPrayer')}
        // A share/notification deep link opens this with no history: fall back to
        // Family so back is never an inert dead end (docs/spec/04).
        onBack={leave}
        backLabel={t('common:back')}
        // `is_mine` and not `author_id`: an anonymous request carries no author for
        // anyone, its writer included, and this is what still hands them Edit and
        // Delete on their own words (migration 20260803170000).
        trailing={
          prayer === null ? undefined : (
            <PostActionsMenu
              target="prayer"
              postId={prayer.id}
              isMine={prayer.is_mine}
              authorId={prayer.author_id}
              authorName={prayer.author_name}
              onGone={leave}
            />
          )
        }
      />

      {query.data === undefined && !query.isError ? (
        <View
          style={{
            gap: spacing.md,
            marginTop: spacing.lg,
            paddingHorizontal: spacing.gutter,
          }}
        >
          <Skeleton height={18} width="60%" />
          <Skeleton height={120} />
        </View>
      ) : query.isError ? (
        <View style={{ paddingHorizontal: spacing.gutter }}>
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void query.refetch();
            }}
          />
        </View>
      ) : prayer === null ? (
        <View style={{ paddingHorizontal: spacing.gutter }}>
          <EmptyState
            title={t('family:goneTitle')}
            body={t('family:goneBody')}
            actionLabel={t('family:backToFamily')}
            onAction={() => {
              router.replace('/(tabs)/family');
            }}
          />
        </View>
      ) : (
        <View style={{ paddingTop: spacing.sm }}>
          {/* Mockup .pcard: the request in a card, inset 16 (the actions below
              sit at the 20px gutter, matching .pactions / .prayexplain). */}
          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.cardline,
              borderRadius: radius.card,
              padding: spacing.xl,
              marginHorizontal: spacing.lg,
            }}
          >
            {prayer.answered_at ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  backgroundColor: palette.green,
                  borderRadius: radius.full,
                  paddingVertical: 4,
                  paddingHorizontal: 11,
                  marginBottom: spacing.md,
                }}
              >
                <CheckIcon size={12} color={onInk.text} />
                <Text
                  style={{
                    fontFamily: fontFamily.body.extraBold,
                    fontSize: 10.5,
                    letterSpacing: 0.84,
                    color: onInk.text,
                  }}
                >
                  {t('family:answeredTag').toUpperCase()}
                </Text>
              </View>
            ) : null}

            <Text
              style={{
                fontFamily: fontFamily.body.semiBold,
                fontSize: 12.5,
                color: colors.muted,
                marginBottom: 10,
              }}
            >
              {joinMeta([
                prayer.author_name ?? t('family:aMember'),
                branchName,
                age,
              ])}
            </Text>

            {/* Mockup .pcard .qbody: the request as a display quote. */}
            <Text
              style={{
                fontFamily: fontFamily.display.bold,
                fontSize: 19,
                lineHeight: 28.5,
                color: colors.text,
              }}
            >
              {prayer.body}
            </Text>

            {/* Mockup .praystats: the two counts, gold + green. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.lg,
                marginTop: spacing.lg,
                flexWrap: 'wrap',
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <HeartIcon size={14} color={colors.eye} />
                <Text
                  style={{
                    fontFamily: fontFamily.body.bold,
                    fontSize: 12.5,
                    color: colors.eye,
                  }}
                >
                  {t('family:prayingCount', { count: prayer.praying_count })}
                </Text>
              </View>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
              >
                <CheckIcon size={14} color={palette.green} />
                <Text
                  style={{
                    fontFamily: fontFamily.body.bold,
                    fontSize: 12.5,
                    color: palette.green,
                  }}
                >
                  {t('family:prayedCount', { count: prayer.prayed_count })}
                </Text>
              </View>
            </View>
          </View>

          {/* Mockup .pactions: the commitment, the reminder explainer, then Share.
              The reverse loop link (to the answering testimony) sits above them
              when this request has one (docs/spec/09). */}
          <View
            style={{
              paddingTop: spacing.lg,
              paddingHorizontal: spacing.gutter,
              gap: spacing.md,
            }}
          >
            {prayer.answer_testimony_id === null ? null : (
              <Button
                label={t('family:readTheTestimony')}
                variant="outline"
                fullWidth
                onPress={() => {
                  router.push({
                    pathname: '/testimony/[id]',
                    params: { id: prayer.answer_testimony_id ?? '' },
                  });
                }}
              />
            )}

            {/* The two-step (docs/spec/09). The forward promise first; once made, the
                pill becomes "I prayed", and once fulfilled it stops being a
                button at all, because there is nothing further to ask of them. */}
            <Button
              label={
                commitment === 'none'
                  ? t('family:iWillPray')
                  : commitment === 'committed'
                    ? t('family:iPrayed')
                    : t('family:youPrayed')
              }
              variant={commitment === 'prayed' ? 'outline' : 'primary'}
              fullWidth
              disabled={commitment === 'prayed'}
              icon={
                commitment === 'prayed' ? (
                  <CheckIcon
                    size={17}
                    color={palette.green}
                    strokeWidth={2.5}
                  />
                ) : (
                  <HeartIcon
                    size={17}
                    color={
                      commitment === 'committed' ? colors.eye : colors.btnText
                    }
                  />
                )
              }
              onPress={onCommit ?? (() => undefined)}
            />
            <Text
              accessibilityLiveRegion="polite"
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12.5,
                lineHeight: 18.75,
                color: commitment === 'committed' ? colors.eye : colors.muted,
                textAlign: 'center',
              }}
            >
              {/* Once committed, the explainer becomes the promise the app is
                  now keeping: gentle reminders until they mark "I prayed"
                  (docs/spec/09; the reminders themselves land with W3.4). */}
              {commitment === 'committed'
                ? t('family:willRemindYou')
                : t('family:prayCommitExplain')}
            </Text>
            {/* The same 5s way back as the feed card, as a plain text action so
                it never competes with the primary button above it. */}
            {onUndo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('family:undoCommitment')}
                onPress={onUndo}
                hitSlop={{ top: 10, bottom: 10 }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <UndoIcon size={13} color={colors.blue} strokeWidth={2} />
                <Text
                  style={{
                    fontFamily: fontFamily.body.bold,
                    fontSize: 12.5,
                    color: colors.blue,
                  }}
                >
                  {t('family:undo')}
                </Text>
              </Pressable>
            ) : null}
            <Button
              label={t('family:share')}
              variant="outline"
              fullWidth
              onPress={() => {
                void shareText(
                  testimonyShareText(prayer.body, branchName, t('appName')),
                );
              }}
            />
          </View>
        </View>
      )}

      <GateSheet
        visible={gateVisible}
        title={t('family:gatePrayerTitle')}
        body={t('family:gateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('family:gateDismissed')}
        onSignIn={() => {
          // Gate-return (W2.2): the commitment executor itself lands at W2.4.
          useGateStore
            .getState()
            .beginGateSignIn({ kind: 'intercede', prayerId: id });
          setGateVisible(false);
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore.getState().dismissGate('intercede');
          setGateVisible(false);
        }}
      />
    </Screen>
  );
}

/** Stands in while the request is still loading, so the commitment hook has a
 * row to read. Never rendered: every control it feeds is inside the branch that
 * requires a real prayer. */
const PLACEHOLDER_PRAYER: PrayerFeedItem = {
  id: '',
  branch_id: '',
  body: '',
  language: 'en',
  is_anonymous: false,
  answered_at: null,
  praying_count: 0,
  prayed_count: 0,
  created_at: '',
  author_id: null,
  author_name: null,
  author_avatar_url: null,
  answer_testimony_id: null,
  my_intercession_state: null,
  is_mine: false,
};
