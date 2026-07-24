import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Text, View } from 'react-native';

import { fontFamily, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  EmptyState,
  Screen,
  SegmentedControl,
  Skeleton,
} from '@/components/ui';
import { CopyRow } from '@/features/give/CopyRow';
import { useGivingConfigQuery } from '@/features/give/queries';
import { useTheme } from '@/theme';

// GIVE-BANK (docs/spec/12): currency-scoped, copyable bank details that work fully
// offline once the config has been cached. Composed from the mockup GIVE-BANK
// frame. Four states off the same giving-config read as the Give tab.
export default function GiveBank() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const query = useGivingConfigQuery();
  const config = query.data;

  // Currency selection is view state (docs/spec/12: default first, user switches).
  // Held as a code so it survives a background refetch without an effect.
  const [selected, setSelected] = useState<string | null>(null);

  const accounts = config?.accounts ?? [];
  const active =
    accounts.find((account) => account.code === selected) ?? accounts[0];

  const back = () => {
    router.back();
  };

  return (
    <Screen widthClass="capped" padded={false}>
      <AppHeader
        title={t('give:bankTitle')}
        backLabel={t('back')}
        onBack={back}
      />

      <View style={{ paddingHorizontal: spacing.lg }}>
        {config === undefined && !query.isError ? (
          <View style={{ gap: spacing.sm + 2, marginTop: spacing.sm }}>
            <Skeleton height={46} />
            <View style={{ height: spacing.sm }} />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={64} />
            ))}
          </View>
        ) : query.isError && config === undefined ? (
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void query.refetch();
            }}
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            title={t('give:bankEmptyTitle')}
            body={t('give:bankEmptyBody')}
          />
        ) : (
          <>
            {/* Mockup .seg inline margin: 6px 16px 0. */}
            <View style={{ marginTop: 6 }}>
              <SegmentedControl
                segments={accounts.map((account) => ({
                  key: account.code,
                  label: account.code,
                }))}
                value={active.code}
                onChange={setSelected}
                accessibilityLabel={t('give:currencyLabel')}
              />
            </View>

            {/* Mockup .mlabel: padding 16px 20px 8px (4px past the 16 gutter). */}
            <Text
              style={{
                fontFamily: fontFamily.body.extraBold,
                fontSize: 11,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: colors.muted,
                paddingTop: spacing.lg,
                paddingBottom: spacing.sm,
                paddingHorizontal: spacing.xs,
              }}
            >
              {t('give:accountHeading', { code: active.code })}
            </Text>

            <View style={{ gap: spacing.sm + 2 }}>
              <CopyRow
                label={t('give:accountName')}
                value={active.holder}
                copyLabel={t('give:copy')}
                copiedMessage={t('give:copied', {
                  field: t('give:accountName'),
                })}
                failedMessage={t('give:copyFailed')}
              />
              {active.fields.map((field) => (
                <CopyRow
                  key={field.label}
                  label={field.label}
                  value={field.value}
                  copyLabel={t('give:copy')}
                  copiedMessage={t('give:copied', { field: field.label })}
                  failedMessage={t('give:copyFailed')}
                />
              ))}
              {/* Mockup's fourth row: the payment-reference guidance. */}
              <CopyRow
                label={t('give:referenceLabel')}
                value={t('give:referenceValue')}
                copyLabel={t('give:copy')}
                copiedMessage={t('give:copied', {
                  field: t('give:referenceLabel'),
                })}
                failedMessage={t('give:copyFailed')}
              />
            </View>

            {/* Mockup .givemeta inline: padding 2px 20px right under the rows. */}
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12,
                lineHeight: 18,
                color: colors.muted,
                textAlign: 'center',
                paddingTop: spacing.md,
                paddingHorizontal: spacing.xs,
              }}
            >
              {t('give:bankReassurance')}
            </Text>

            {config?.cancellationEmail != null ? (
              <Text
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 12,
                  lineHeight: 18,
                  color: colors.muted,
                  textAlign: 'center',
                  paddingTop: spacing.md,
                  paddingHorizontal: spacing.xs,
                }}
              >
                {t('give:recurringNote')}{' '}
                <Text
                  accessibilityRole="link"
                  onPress={() => {
                    void Linking.openURL(
                      `mailto:${config.cancellationEmail ?? ''}`,
                    );
                  }}
                  style={{
                    fontFamily: fontFamily.body.bold,
                    color: colors.blue,
                  }}
                >
                  {config.cancellationEmail}
                </Text>
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}
