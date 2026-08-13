import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  onInk,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import {
  AppHeader,
  Burst,
  EmptyState,
  GateSheet,
  GradientFill,
  LinkIcon,
  Screen,
  Skeleton,
  WhatsAppIcon,
} from '@/components/ui';
import { initials, joinMeta } from '@/features/family/format';
import { PostActionsMenu } from '@/features/family/PostActionsMenu';
import { useTestimonyQuery } from '@/features/family/queries';
import { shareToWhatsApp, testimonyShareText } from '@/features/family/share';
import { TestimonyPhoto } from '@/features/family/TestimonyPhoto';
import { useBranchColors } from '@/features/family/useBranchColors';
import { useGloryPress } from '@/features/family/useGlory';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useRelativeAgeLabel } from '@/features/family/useRelativeAgeLabel';
import { track } from '@/lib/analytics';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

// TESTIMONY-DETAIL (mockup frame + docs/spec/09): the answered-prayer ribbon at
// the top, a quote-mark tile, the body as a large display quote, the author with
// an avatar below it, a big Glory pill, and a WhatsApp share. The ⋯ actions menu
// (edit/delete for the author, report/block otherwise) landed with W2.6.
const QUOTE_MARK = '“';

export default function TestimonyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [gateVisible, setGateVisible] = useState(false);

  const query = useTestimonyQuery(id);
  const branchNames = useBranchNames();
  const branchColorFor = useBranchColors();
  const testimony = query.data ?? null;
  const branchName = testimony
    ? (branchNames[testimony.branch_id] ?? null)
    : null;
  const age = useRelativeAgeLabel(testimony?.created_at ?? '');
  const authorName = testimony?.author_name ?? t('family:aMember');
  const glory = useGloryPress(
    id,
    testimony?.glory_count ?? 0,
    testimony?.reacted_by_me ?? false,
    () => {
      track('gate_shown', { action_type: 'glory' });
      setGateVisible(true);
    },
    // No scope on a detail screen; the null branch cannot be tapped (the pill
    // renders from the loaded row) and would drop the event rather than guess.
    { branchId: testimony?.branch_id ?? null },
  );

  // Back, and also where a post goes when it stops being this member's to see: deleted,
  // or its author blocked. Same destination either way, because there is nothing left on
  // this screen to return to.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/family');
  };

  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t('family:detailTestimony')}
        // A share/notification deep link opens this with no history: fall back to
        // Family so back is never an inert dead end (docs/spec/04).
        onBack={leave}
        backLabel={t('common:back')}
        // The `...` waits for the row: which menu it opens is the row's answer
        // (`is_mine`), and a menu that appears first and changes shape a moment later
        // is a menu somebody taps the wrong item on.
        trailing={
          testimony === null ? undefined : (
            <PostActionsMenu
              target="testimony"
              postId={testimony.id}
              isMine={testimony.is_mine}
              authorId={testimony.author_id}
              authorName={testimony.author_name}
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
          <Skeleton height={44} width={44} round />
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
      ) : testimony === null ? (
        // Withdrawn or never public: a stale deep link lands here and must not
        // read as an error (docs/spec/15).
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
        <View
          style={{ paddingHorizontal: spacing.gutter, paddingTop: spacing.sm }}
        >
          {/* The ribbon shows when the testimony was born from a prayer; it is a
              LINK while that prayer is still public, a static label otherwise
              (mockup .ribbon; rule in docs/spec/09). */}
          {testimony.from_prayer_id === null ? null : (
            <Ribbon
              linkable={testimony.origin_prayer_id !== null}
              label={t('family:bornFromPrayer')}
              onPress={() => {
                router.push({
                  pathname: '/prayer/[id]',
                  params: { id: testimony.origin_prayer_id ?? '' },
                });
              }}
            />
          )}

          {/* Mockup .quotemark: a gold-tinted tile with a big opening quote. */}
          <View
            accessible={false}
            style={{
              width: 44,
              height: 44,
              borderRadius: 13,
              backgroundColor: 'rgba(255,207,74,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 34,
                lineHeight: 44,
                color: palette.goldDeep,
              }}
            >
              {QUOTE_MARK}
            </Text>
          </View>

          {/* Mockup .tquote: the body as a large display-font quote. */}
          <Text
            style={{
              fontFamily: fontFamily.display.bold,
              fontSize: 20,
              lineHeight: 30,
              color: colors.text,
              marginBottom: spacing.lg,
            }}
          >
            {testimony.body}
          </Text>

          {/* Mockup .tshot: the optional photo between the quote and the author,
              so the screen reads words, then image, then who shared it. */}
          <TestimonyPhoto
            path={testimony.image_path}
            variant="detail"
            authorName={authorName}
          />

          {/* Mockup .tauthor: avatar + name + meta, below the quote. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              marginBottom: spacing.lg,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.full,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Branch-coloured avatar, matching the feed and map (2026-07-24). */}
              <GradientFill
                from={branchColorFor(testimony.branch_id)}
                to={palette.navy}
              />
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 15,
                  color: onInk.text,
                }}
              >
                {initials(testimony.author_name) || '✦'}
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
                {authorName}
              </Text>
              <Text
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 12,
                  color: colors.muted,
                  marginTop: 2,
                }}
              >
                {joinMeta([branchName, age])}
              </Text>
            </View>
          </View>

          {/* Mockup .glorybig: a full-width gold pill with the count. A guest
              hits the gate and W2.2 completes the reaction on return; a member
              reacts straight into the write queue (W2.4). */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: glory.reacted }}
            accessibilityLiveRegion="polite"
            accessibilityLabel={t('family:gloryCount', { count: glory.count })}
            onPress={glory.onPress}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              // Mockup .glorybig.on: the border replaces a pixel of padding on
              // each side so both states are the same height and the screen
              // does not shift under the tap.
              paddingVertical: glory.reacted ? 13 : 14,
              borderRadius: radius.full,
              borderWidth: glory.reacted ? 1 : 0,
              borderColor: tonal.gold.border,
              backgroundColor: glory.reacted ? tonal.gold.bg : colors.accent,
              marginBottom: spacing.sm,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Burst
              trigger={glory.bursts}
              color={glory.reacted ? palette.gold : palette.navy}
            />
            <Text
              style={{
                fontSize: 15,
                color: glory.reacted ? palette.gold : palette.navy,
              }}
            >
              {'✦'}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.body.extraBold,
                fontSize: 15,
                color: glory.reacted ? colors.text : palette.navy,
              }}
            >
              {t('family:gloryCount', { count: glory.count })}
            </Text>
          </Pressable>

          {/* Mockup .wabtn: green-tinted "Share to WhatsApp". Sharing is outbound,
              so guests may do it (no gate). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('family:shareToWhatsApp')}
            onPress={() => {
              void shareToWhatsApp(
                testimonyShareText(
                  testimony.body,
                  joinMeta([authorName, branchName]),
                  t('appName'),
                ),
              );
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 14,
              borderRadius: radius.control,
              backgroundColor: tonal.green.bg,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <WhatsAppIcon size={icon.lg} color={palette.green} />
            <Text
              style={{
                fontFamily: fontFamily.body.extraBold,
                fontSize: 14.5,
                color: palette.green,
              }}
            >
              {t('family:shareToWhatsApp')}
            </Text>
          </Pressable>
        </View>
      )}

      <GateSheet
        visible={gateVisible}
        title={t('family:gateTitle')}
        body={t('family:gateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('family:gateDismissed')}
        onSignIn={() => {
          // Gate-return (W2.2): AUTH-4 replays the Glory on this testimony.
          useGateStore
            .getState()
            .beginGateSignIn({ kind: 'glory', testimonyId: id });
          setGateVisible(false);
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore.getState().dismissGate('glory');
          setGateVisible(false);
        }}
      />
    </Screen>
  );
}

// Mockup .ribbon: a green-tinted bar with a link glyph. Rendered as a link when
// the origin prayer is still public, otherwise a plain (non-navigating) label.
function Ribbon({
  linkable,
  label,
  onPress,
}: {
  linkable: boolean;
  label: string;
  onPress: () => void;
}) {
  const inner = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        backgroundColor: tonal.greenCard.bg,
        borderWidth: 1,
        borderColor: tonal.greenCard.border,
        borderRadius: radius.control,
        paddingVertical: 11,
        paddingHorizontal: 14,
      }}
    >
      <LinkIcon size={icon.md} color={palette.green} />
      <Text
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 13,
          color: palette.green,
        }}
      >
        {label}
      </Text>
    </View>
  );

  if (!linkable) return inner;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {inner}
    </Pressable>
  );
}
