import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, palette } from '@agbc/shared/theme';

import { OtpInput, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';
import { useTheme } from '@/theme';

import { AuthLayout } from './AuthLayout';
import { mapAuthError, type AuthErrorKey } from './errors';
import { maskEmail } from './maskEmail';
import { tryReviewSignin } from './reviewFallback';

// AUTH-2 (docs/spec/03, mockup frame line 1042): six-cell code entry that
// verifies itself on the sixth digit (the frame has no verify button), 30s
// resend timer, masked sent-to, spam hint after ~20s, support hint after two
// failures. The review bypass runs ONLY as a fallback to a rejected code and
// stays invisible to real members (one extra request on a wrong code).

const RESEND_COOLDOWN_MS = 30_000;
const SPAM_HINT_AFTER_MS = 20_000;

export interface CodeStepProps {
  email: string;
  sentAt: number;
  onChangeEmail: () => void;
  onVerified: (next: 'onboarding' | 'member') => void;
  onResent: (sentAt: number) => void;
}

function formatCountdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

export function CodeStep({
  email,
  sentAt,
  onChangeEmail,
  onVerified,
  onResent,
}: CodeStepProps) {
  const { t, i18n } = useTranslation('auth');
  const { colors } = useTheme();
  const toast = useToast();
  const completeSignIn = useAuthStore((s) => s.completeSignIn);

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorKey, setErrorKey] = useState<AuthErrorKey | null>(null);
  const [failCount, setFailCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // The latest attempt wins: a stale verify resolving after a resend or a
  // cleared input must not navigate (guard against races, frontend standard).
  const attemptRef = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(tick);
    };
  }, []);

  const sinceSend = now - sentAt;
  const resendRemaining = RESEND_COOLDOWN_MS - sinceSend;
  const canResend = resendRemaining <= 0;
  const showSpamHint = sinceSend >= SPAM_HINT_AFTER_MS;

  const verify = async (token: string) => {
    const attempt = ++attemptRef.current;
    setVerifying(true);
    setErrorKey(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (attempt !== attemptRef.current) return;
      if (error) {
        const key = mapAuthError(error, 'verify', Date.now() - sentAt);
        // A rejected code might be the store-review fixed code: server-checked,
        // uniform, and a no-op for everyone else (docs/spec/03 §Security).
        if (
          key === 'errorInvalidCode' &&
          (await tryReviewSignin(email, token))
        ) {
          if (attempt !== attemptRef.current) return;
        } else {
          if (attempt !== attemptRef.current) return;
          setCode('');
          setFailCount((count) => count + 1);
          setErrorKey(key);
          return;
        }
      }
      const next = await completeSignIn();
      if (attempt !== attemptRef.current) return;
      onVerified(next);
    } catch (caught) {
      if (attempt !== attemptRef.current) return;
      setCode('');
      setFailCount((count) => count + 1);
      setErrorKey(mapAuthError(caught, 'verify', Date.now() - sentAt));
    } finally {
      if (attempt === attemptRef.current) setVerifying(false);
    }
  };

  const onCodeChange = (next: string) => {
    setCode(next);
    if (errorKey) setErrorKey(null);
    if (next.length === 6 && !verifying) void verify(next);
  };

  const resend = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, data: { language: i18n.language } },
    });
    if (error) {
      setErrorKey(mapAuthError(error, 'send'));
      return;
    }
    attemptRef.current += 1;
    setCode('');
    setErrorKey(null);
    toast.show(t('resent'));
    onResent(Date.now());
  };

  return (
    <AuthLayout
      title={t('codeTitle')}
      leadNode={
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 14.5,
            lineHeight: 22,
            color: colors.sub,
            marginBottom: 22,
          }}
        >
          <Trans
            t={t}
            i18nKey="codeLead"
            values={{ email: maskEmail(email) }}
            components={{
              1: (
                <Text
                  style={{
                    fontFamily: fontFamily.body.bold,
                    color: colors.text,
                  }}
                />
              ),
            }}
          />
        </Text>
      }
      showMailIcon
      backLabel={t('common:back')}
      onBack={onChangeEmail}
    >
      <OtpInput
        value={code}
        onChange={onCodeChange}
        accessibilityLabel={t('codeInputLabel')}
        autoFocus
        disabled={verifying}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {canResend ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('resendCode')}
            onPress={() => void resend()}
            hitSlop={8}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 13.5,
                color: colors.blue,
              }}
            >
              {t('resendCode')}
            </Text>
          </Pressable>
        ) : (
          <Text
            style={{
              fontFamily: fontFamily.body.semiBold,
              fontSize: 13.5,
              color: colors.sub,
            }}
          >
            {t('resendCountdown', { time: formatCountdown(resendRemaining) })}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('changeEmail')}
          onPress={onChangeEmail}
          hitSlop={8}
        >
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 13.5,
              color: colors.blue,
            }}
          >
            {t('changeEmail')}
          </Text>
        </Pressable>
      </View>
      {errorKey ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            lineHeight: 19,
            color: palette.red,
            marginTop: 10,
          }}
        >
          {t(errorKey)}
        </Text>
      ) : null}
      {showSpamHint && !errorKey ? (
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            lineHeight: 19,
            color: colors.muted,
            marginTop: 10,
          }}
        >
          {t('spamHint')}
        </Text>
      ) : null}
      {failCount >= 2 ? (
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12.5,
            lineHeight: 19,
            color: colors.muted,
            marginTop: 10,
          }}
        >
          {t('supportHint')}
        </Text>
      ) : null}
      <View style={{ flex: 1, minHeight: 16 }} />
    </AuthLayout>
  );
}
