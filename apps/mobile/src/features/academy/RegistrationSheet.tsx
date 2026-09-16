import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { CONTACT_MESSAGE_MAX } from '@agbc/shared';
import { spacing } from '@agbc/shared/theme';

import {
  Button,
  Sheet,
  SheetBody,
  SheetRow,
  SheetTitle,
  TextArea,
  useSheetDismiss,
  useToast,
} from '@/components/ui';
import type { ContactAttempt } from '@/lib/contactForm';
import {
  sendRegistrationMessage,
  type RegistrationContactOutcome,
} from './registrationContact';
import type { RegistrationRow } from './queries';
import { useAuthStore } from '@/state/auth';

// REGISTRATION-CONTACT (mockup frame composed 2026-08-10): the sheet behind
// "Email us about this registration". Members do not cancel from the app; the
// message goes to the contact-form inbox with the course and a short reference
// attached (registrationContact.ts), and a human answers, including for
// cancellations and refunds. The prefill names the common case and stays
// editable; sending resets nothing until it has actually sent.

export interface RegistrationSheetProps {
  visible: boolean;
  courseName: string;
  registration: RegistrationRow;
  onDismiss: () => void;
}

export function RegistrationSheet({
  visible,
  courseName,
  registration,
  onDismiss,
}: RegistrationSheetProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const displayName = useAuthStore((state) => state.profile?.displayName ?? '');
  const email = useAuthStore((state) => state.email ?? '');

  const [text, setText] = useState(() => t('academy:contactPrefill'));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The last attempt's words and key, kept across a failure so the same words retry
  // under the same key; cleared on success so the next message starts fresh.
  const [attempt, setAttempt] = useState<ContactAttempt | null>(null);

  // Every exit resets to the prefill, so the next opening starts from the
  // frame's editable default rather than a previous, possibly sent, visit.
  const close = () => {
    setText(t('academy:contactPrefill'));
    setError(null);
    onDismiss();
  };
  const dismiss = useSheetDismiss(t('academy:contactDismissed'), close);

  const send = async () => {
    const message = text.trim();
    if (message === '') {
      setError(t('academy:contactEmpty'));
      return;
    }
    setSending(true);
    setError(null);
    // The key rides with the words (W4.18 slice 3): a retry of the same text goes out
    // under the same key and cannot arrive twice; edited text mints a new one.
    const sent = await sendRegistrationMessage(
      {
        name: displayName,
        email,
        courseName,
        registrationId: registration.id,
        text: message,
      },
      attempt,
    );
    const outcome: RegistrationContactOutcome = sent.outcome;
    setSending(false);
    if (outcome === 'sent') {
      setAttempt(null);
      toast.show(t('academy:contactSent'));
      close();
      return;
    }
    setAttempt(sent.attempt);
    setError(
      outcome === 'rate_limited'
        ? t('academy:contactRateLimited')
        : outcome === 'unconfirmed'
          ? t('academy:contactUnconfirmed')
          : t('academy:contactFailed'),
    );
  };

  return (
    <Sheet
      visible={visible}
      dismissLabel={t('notNow')}
      onDismiss={dismiss}
      avoidKeyboard
    >
      <SheetTitle label={t('academy:contactTitle')} />
      <SheetBody text={t('academy:contactBody', { course: courseName })} />
      <View style={{ marginBottom: 14 }}>
        <TextArea
          label={t('academy:contactTitle')}
          value={text}
          onChangeText={setText}
          max={CONTACT_MESSAGE_MAX}
          error={error}
          editable={!sending}
        />
      </View>
      <View style={{ marginBottom: spacing.sm }}>
        <Button
          label={t('academy:contactSend')}
          variant="primary"
          fullWidth
          loading={sending}
          onPress={() => {
            void send();
          }}
        />
      </View>
      <SheetRow label={t('notNow')} onPress={dismiss} />
    </Sheet>
  );
}
