import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { Button, SelectRow } from '@/components/ui';
import { branchInitial } from '@/features/onboarding/branchInitial';
import type { BranchSummary } from '@/features/onboarding/branches-snapshot';
import { useTheme } from '@/theme';

// BRANCH-SWITCH (mockup bottom sheet, docs/spec/07 branch-context model): this
// changes the BROWSING context only: what Home shows. It never touches the
// profile's home branch (that is an explicit member action, W2.x), never
// changes notifications or streak timezone, and never changes the Family scope
// default. Guests have no profile, so browsing context is all there is here.
export interface BranchSwitchSheetProps {
  visible: boolean;
  branches: BranchSummary[];
  selectedId: string | null;
  onSelect: (branch: BranchSummary) => void;
  onDismiss: () => void;
  onSeeAll: () => void;
}

export function BranchSwitchSheet({
  visible,
  branches,
  selectedId,
  onSelect,
  onDismiss,
  onSeeAll,
}: BranchSwitchSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('close')}
        onPress={onDismiss}
        style={{ flex: 1, backgroundColor: 'rgba(14,20,32,0.55)' }}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.bg,
          borderTopLeftRadius: radius.cardHero,
          borderTopRightRadius: radius.cardHero,
          paddingHorizontal: spacing.gutter,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.md,
        }}
      >
        {/* Mockup .grab handle. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 40,
            height: 4,
            borderRadius: radius.full,
            backgroundColor: colors.cardline,
            alignSelf: 'center',
            marginBottom: spacing.sm,
          }}
        />
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 18,
            letterSpacing: -0.36,
            color: colors.text,
          }}
        >
          {t('home:switchBranch')}
        </Text>
        <View accessibilityRole="radiogroup" style={{ gap: spacing.md }}>
          {branches.map((branch) => (
            <SelectRow
              key={branch.id}
              tileLabel={branchInitial(branch.name)}
              title={branch.name}
              subtitle={`${branch.city}, ${branch.country}`}
              badge={
                branch.is_hq ? (
                  <Text
                    style={{
                      fontFamily: fontFamily.body.bold,
                      fontSize: 10,
                      color: palette.navy,
                      backgroundColor: palette.gold,
                      borderRadius: radius.full,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {t('onboarding.hqBadge')}
                  </Text>
                ) : undefined
              }
              selected={selectedId === branch.id}
              onSelect={() => {
                onSelect(branch);
              }}
              accessibilityLabel={branch.name}
            />
          ))}
        </View>
        <Button
          label={t('home:seeAllBranches')}
          variant="ghost"
          fullWidth
          onPress={onSeeAll}
        />
      </View>
    </Modal>
  );
}
