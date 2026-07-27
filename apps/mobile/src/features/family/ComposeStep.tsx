import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';

import {
  composeBodyMax,
  type ComposeForm,
  type ComposeTarget,
} from '@agbc/shared';
import { spacing, typeScale } from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  Checkbox,
  Chip,
  Screen,
  TextArea,
} from '@/components/ui';
import { useTheme } from '@/theme';

import { useTestimonyCategoriesQuery } from './queries';

// TESTIMONY-COMPOSE (mockup frame line 1141) and PRAYER-COMPOSE (line 1604).
// Same frame twice: .chead with an X, the .ctext body box, then the one control
// that differs (category chips for a testimony, the anonymity .checkrow for a
// request), then Continue.
//
// The frame's "Add a photo" (.addphoto) is deliberately absent: it needs
// expo-image-picker, a native module the current dev clients do not carry, and
// it lands with the private-bucket upload in W2.3 slice 3. A dashed box that
// does nothing would be exactly the dead affordance docs/spec/04 forbids.
//
// Layout deviates from the frame in one deliberate way: the frame scrolls the
// Continue button with the content, and this pins it below a scroll view. At the
// device's maximum font scale the frame's version pushes the primary action off
// screen, which the responsiveness rules forbid (~/.claude/standards/mobile.md:
// the submit action stays visible above the keyboard).

export interface ComposeStepProps {
  target: ComposeTarget;
  control: Control<ComposeForm>;
  bodyError: string | null;
  onClose: () => void;
  onContinue: () => void;
}

export function ComposeStep({
  target,
  control,
  bodyError,
  onClose,
  onContinue,
}: ComposeStepProps) {
  const { t } = useTranslation('family');
  const { colors } = useTheme();
  const categories = useTestimonyCategoriesQuery();
  const max = composeBodyMax(target);

  return (
    <Screen widthClass="capped" padded={false} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <AppHeader
          title={t(
            target === 'testimony'
              ? 'composeTestimonyTitle'
              : 'composePrayerTitle',
          )}
          leading="close"
          backLabel={t('common:close')}
          onBack={onClose}
        />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: spacing.gutter,
            paddingBottom: spacing.lg,
          }}
        >
          <Controller
            control={control}
            name="body"
            render={({ field }) => (
              <TextArea
                label={t(
                  target === 'testimony'
                    ? 'composeTestimonyTitle'
                    : 'composePrayerTitle',
                )}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder={t(
                  target === 'testimony'
                    ? 'composeTestimonyPlaceholder'
                    : 'composePrayerPlaceholder',
                )}
                max={max}
                counterLabel={(remaining) =>
                  remaining < 0
                    ? t('composeCharactersOver', { count: -remaining })
                    : t('composeCharactersLeft', { count: remaining })
                }
                error={bodyError}
                autoFocus
              />
            )}
          />

          {target === 'testimony' ? (
            // A category is optional, so a failed lookup hides the row instead of
            // standing between an author and their testimony (docs/spec/09).
            categories.data && categories.data.length > 0 ? (
              <>
                <Text
                  style={[
                    typeScale.label,
                    {
                      color: colors.muted,
                      marginTop: spacing.lg,
                      marginBottom: spacing.sm,
                    },
                  ]}
                >
                  {t('composeCategoryLabel')}
                </Text>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: spacing.sm,
                      }}
                    >
                      {categories.data.map((category) => {
                        const selected = field.value === category.id;
                        return (
                          <Chip
                            key={category.id}
                            label={t(`categories.${category.key}`)}
                            selected={selected}
                            // Tapping the selected chip clears it: a category is
                            // optional, so choosing one must be undoable.
                            onPress={() => {
                              field.onChange(selected ? null : category.id);
                            }}
                          />
                        );
                      })}
                    </View>
                  )}
                />
              </>
            ) : null
          ) : (
            <View style={{ marginTop: spacing.lg }}>
              <Controller
                control={control}
                name="isAnonymous"
                render={({ field }) => (
                  <Checkbox
                    checked={field.value}
                    onChange={field.onChange}
                    label={t('composeAnonymous')}
                  />
                )}
              />
            </View>
          )}
        </ScrollView>
        <View
          style={{
            paddingHorizontal: spacing.gutter,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
          }}
        >
          <Button
            label={t('composeContinue')}
            variant="primary"
            fullWidth
            onPress={onContinue}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
