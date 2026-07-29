'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/copy/en';
import { createClient } from '@/lib/supabase/client';

interface Factor {
  id: string;
  qrCode: string;
  secret: string;
}

/**
 * TOTP enrolment (docs/spec/17 staff MFA).
 *
 * `17` and the security standard both ask for phishing-resistant MFA (passkeys). This is
 * TOTP, and that gap is deliberate and recorded: Supabase's passkey support is still
 * beta and its docs reserve the right to change the API without notice, which is not
 * something to put under the accounts that can publish to the whole ministry. Revisit
 * when passkeys reach GA; the enrolment shape here barely changes.
 */
export function MfaEnrolForm({ next }: { next: string }) {
  const [factor, setFactor] = useState<Factor | undefined>();
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Strict Mode mounts effects twice in development, and every enroll() call creates a
    // real factor. Without this guard a dev reload quietly burns through the account's
    // 10-factor ceiling.
    if (started.current) return;
    started.current = true;

    void (async () => {
      const supabase = createClient();

      // Clear out any half-finished factor from a previous attempt first. The secret is
      // only ever returned once, so a leader who navigated away mid-setup can never
      // scan that old factor; leaving it behind just blocks the friendly name and eats
      // the ceiling.
      //
      // `all`, not `totp`: listFactors() pre-filters the per-type arrays to VERIFIED
      // factors only, so `data.totp` can never contain the thing being cleaned up here.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const halfFinished =
        existing?.all.filter(
          (candidate) =>
            candidate.factor_type === 'totp' && candidate.status !== 'verified',
        ) ?? [];
      for (const stale of halfFinished) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'AGBC Dashboard',
      });

      if (error) {
        setFormError(copy.mfa.errors.enrolFailed);
        return;
      }

      setFactor({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    })();
  }, []);

  function showFormError(message: string) {
    setFormError(message);
    requestAnimationFrame(() => alertRef.current?.focus());
  }

  async function confirm(event: SyntheticEvent) {
    event.preventDefault();
    setFieldError(undefined);
    setFormError(undefined);

    if (!factor) return;
    if (code.trim().length === 0) {
      setFieldError(copy.mfa.errors.codeRequired);
      document.getElementById('mfa-code')?.focus();
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const challenge = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (challenge.error) {
        showFormError(copy.mfa.errors.codeInvalid);
        return;
      }

      const verify = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) {
        showFormError(copy.mfa.errors.codeInvalid);
        return;
      }

      // Full navigation: the session cookies were just upgraded to aal2 and the server
      // has to read the new ones, not a cached render from before the upgrade.
      window.location.assign(next);
    } finally {
      setBusy(false);
    }
  }

  if (formError && !factor) {
    return <Alert>{formError}</Alert>;
  }

  if (!factor) {
    // Loading. Real dimensions, so nothing jumps when the QR arrives.
    return (
      <div
        className="h-54 w-full animate-pulse rounded-card bg-alt"
        role="status"
        aria-label="Preparing your setup code"
      />
    );
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

      {/* Supabase returns the QR as an SVG data URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL: there is
          nothing for the image optimizer to fetch or resize. */}
      <img
        src={factor.qrCode}
        alt={copy.mfa.qrAlt}
        width={200}
        height={200}
        className="self-center rounded-card bg-card p-3"
      />

      {/* The typed alternative, because a QR is unusable for anyone who cannot see it,
          and for anyone whose authenticator lives on this same device. */}
      <div className="flex flex-col gap-2">
        <p className="text-body font-semibold text-sub">
          {copy.mfa.secretLabel}
        </p>
        <code className="rounded-control border border-cardline bg-alt px-4 py-3 text-body break-all text-text">
          {factor.secret}
        </code>
      </div>

      <TextField
        id="mfa-code"
        label={copy.mfa.codeLabel}
        inputMode="numeric"
        autoComplete="one-time-code"
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
