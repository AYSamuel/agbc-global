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
    const outcome: RegistrationContactOutcome = await sendRegistrationMessage({
      name: displayName,
      email,
      courseName,
      registrationId: registration.id,
      text: message,
    });
    setSending(false);
    if (outcome === 'sent') {
      toast.show(t('academy:contactSent'));
      close();
      return;
    }
    setError(
      outcome === 'rate_limited'
        ? t('academy:contactRateLimited')
        : outcome === 'offline'
          ? t('academy:contactOffline')
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
