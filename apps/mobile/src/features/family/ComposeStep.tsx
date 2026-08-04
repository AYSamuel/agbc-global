import { Controller, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';

import {
  composeBodyMax,
  type ComposeForm,
  type ComposeTarget,
} from '@agbc/shared';
import { palette, spacing, typeScale } from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  Checkbox,
  Chip,
  Screen,
  TextArea,
} from '@/components/ui';
import { useTheme } from '@/theme';

import type { PhotoFailure } from './photo';
import { PhotoField } from './PhotoField';
import { useTestimonyCategoriesQuery } from './queries';

// TESTIMONY-COMPOSE (mockup frames line 1141 and the photo states that follow it)
// and PRAYER-COMPOSE (line 1604). Same frame twice: .chead with an X, the .ctext
// body box, then the one control that differs (category chips for a testimony,
// the anonymity .checkrow for a request), then Continue. A testimony also gets
// the .addphoto row; a prayer request has no photo at all.
//
// Layout deviates from the frame in one deliberate way: the frame scrolls the
// Continue button with the content, and this pins it below a scroll view. At the
// device's maximum font scale the frame's version pushes the primary action off
// screen, which the responsiveness rules forbid (~/.claude/standards/mobile.md:
// the submit action stays visible above the keyboard).

export interface ComposeStepProps {
  target: ComposeTarget;
  /**
   * Editing an existing post (W2.6). The frame is the same one: a composer is a composer,
   * and what changes is the title, the verb on the button, and the fact that the button
   * IS the submit because an edit runs no consent step (see ComposeFlow's `editId`).
   */
  editing?: boolean;
  control: Control<ComposeForm>;
  bodyError: string | null;
  /** Editing only: the consent step usually carries this, and an edit has none. */
  submitErrorMessage?: string | null;
  submitting?: boolean;
  /** Photo state, owned by ComposeFlow (the form holds the path; the preview and
   * the in-flight flag are session-only and never reach a draft). */
  photo: {
    /** False on a dev client with no picker linked: the row is then not offered
     * at all rather than offered and broken. */
    available: boolean;
    path: string | null;
    previewUri: string | null;
    busy: boolean;
    failure: PhotoFailure | null;
    onPick: () => void;
    onRemove: () => void;
  };
  onClose: () => void;
  onContinue: () => void;
}

export function ComposeStep({
  target,
  editing = false,
  control,
  bodyError,
  submitErrorMessage = null,
  submitting = false,
  photo,
  onClose,
  onContinue,
}: ComposeStepProps) {
  const { t } = useTranslation('family');
  const { colors } = useTheme();
  const categories = useTestimonyCategoriesQuery();
  const max = composeBodyMax(target);

  return (
    // `padding` on BOTH platforms, and OUTSIDE `Screen`, which is the pattern
    // contact.tsx already uses. Android has been edge-to-edge since SDK 57, so the
    // window no longer resizes for the keyboard, and this is the one screen that PINS
    // its primary action below a scroll view: with no behavior at all, Continue sat
    // under the keyboard from the moment the body autofocused, on a phone as well as a
    // tablet (found 2026-08-04). Inside `Screen` it was still short, because Screen has
    // already taken the bottom safe-area inset off the height that KeyboardAvoidingView
    // then pads against the window. Outside it, the frame and the measurement agree.
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Screen widthClass="capped" padded={false} scroll={false}>
        <AppHeader
          title={t(
            editing
              ? target === 'testimony'
                ? 'editTestimonyTitle'
                : 'editPrayerTitle'
              : target === 'testimony'
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

          {target === 'testimony' && photo.available ? (
            <PhotoField
              path={photo.path}
              previewUri={photo.previewUri}
              busy={photo.busy}
              failure={photo.failure}
              onPick={photo.onPick}
              onRemove={photo.onRemove}
            />
          ) : null}
        </ScrollView>
        <View
          style={{
            paddingHorizontal: spacing.gutter,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
          }}
        >
          {/* An edit has no consent step to carry a failed save, so it lands here. */}
          {submitErrorMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[
                typeScale.body,
                {
                  fontSize: 12.5,
                  lineHeight: 18,
                  color: palette.red,
                  marginBottom: spacing.sm,
                },
              ]}
            >
              {submitErrorMessage}
            </Text>
          ) : null}
          {/* Hidden, not disabled, while the photo is in flight: continuing would
              carry a half-attached photo, and a dead button under a busy overlay
              is exactly what the project convention forbids. */}
          {photo.busy ? null : (
            <Button
              label={t(editing ? 'editSaveResubmit' : 'composeContinue')}
              variant="primary"
              fullWidth
              loading={submitting}
              onPress={onContinue}
            />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
