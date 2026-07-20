import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { spacing, typeScale } from '@agbc/shared/theme';

import { Button, Screen, Skeleton } from '@/components/ui';
import { HQ_BRANCH } from '@/features/onboarding/branches-snapshot';
import { BranchRow } from '@/features/onboarding/BranchRow';
import { resolveBranchList } from '@/features/onboarding/branchList';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import { useBranchStore } from '@/state/branch';
import { useTheme } from '@/theme';

// ONB-2 (docs/spec/06): conscious branch choice, no preselect; Continue enables only
// after a selection; "Not sure yet" defaults to HQ. First-launch-offline falls back
// to the bundled snapshot and stays fully functional.
export default function PickBranch() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const setBranch = useBranchStore((s) => s.setBranch);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useBranchesQuery();
  const { branches, usingSnapshot } = resolveBranchList(query);

  const proceed = (id: string) => {
    const chosen = branches?.find((b) => b.id === id);
    if (!chosen) return;
    setBranch({ id: chosen.id, slug: chosen.slug, name: chosen.name });
    router.push('/onboarding/language');
  };

  return (
    <Screen widthClass="capped">
      <View style={{ gap: spacing.sm, marginTop: spacing.x3l }}>
        <Text style={[typeScale.label, { color: colors.muted }]}>
          {t('onboarding.step', { current: 1, total: 2 })}
        </Text>
        <Text style={[typeScale.section, { fontSize: 26, color: colors.text }]}>
          {t('onboarding.branchTitle')}
        </Text>
        <Text style={[typeScale.body, { fontSize: 13.5, color: colors.sub }]}>
          {t('onboarding.branchSubtitle')}
        </Text>
      </View>

      <View
        accessibilityRole="radiogroup"
        style={{ gap: spacing.md, marginTop: spacing.x2l }}
      >
        {branches === null ? (
          <>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </>
        ) : (
          branches.map((branch) => (
            <BranchRow
              key={branch.id}
              branch={branch}
              selected={selectedId === branch.id}
              onSelect={() => {
                setSelectedId(branch.id);
              }}
            />
          ))
        )}
        {usingSnapshot ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[typeScale.body, { color: colors.sub }]}
          >
            {t('onboarding.offlineBranches')}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.x2l }}>
        <Button
          label={t('onboarding.continue')}
          variant="primary"
          fullWidth
          disabled={selectedId === null}
          onPress={() => {
            if (selectedId) proceed(selectedId);
          }}
        />
        <Button
          label={t('onboarding.notSure')}
          variant="ghost"
          fullWidth
          onPress={() => {
            setSelectedId(HQ_BRANCH.id);
            proceed(HQ_BRANCH.id);
          }}
        />
      </View>
    </Screen>
  );
}
