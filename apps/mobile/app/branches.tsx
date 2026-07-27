import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TextInput, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  EmptyState,
  Screen,
  SearchIcon,
  Skeleton,
  useManualRefresh,
} from '@/components/ui';
import { BranchListRow } from '@/features/church/BranchListRow';
import { BRANCHES_SNAPSHOT } from '@/features/onboarding/branches-snapshot';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import { useTheme } from '@/theme';

// BRANCHES (docs/spec/04, mockup BRANCHES frame): every active branch with a
// search bar and the "N branches · N nations" meta line, each row opening
// BRANCH-INFO. Same query/cache as onboarding's picker; the bundled snapshot
// keeps the list alive offline (docs/spec/06).
export default function Branches() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const query = useBranchesQuery();
  // Only a pull spins the indicator, never a refetch the app started itself
  // (see components/ui/useManualRefresh).
  const manualRefresh = useManualRefresh(() => query.refetch());
  const [search, setSearch] = useState('');

  // Offline/error fall back to the snapshot rather than a dead screen; the
  // banner below says so (mirrors ONB-3's offline treatment).
  const usingSnapshot = query.isError && query.data === undefined;
  const branches = query.data ?? (usingSnapshot ? BRANCHES_SNAPSHOT : []);

  const needle = search.trim().toLowerCase();
  const visible =
    needle === ''
      ? branches
      : branches.filter((branch) =>
          [branch.name, branch.city, branch.country]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        );
  const nations = new Set(branches.map((branch) => branch.country)).size;
  const countLine = `${t('church:branches', { count: branches.length })} · ${t('church:nations', { count: nations })}`;

  return (
    <Screen
      widthClass="capped"
      padded={false}
      refreshing={manualRefresh.refreshing}
      onRefresh={manualRefresh.onRefresh}
    >
      <AppHeader
        title={t('church:branchesTitle')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />

      <View style={{ paddingHorizontal: spacing.lg }}>
        {/* Mockup .searchbar: card fill, 14 radius, icon + muted placeholder. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm + 2,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.button,
            paddingHorizontal: spacing.lg - 2,
            marginTop: spacing.sm,
          }}
        >
          <SearchIcon size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('church:searchPlaceholder')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('church:searchPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              fontFamily: fontFamily.body.regular,
              fontSize: 15,
              color: colors.text,
              paddingVertical: 11,
            }}
          />
        </View>

        {query.data === undefined && !query.isError ? (
          <View style={{ gap: spacing.sm + 2, marginTop: spacing.lg }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={72} />
            ))}
          </View>
        ) : (
          <>
            {/* Mockup .mlabel: "12 branches · 4 nations". */}
            <Text
              style={{
                fontFamily: fontFamily.body.extraBold,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: colors.muted,
                paddingTop: spacing.lg,
                paddingBottom: spacing.sm,
                paddingHorizontal: spacing.xs,
              }}
            >
              {countLine}
            </Text>

            {usingSnapshot ? (
              <Text
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 12.5,
                  color: colors.muted,
                  paddingBottom: spacing.sm,
                  paddingHorizontal: spacing.xs,
                }}
              >
                {t('onboarding.offlineBranches')}
              </Text>
            ) : null}

            {visible.length === 0 ? (
              <EmptyState
                title={t('church:noResultsTitle')}
                body={t('church:noResultsBody')}
              />
            ) : (
              <View style={{ gap: spacing.sm + 2 }}>
                {visible.map((branch) => (
                  <BranchListRow
                    key={branch.id}
                    name={branch.name}
                    city={branch.city}
                    country={branch.country}
                    hqBadge={branch.is_hq ? t('onboarding.hqBadge') : null}
                    onPress={() => {
                      router.push({
                        pathname: '/branch/[id]',
                        params: { id: branch.id },
                      });
                    }}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
