import { FunctionsHttpError } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  CONTACT_MESSAGE_MAX,
  contactRequestSchema,
  type ContactRequest,
  type ContactResponse,
} from '@agbc/shared';
import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  EmptyState,
  Screen,
  Skeleton,
} from '@/components/ui';
import { useBranchContactsQuery } from '@/features/church/queries';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

type FieldKey = 'name' | 'email' | 'message';
type SubmitPhase = 'idle' | 'sending' | 'sent';

// The function's machine hint out of a non-2xx response; the copy shown to the
// user always comes from i18n, never from the wire (docs/spec CLAUDE.md error
// rules).
async function machineCode(error: FunctionsHttpError): Promise<string | null> {
  const response: unknown = error.context;
  if (!(response instanceof Response)) return null;
  try {
    const parsed: unknown = await response.json();
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof parsed.error === 'string'
    ) {
      return parsed.error;
    }
  } catch {
    // Non-JSON body: fall through to the generic copy.
  }
  return null;
}

// CONTACT (docs/spec/04, mockup CONTACT frame): name + email + message to the
// church inbox via the contact-form edge function. Client validation shares
// the function's zod contract (client is UX, the function is truth). Failure
// of any kind preserves the draft; success clears it. The per-branch email
// links below the form are 04 behavior with no mockup element (composed,
// flagged in the PR).
export default function Contact() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const contacts = useBranchContactsQuery();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldKey, string>>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>('idle');

  const fieldErrorCopy: Record<FieldKey, string> = {
    name: t('church:invalidName'),
    email: t('church:invalidEmail'),
    message:
      message.length > CONTACT_MESSAGE_MAX
        ? t('church:messageTooLong', { max: CONTACT_MESSAGE_MAX })
        : t('church:invalidMessage'),
  };

  const submit = async () => {
    setSubmitError(null);
    const parsed = contactRequestSchema.safeParse({ name, email, message });
    if (!parsed.success) {
      const errors: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'email' || key === 'message') {
          errors[key] ??= fieldErrorCopy[key];
        }
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setPhase('sending');
    try {
      const body: ContactRequest = parsed.data;
      // The SDK types this response's error loosely; pin it to unknown and
      // narrow by instance below.
      const { error } = (await supabase.functions.invoke<ContactResponse>(
        'contact-form',
        { body },
      )) as { error: unknown };
      if (error) {
        if (error instanceof FunctionsHttpError) {
          setSubmitError(
            (await machineCode(error)) === 'rate_limited'
              ? t('church:rateLimited')
              : t('church:sendFailed'),
          );
        } else {
          // Fetch-level failure: no network is the usual cause.
          setSubmitError(t('church:offlineNote'));
        }
        setPhase('idle');
        return;
      }
      setPhase('sent');
    } catch {
      setSubmitError(t('church:sendFailed'));
      setPhase('idle');
    }
  };

  const labelStyle = {
    fontFamily: fontFamily.body.extraBold,
    fontSize: 12,
    letterSpacing: 0.7,
    textTransform: 'uppercase' as const,
    color: colors.muted,
    marginBottom: 7,
  };
  const inputStyle = {
    backgroundColor: colors.card,
    borderWidth: 1,
    // An input's edge is the whole of what says a field is there (W4.7 slice 2).
    borderColor: colors.controlline,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamily.body.regular,
    fontSize: 15.5,
    color: colors.text,
    minHeight: 52,
  };
  const errorStyle = {
    fontFamily: fontFamily.body.regular,
    fontSize: 12.5,
    color: palette.red,
    marginTop: 5,
  };

  if (phase === 'sent') {
    return (
      <Screen widthClass="capped" padded={false}>
        <AppHeader
          title={t('church:contactTitle')}
          backLabel={t('back')}
          onBack={() => {
            router.back();
          }}
        />
        <View style={{ paddingHorizontal: spacing.lg }}>
          <EmptyState
            title={t('church:sentTitle')}
            body={t('church:sentBody', { email })}
            actionLabel={t('church:sendAnother')}
            onAction={() => {
              setName('');
              setEmail('');
              setMessage('');
              setPhase('idle');
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen widthClass="capped" padded={false} keyboardPersistTaps>
        <AppHeader
          title={t('church:contactTitle')}
          backLabel={t('back')}
          onBack={() => {
            router.back();
          }}
        />

        <View style={{ paddingHorizontal: spacing.lg }}>
          {/* Mockup .lead. */}
          <Text
            style={{
              fontFamily: fontFamily.body.regular,
              fontSize: 14.5,
              lineHeight: 22,
              color: colors.sub,
              marginTop: 2,
              marginBottom: spacing.md,
            }}
          >
            {t('church:contactLead')}
          </Text>

          {/* Mockup .field/.lab/.inp. */}
          <View style={{ marginBottom: 14 }}>
            <Text nativeID="contact-name-label" style={labelStyle}>
              {t('church:nameLabel')}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('church:namePlaceholder')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('church:nameLabel')}
              autoComplete="name"
              textContentType="name"
              style={inputStyle}
            />
            {fieldErrors.name ? (
              <Text accessibilityLiveRegion="polite" style={errorStyle}>
                {fieldErrors.name}
              </Text>
            ) : null}
          </View>

          <View style={{ marginBottom: 14 }}>
            <Text nativeID="contact-email-label" style={labelStyle}>
              {t('church:emailLabel')}
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('church:emailPlaceholder')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('church:emailLabel')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              style={inputStyle}
            />
            {fieldErrors.email ? (
              <Text accessibilityLiveRegion="polite" style={errorStyle}>
                {fieldErrors.email}
              </Text>
            ) : null}
          </View>

          {/* Mockup .clabel + .txtarea (.clabel runs smaller and wider-set
              than .lab). */}
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={[labelStyle, { fontSize: 11, letterSpacing: 1.5 }]}>
              {t('church:messageLabel')}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t('church:messagePlaceholder')}
              placeholderTextColor={colors.muted}
              accessibilityLabel={t('church:messageLabel')}
              multiline
              textAlignVertical="top"
              style={[
                inputStyle,
                {
                  minHeight: 108,
                  paddingTop: 14,
                  paddingBottom: 14,
                  lineHeight: 22,
                },
              ]}
            />
            {fieldErrors.message ? (
              <Text accessibilityLiveRegion="polite" style={errorStyle}>
                {fieldErrors.message}
              </Text>
            ) : null}
          </View>

          {submitError ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13.5,
                lineHeight: 20,
                color: palette.red,
                marginBottom: spacing.sm,
              }}
            >
              {submitError}
            </Text>
          ) : null}

          <View style={{ paddingTop: 6, paddingBottom: spacing.lg }}>
            <Button
              label={
                phase === 'sending' ? t('church:sending') : t('church:send')
              }
              variant="primary"
              fullWidth
              loading={phase === 'sending'}
              onPress={() => {
                void submit();
              }}
            />
          </View>

          {/* Direct branch inboxes (docs/spec/04). Secondary list: it renders
              when the data is there and steps aside otherwise (the form above
              is this screen's primary surface). */}
          {contacts.data === undefined && !contacts.isError ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Skeleton height={14} width={180} />
              <Skeleton height={56} />
              <Skeleton height={56} />
            </View>
          ) : (contacts.data ?? []).length > 0 ? (
            <>
              <Text
                style={{
                  fontFamily: fontFamily.body.extraBold,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: colors.muted,
                  paddingTop: spacing.md,
                  paddingBottom: spacing.sm,
                  paddingHorizontal: spacing.xs,
                }}
              >
                {t('church:branchEmailsHeading')}
              </Text>
              <View style={{ gap: spacing.sm + 2 }}>
                {(contacts.data ?? []).map((branch) => (
                  <View
                    key={branch.id}
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.cardline,
                      borderRadius: radius.button,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: fontFamily.body.bold,
                        fontSize: 13.5,
                        color: colors.text,
                      }}
                    >
                      {[branch.name, branch.city].join(' · ')}
                    </Text>
                    <Text
                      accessibilityRole="link"
                      accessibilityLabel={`${branch.name} ${branch.email}`}
                      onPress={() => {
                        void Linking.openURL(`mailto:${branch.email}`);
                      }}
                      style={{
                        fontFamily: fontFamily.body.bold,
                        fontSize: 13,
                        color: colors.blue,
                        marginTop: 3,
                      }}
                    >
                      {branch.email}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : contacts.isError ? (
            // The list persists across launches, so this shows only on a genuine
            // fetch failure with nothing cached: keep the branch-email path
            // reachable with a retry rather than letting it vanish silently.
            <View style={{ marginTop: spacing.md, gap: 4 }}>
              <Text
                style={{
                  fontFamily: fontFamily.body.medium,
                  fontSize: 13,
                  color: colors.sub,
                }}
              >
                {t('errors:couldntLoad')}
              </Text>
              <Text
                accessibilityRole="button"
                accessibilityLabel={t('errors:tryAgain')}
                onPress={() => {
                  void contacts.refetch();
                }}
                style={{
                  fontFamily: fontFamily.body.bold,
                  fontSize: 13,
                  color: colors.blue,
                }}
              >
                {t('errors:tryAgain')}
              </Text>
            </View>
          ) : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
