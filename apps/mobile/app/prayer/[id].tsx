import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
  Button,
  CheckIcon,
  EmptyState,
  GateSheet,
  HeartIcon,
  Screen,
  Skeleton,
} from '@/components/ui';
import { joinMeta } from '@/features/family/format';
import { usePrayerQuery } from '@/features/family/queries';
import { shareText, testimonyShareText } from '@/features/family/share';
import { useBranchNames } from '@/features/family/useBranchNames';
import { useRelativeAgeLabel } from '@/features/family/useRelativeAgeLabel';
import { useTheme } from '@/theme';

// PRAYER-DETAIL (mockup frame + docs/spec/09): the request in a card (meta, the
// body as a display quote, the two counts), then the actions. Read-only in W1.5,
// so the guest sees the "someone else's request" layout, "I will pray" (gated) +
// the reminder explainer + Share. Mark-answered / Edit for the author arrive with
// W2.5 / W2.6.
export default function PrayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [gateVisible, setGateVisible] = useState(false);

  const query = usePrayerQuery(id);
  const branchNames = useBranchNames();
  const prayer = query.data ?? null;
  const branchName = prayer ? (branchNames[prayer.branch_id] ?? null) : null;
  const age = useRelativeAgeLabel(prayer?.created_at ?? '');

  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t('family:detailPrayer')}
        onBack={router.back}
        backLabel={t('common:back')}
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

            <Button
              label={t('family:iWillPray')}
              variant="primary"
              fullWidth
              icon={<HeartIcon size={17} color={colors.btnText} />}
              onPress={() => {
                setGateVisible(true);
              }}
            />
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12.5,
                lineHeight: 18.75,
                color: colors.muted,
                textAlign: 'center',
              }}
            >
              {t('family:prayCommitExplain')}
            </Text>
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
