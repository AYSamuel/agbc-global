import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { authEmailSchema, type AuthEmailForm } from '@agbc/shared';
import { fontFamily } from '@agbc/shared/theme';

import { Button, TextField } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

import { AuthLayout } from './AuthLayout';
import { mapAuthError } from './errors';

// AUTH-1 (docs/spec/03, mockup frame line 1022): email entry with the "why"
// copy. The mockup has no separate "Not now" button: the back circle is the
// guest exit (docs win on behavior, the frame on look). The current UI
// language rides along as user_metadata so a NEW user's first OTP email is
// already localized (slice-1 decision in docs/spec/plans/W2.1-auth.md).

export interface EmailStepProps {
  onBack: () => void;
  onSent: (email: string, sentAt: number) => void;
}

export function EmailStep({ onBack, onSent }: EmailStepProps) {
  const { t, i18n } = useTranslation('auth');
  const { colors } = useTheme();
  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting },
  } = useForm<AuthEmailForm>({
    resolver: zodResolver(authEmailSchema),
    defaultValues: { email: '' },
  });

  // handleSubmit is invoked inside the event, not at render (the compiler
  // lint flags render-time calls as impure).
  const send = async () => {
    await handleSubmit(async ({ email }) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: { language: i18n.language },
        },
      });
      if (error) {
        setError('email', {
          type: 'send',
          message: t(mapAuthError(error, 'send')),
        });
        return;
      }
      onSent(email, Date.now());
    })();
  };

  return (
    <AuthLayout
      title={t('emailTitle')}
      lead={t('emailLead')}
      showMailIcon
      backLabel={t('common:back')}
      onBack={onBack}
    >
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            label={t('emailLabel')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            // Send failures carry their own translated message; every
            // VALIDATION failure renders the i18n copy, never zod's default.
            error={
              fieldState.error
                ? fieldState.error.type === 'send'
                  ? (fieldState.error.message ?? t('emailInvalid'))
                  : t('emailInvalid')
                : null
            }
            placeholder={t('emailPlaceholder')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => void send()}
          />
        )}
      />
      <View style={{ flex: 1, minHeight: 16 }} />
      <Button
        label={t('sendCode')}
        variant="primary"
        fullWidth
        loading={isSubmitting}
        onPress={() => void send()}
      />
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 12.5,
          lineHeight: 19,
          color: colors.muted,
          textAlign: 'center',
          marginTop: 14,
        }}
      >
        {t('emailNote')}
      </Text>
    </AuthLayout>
  );
}
