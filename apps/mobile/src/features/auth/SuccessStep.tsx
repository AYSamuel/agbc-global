import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { SuccessScreen } from '@/components/ui';
import { useAuthStore } from '@/state/auth';
import { useGateStore, type GateActionKind } from '@/state/gate';

// AUTH-4 (docs/spec/03, mockup frame line 1080): the .success layout, now drawn
// by the shared SuccessScreen so the branch-change arrival cannot drift from it.
// What stays here is what belongs to this STEP: the copy names the pending gate
// action where one exists ("...to say Glory to God", the frame's line), and the
// screen hands the user back automatically after a short beat (docs/spec/03
// "performs it automatically"; decided 2026-07-26); Continue skips the wait.

const AUTO_CONTINUE_MS = 1200;

const BODY_BY_KIND: Partial<Record<GateActionKind, string>> = {
  glory: 'successBodyGlory',
  intercede: 'successBodyIntercede',
  compose: 'successBodyCompose',
  rsvp: 'successBodyRsvp',
};

export interface SuccessStepProps {
  onContinue: () => void;
}

export function SuccessStep({ onContinue }: SuccessStepProps) {
  const { t } = useTranslation('auth');
  const name = useAuthStore((s) => s.profile?.displayName ?? '');
  const pendingKind = useGateStore((s) => s.pending?.kind ?? null);
  const bodyKey = (pendingKind && BODY_BY_KIND[pendingKind]) ?? 'successBody';

  // Once-guarded: the timer and a Continue tap must not both navigate. The
  // latest-ref is written in an effect (never during render, compiler rule);
  // the mount-once timer then always calls the current handler.
  const doneRef = useRef(false);
  const continueOnce = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onContinue();
  };
  const continueRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    continueRef.current = continueOnce;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      continueRef.current();
    }, AUTO_CONTINUE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <SuccessScreen
      title={t('successTitle')}
      body={t(bodyKey, { name })}
      actionLabel={t('continue')}
      onAction={continueOnce}
    />
  );
}
