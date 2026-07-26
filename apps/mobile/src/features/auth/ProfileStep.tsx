import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { authProfileSchema, type AuthProfileForm } from '@agbc/shared';
import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { Button, CheckIcon, TextField } from '@/components/ui';
import { ChevronRightIcon } from '@/components/ui/icons';
import { branchInitial } from '@/features/onboarding/branchInitial';
import { useBranchesQuery } from '@/features/onboarding/useBranches';
import {
  BRANCHES_SNAPSHOT,
  type BranchSummary,
} from '@/features/onboarding/branches-snapshot';
import i18n, {
  LANGUAGE_AUTONYMS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/i18n';
import { supabase } from '@/lib/supabase';
import { useAuthStore, type ProfileSnapshot } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { useLanguagePrefStore } from '@/state/language';
import { useTheme } from '@/theme';

import { AuthLayout } from './AuthLayout';
import { PickerSheet } from './PickerSheet';

// AUTH-3 (docs/spec/03, mockup frame line 1060): first sign-in only. ONE
// update sets name/branch/language + onboarded_at + age_confirmed_at; the
// profiles triggers enforce the one-time semantics. The frame's avatar picker
// is omitted this slice (decided 2026-07-26: it needs expo-image-picker and
// the W2.3 private-bucket upload path; no dead buttons). Branch prefills from
// the onboarding choice; language from the current UI language.

export interface ProfileStepProps {
  onBack: () => void;
  onDone: () => void;
}

function currentLanguage(): SupportedLanguage {
  const code = i18n.language.split('-')[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
    ? (code as SupportedLanguage)
    : 'en';
}

/** The one-time trigger rejecting a re-set means the profile is ALREADY
 * complete (a stale device resumed AUTH-3): success, not failure. */
function isAlreadyOnboarded(message: string): boolean {
  return message.includes('onboarded_at is set once');
}

export function ProfileStep({ onBack, onDone }: ProfileStepProps) {
  const { t } = useTranslation('auth');
  const { colors } = useTheme();
  const markOnboarded = useAuthStore((s) => s.markOnboarded);
  const completeSignIn = useAuthStore((s) => s.completeSignIn);
  const setBranch = useBranchStore((s) => s.setBranch);
  const setLanguagePref = useLanguagePrefStore((s) => s.setPref);
  const branchesQuery = useBranchesQuery();
  const branches = branchesQuery.data ?? BRANCHES_SNAPSHOT;
  const onboardingBranch = useBranchStore((s) => s.branch);

  const [picker, setPicker] = useState<'branch' | 'language' | null>(null);
  const [submitError, setSubmitError] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<AuthProfileForm>({
    resolver: zodResolver(authProfileSchema),
    defaultValues: {
      displayName: '',
      branchId: onboardingBranch?.id ?? branches.at(0)?.id ?? '',
      language: currentLanguage(),
      ageConfirmed: false,
    },
  });
  const branchId = watch('branchId');
  const language = watch('language');
  const ageConfirmed = watch('ageConfirmed');
  const selectedBranch = branches.find((branch) => branch.id === branchId);

  // Invoked inside the press event, never at render (compiler-lint purity).
  const submitForm = handleSubmit(async (form) => {
    setSubmitError(false);
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user?.email) {
      setSubmitError(true);
      return;
    }
    const row = {
      display_name: form.displayName,
      branch_id: form.branchId,
      language: form.language,
      onboarded_at: new Date().toISOString(),
      age_confirmed_at: new Date().toISOString(),
    };
    const inserted = await supabase
      .from('profiles')
      .insert({ id: user.id, email: user.email, ...row });
    if (inserted.error) {
      if (inserted.error.code === '23505') {
        // Row already exists (killed mid-AUTH-3 after a partial path, or a
        // resumed device): complete it with the same one-shot update.
        const updated = await supabase
          .from('profiles')
          .update(row)
          .eq('id', user.id);
        if (updated.error && !isAlreadyOnboarded(updated.error.message)) {
          setSubmitError(true);
          return;
        }
        if (updated.error) {
          // Already onboarded elsewhere: the server wins; load its profile.
          await completeSignIn().catch(() => undefined);
          onDone();
          return;
        }
      } else {
        setSubmitError(true);
        return;
      }
    }
    // Email language stays current for existing users via user_metadata
    // (slice-1 decision); best effort, the profile row is the truth.
    void supabase.auth
      .updateUser({ data: { language: form.language } })
      .catch(() => undefined);
    // The chosen language is an explicit preference now; the home branch also
    // becomes the browsing context for a brand-new member.
    setLanguagePref(form.language);
    if (selectedBranch) setBranch(selectedBranch);
    const snapshot: ProfileSnapshot = {
      displayName: form.displayName,
      branchId: form.branchId,
      language: form.language,
      role: 'member',
    };
    markOnboarded(snapshot);
    onDone();
  });

  const pickrowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardline,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    marginBottom: 12,
  };
  const pickrowLabelStyle = {
    fontFamily: fontFamily.body.bold,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.7,
  };
  const pickrowValueStyle = {
    fontFamily: fontFamily.body.bold,
    fontSize: 15,
    color: colors.text,
  };

  return (
    <AuthLayout
      title={t('profileTitle')}
      lead={t('profileLead')}
      backLabel={t('common:back')}
      onBack={onBack}
    >
      <Controller
        control={control}
        name="displayName"
        render={({ field, fieldState }) => (
          <TextField
            label={t('nameLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error ? t('nameInvalid') : null}
            placeholder={t('namePlaceholder')}
            autoComplete="name"
            textContentType="name"
          />
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('branchLabel')}: ${selectedBranch?.name ?? ''}`}
        onPress={() => {
          setPicker('branch');
        }}
        style={pickrowStyle}
      >
        <Text style={pickrowLabelStyle}>{t('branchLabel')}</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Text style={pickrowValueStyle}>{selectedBranch?.name ?? ''}</Text>
          <ChevronRightIcon size={16} color={colors.muted} strokeWidth={2} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('languageLabel')}: ${LANGUAGE_AUTONYMS[language]}`}
        onPress={() => {
          setPicker('language');
        }}
        style={pickrowStyle}
      >
        <Text style={pickrowLabelStyle}>{t('languageLabel')}</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Text style={pickrowValueStyle}>{LANGUAGE_AUTONYMS[language]}</Text>
          <ChevronRightIcon size={16} color={colors.muted} strokeWidth={2} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ageConfirmed }}
        accessibilityLabel={t('agePrompt')}
        onPress={() => {
          setValue('ageConfirmed', !ageConfirmed);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginTop: 8,
          marginBottom: 6,
          minHeight: 44,
        }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: ageConfirmed ? colors.btnBg : colors.cardline,
            backgroundColor: ageConfirmed ? colors.btnBg : colors.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {ageConfirmed ? (
            <CheckIcon size={14} color={colors.btnText} strokeWidth={3} />
          ) : null}
        </View>
        <Text
          style={{
            fontFamily: fontFamily.body.semiBold,
            fontSize: 14,
            color: colors.text,
          }}
        >
          {t('agePrompt')}
        </Text>
      </Pressable>
      {errors.ageConfirmed ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            color: palette.red,
          }}
        >
          {t('ageInvalid')}
        </Text>
      ) : null}
      {submitError ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            color: palette.red,
            marginTop: 6,
          }}
        >
          {t('errorProfileSave')}
        </Text>
      ) : null}
      <View style={{ flex: 1, minHeight: 16 }} />
      <Button
        label={t('enter')}
        variant="primary"
        fullWidth
        loading={isSubmitting}
        onPress={() => void submitForm()}
      />
      <PickerSheet
        visible={picker === 'branch'}
        title={t('branchPickerTitle')}
        options={branches.map((branch: BranchSummary) => ({
          key: branch.id,
          title: branch.name,
          tileLabel: branchInitial(branch.name),
        }))}
        selectedKey={branchId}
        onSelect={(key) => {
          setValue('branchId', key);
          setPicker(null);
        }}
        onDismiss={() => {
          setPicker(null);
        }}
      />
      <PickerSheet
        visible={picker === 'language'}
        title={t('languagePickerTitle')}
        options={SUPPORTED_LANGUAGES.map((code) => ({
          key: code,
          title: LANGUAGE_AUTONYMS[code],
          tileLabel: code.toUpperCase(),
        }))}
        selectedKey={language}
        onSelect={(key) => {
          setValue('language', key as SupportedLanguage);
          setPicker(null);
        }}
        onDismiss={() => {
          setPicker(null);
        }}
      />
    </AuthLayout>
  );
}
