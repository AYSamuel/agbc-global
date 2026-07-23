import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  EmptyState,
  GateSheet,
  Screen,
  Skeleton,
} from '@/components/ui';
import { joinMeta } from '@/features/family/format';
import { useTestimonyQuery } from '@/features/family/queries';
import { GloryPill } from '@/features/family/TestimonyCard';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useRelativeAgeLabel } from '@/features/family/useRelativeAgeLabel';
import { useTheme } from '@/theme';

// TESTIMONY-DETAIL (docs/spec/09): full body, reactions, and the answered-prayer
// ribbon. Read-only in W1.5; the ⋯ actions menu (edit/delete/report/block) arrives
// with W2.6, and Glory completes through gate-return in W2.2.
export default function TestimonyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [gateVisible, setGateVisible] = useState(false);

  const query = useTestimonyQuery(id);
  const branchNames = useBranchNames();
  const testimony = query.data ?? null;
  const age = useRelativeAgeLabel(testimony?.created_at ?? '');

  const openGate = () => {
    setGateVisible(true);
  };

  return (
    <Screen widthClass="capped">
      <AppHeader title={t('family:tabTestimonies')} onBack={router.back} />

      {query.data === undefined && !query.isError ? (
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <Skeleton height={18} width="60%" />
          <Skeleton height={120} />
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
      ) : testimony === null ? (
        // Withdrawn or never public: the row simply is not in the feed view. A
        // stale deep link lands here and must not read as an error (docs/spec/15).
        <EmptyState
          title={t('family:goneTitle')}
          body={t('family:goneBody')}
          actionLabel={t('family:backToFamily')}
          onAction={() => {
            router.replace('/(tabs)/family');
          }}
        />
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 15,
              color: colors.text,
            }}
          >
            {testimony.author_name ?? t('family:aMember')}
          </Text>
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 12,
              color: colors.muted,
              marginTop: 2,
            }}
          >
            {joinMeta([branchNames[testimony.branch_id] ?? null, age])}
          </Text>

          {testimony.category_key ? (
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 11.5,
                letterSpacing: 0.9,
                color: colors.eye,
                marginTop: spacing.md,
              }}
            >
              {t(
                `family:categories.${testimony.category_key}`,
                testimony.category_key,
              ).toUpperCase()}
            </Text>
          ) : null}

          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 16.5,
              lineHeight: 16.5 * 1.55,
              color: colors.text,
              marginTop: spacing.md,
            }}
          >
            {testimony.body}
          </Text>

          {/* The ribbon is a LINK only while the origin prayer is still publicly
              visible; otherwise it degrades to this static label with no
              navigation, which is the rule in docs/spec/09. */}
          {testimony.origin_prayer_id === null ? null : (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('family:bornFromPrayer')}
              onPress={() => {
                router.push({
                  pathname: '/prayer/[id]',
                  params: { id: testimony.origin_prayer_id ?? '' },
                });
              }}
              style={({ pressed }) => ({
                marginTop: spacing.lg,
                padding: spacing.md,
                borderRadius: radius.control,
                backgroundColor: colors.alt,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 13,
                  color: colors.eye,
                }}
              >
                {t('family:bornFromPrayer')}
              </Text>
            </Pressable>
          )}

          <View style={{ marginTop: spacing.xl }}>
            <GloryPill count={testimony.glory_count} onPress={openGate} />
          </View>
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
