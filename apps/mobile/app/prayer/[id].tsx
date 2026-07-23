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
  ActionPill,
  AppHeader,
  CheckIcon,
  EmptyState,
  GateSheet,
  HeartIcon,
  Screen,
  Skeleton,
} from '@/components/ui';
import { joinMeta } from '@/features/family/format';
import { usePrayerQuery } from '@/features/family/queries';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useRelativeAgeLabel } from '@/features/family/useRelativeAgeLabel';
import { useTheme } from '@/theme';

// PRAYER-DETAIL (docs/spec/09): body, the two counts, and the two-step commitment.
// Read-only in W1.5: "I will pray" opens the gate. Mark-answered and the actions
// menu belong to the author, so they arrive with W2.5/W2.6.
export default function PrayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [gateVisible, setGateVisible] = useState(false);

  const query = usePrayerQuery(id);
  const branchNames = useBranchNames();
  const prayer = query.data ?? null;
  const age = useRelativeAgeLabel(prayer?.created_at ?? '');

  return (
    <Screen widthClass="capped">
      <AppHeader title={t('family:tabPrayer')} onBack={router.back} />

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
      ) : prayer === null ? (
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
                  fontFamily: fontFamily.body.bold,
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
              fontFamily: fontFamily.body.regular,
              fontSize: 12,
              color: colors.muted,
            }}
          >
            {joinMeta([
              prayer.author_name ?? t('family:aMember'),
              branchNames[prayer.branch_id] ?? null,
              age,
            ])}
          </Text>

          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 16.5,
              lineHeight: 16.5 * 1.55,
              color: colors.text,
              marginTop: spacing.md,
            }}
          >
            {prayer.body}
          </Text>

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
              <HeartIcon size={13} color={colors.eye} />
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 12,
                  color: colors.eye,
                }}
              >
                {t('family:prayingCount', { count: prayer.praying_count })}
              </Text>
            </View>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <CheckIcon size={13} color={palette.green} />
              <Text
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 12,
                  color: palette.green,
                }}
              >
                {t('family:prayedCount', { count: prayer.prayed_count })}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <ActionPill
              label={t('family:iWillPray')}
              icon={<HeartIcon size={15} color={colors.sub} />}
              onPress={() => {
                setGateVisible(true);
              }}
            />
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12.5,
                color: colors.muted,
                marginTop: spacing.sm,
              }}
            >
              {t('family:prayingWithYou')}
            </Text>
          </View>

          {/* The reverse half of the loop: a link to the testimony this request
              produced, shown only while that testimony is itself approved (09). */}
          {prayer.answer_testimony_id === null ? null : (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('family:readTheTestimony')}
              onPress={() => {
                router.push({
                  pathname: '/testimony/[id]',
                  params: { id: prayer.answer_testimony_id ?? '' },
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
                {t('family:readTheTestimony')}
              </Text>
            </Pressable>
          )}
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
