import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import { SelectRow } from '@/components/ui';
import { useTheme } from '@/theme';

// AUTH-3's branch/language pickers: the BranchSwitchSheet pattern (bottom
// sheet + SelectRow radios) generalized over options, so the profile form
// keeps its state while picking (no navigation away mid-form).

export interface PickerOption {
  key: string;
  title: string;
  tileLabel: string;
  subtitle?: string;
}

export interface PickerSheetProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onDismiss: () => void;
}

export function PickerSheet({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onDismiss,
}: PickerSheetProps) {
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
          maxHeight: '75%',
        }}
      >
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
            color: colors.text,
            marginBottom: spacing.md,
          }}
        >
          {title}
        </Text>
        <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
          {options.map((option) => (
            <SelectRow
              key={option.key}
              tileLabel={option.tileLabel}
              title={option.title}
              subtitle={option.subtitle}
              selected={option.key === selectedKey}
              onSelect={() => {
                onSelect(option.key);
              }}
              accessibilityLabel={option.title}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
