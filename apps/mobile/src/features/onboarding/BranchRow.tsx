import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { palette, radius, spacing, typeScale } from '@agbc/shared/theme';

import { SelectRow } from '@/components/ui';

import { branchInitial } from './branchInitial';
import type { BranchSummary } from './branches-snapshot';

// ONB-2 row: the shared .sel pattern with the branch initial tile, city/country sub
// line, and the gold HQ pill (navy text on gold in both themes, per the mockup).
export function BranchRow({
  branch,
  selected,
  onSelect,
}: {
  branch: BranchSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SelectRow
      tileLabel={branchInitial(branch.name)}
      title={branch.name}
      subtitle={`${branch.city}, ${branch.country}`}
      badge={
        branch.is_hq ? (
          <View
            style={{
              backgroundColor: palette.gold,
              borderRadius: radius.full,
              paddingHorizontal: spacing.sm,
              paddingVertical: 2,
            }}
          >
            <Text
              style={[typeScale.label, { fontSize: 9.5, color: palette.navy }]}
            >
              {t('onboarding.hqBadge')}
            </Text>
          </View>
        ) : undefined
      }
      selected={selected}
      onSelect={onSelect}
      accessibilityLabel={`${branch.name}, ${branch.city}, ${branch.country}`}
    />
  );
}
