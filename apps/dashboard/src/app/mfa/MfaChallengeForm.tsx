'use client';

import { useRef, useState, type SyntheticEvent } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/copy/en';
import { isNetworkError } from '@/lib/authErrors';
import { createClient } from '@/lib/supabase/client';

/**
 * The TOTP challenge: shown when a session has an enrolled factor it has not cleared,
 * and again once a cleared one goes stale (authorize()'s MFA_FRESHNESS_MS).
 *
 * A fresh challenge per attempt, per the Supabase guide: a challenge is consumed by the
 * verify that follows it, so reusing one after a mistyped code fails for the wrong
 * reason and reads to the leader as "my authenticator is broken".
 */
export function MfaChallengeForm({ next }: { next: string }) {
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  function showFormError(message: string) {
    setFormError(message);
    requestAnimationFrame(() => alertRef.current?.focus());
  }

  async function confirm(event: SyntheticEvent) {
    event.preventDefault();
    setFieldError(undefined);
    setFormError(undefined);

    if (code.trim().length === 0) {
      setFieldError(copy.mfa.errors.codeRequired);
      document.getElementById('mfa-code')?.focus();
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();

      // `totp` here is exactly right: listFactors() pre-filters it to verified factors,
      // and only a verified factor can answer a challenge.
      const { data: factors, error: listError } =
        await supabase.auth.mfa.listFactors();
      const totp = factors?.totp[0];
      if (listError || !totp) {
        showFormError(copy.mfa.errors.enrolFailed);
        return;
      }

      const challenge = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      });
      if (challenge.error) {
        showFormError(
          isNetworkError(challenge.error)
            ? copy.mfa.errors.offline
            : copy.mfa.errors.codeInvalid,
        );
        return;
      }

      const verify = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) {
        showFormError(
          isNetworkError(verify.error)
            ? copy.mfa.errors.offline
            : copy.mfa.errors.codeInvalid,
        );
        return;
      }

      window.location.assign(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        void confirm(event);
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      {formError ? (
        <div ref={alertRef} tabIndex={-1}>
          <Alert>{formError}</Alert>
        </div>
      ) : null}
      <TextField
        id="mfa-code"
        label={copy.mfa.codeLabel}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={code}
        error={fieldError}
        onChange={(event) => {
          setCode(event.target.value);
        }}
      />
      <Button type="submit" block disabled={busy}>
        {busy ? copy.mfa.confirming : copy.mfa.confirm}
      </Button>
    </form>
  );
}
