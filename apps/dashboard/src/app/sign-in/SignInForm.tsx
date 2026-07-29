'use client';

import { useRef, useState, type SyntheticEvent } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { copy } from '@/copy/en';
import { isNetworkError } from '@/lib/authErrors';
import { createClient } from '@/lib/supabase/client';

/**
 * Email OTP sign-in, the same identity the app uses (docs/spec/03, ADR 0011: a typed
 * six-digit code, never a magic link).
 *
 * Account enumeration is designed out: the message after "email me a code" is identical
 * whether or not that address belongs to anyone, and an unknown address simply never
 * receives a code. No new accounts are created here either. A profile is made by its
 * owner in the app at AUTH-3, and the dashboard is not a back door around that.
 */
export function SignInForm({ next }: { next: string }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  function fail(message: string, fieldId?: string) {
    setFormError(fieldId ? undefined : message);
    setFieldError(fieldId ? message : undefined);
    // Move focus to whichever message just appeared, so the failure is not silent for
    // anyone who cannot see it.
    requestAnimationFrame(() => {
      if (fieldId) document.getElementById(fieldId)?.focus();
      else alertRef.current?.focus();
    });
  }

  function clearMessages() {
    setFieldError(undefined);
    setFormError(undefined);
  }

  async function requestCode(event: SyntheticEvent) {
    event.preventDefault();
    clearMessages();

    const address = email.trim();
    if (!address) {
      fail(copy.signIn.errors.emailRequired, 'email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      fail(copy.signIn.errors.emailInvalid, 'email');
      return;
    }

    setBusy(true);
    try {
      const { error } = await createClient().auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false },
      });

      if (error && isNetworkError(error)) {
        fail(copy.signIn.errors.offline);
        return;
      }
      if (error?.status === 429) {
        fail(copy.signIn.errors.sendFailed);
        return;
      }

      // Any other error (most often "this address has no account") is swallowed on
      // purpose: telling the difference here is exactly the enumeration oracle.
      setNotice(copy.signIn.codeSent(address));
      setStep('code');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: SyntheticEvent) {
    event.preventDefault();
    clearMessages();

    const token = code.trim();
    if (token.length === 0) {
      fail(copy.signIn.errors.codeRequired, 'code');
      return;
    }

    setBusy(true);
    try {
      const { error } = await createClient().auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
      });

      if (error) {
        fail(
          isNetworkError(error)
            ? copy.signIn.errors.offline
            : copy.signIn.errors.codeInvalid,
        );
        return;
      }

      // A full navigation, not router.push(). The session cookies were just written by
      // the browser client, and a client-side transition can be served from the router
      // cache or race a prefetch that carried no cookie, which shows a signed-out page
      // to someone who just signed in (Supabase's SSR advanced guide names this).
      window.location.assign(next);
    } finally {
      setBusy(false);
    }
  }

  if (step === 'email') {
    return (
      <form
        onSubmit={(event) => {
          void requestCode(event);
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
          id="email"
          label={copy.signIn.emailLabel}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          value={email}
          error={fieldError}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
        <Button type="submit" block disabled={busy}>
          {busy ? copy.signIn.sending : copy.signIn.sendCode}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void submitCode(event);
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {formError ? (
        <div ref={alertRef} tabIndex={-1}>
          <Alert>{formError}</Alert>
        </div>
      ) : null}
      <TextField
        id="code"
        label={copy.signIn.codeLabel}
        // Never block paste, and let the OS offer the code straight from the email.
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
        {busy ? copy.signIn.verifying : copy.signIn.verify}
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          setStep('email');
          setCode('');
          setNotice(undefined);
          clearMessages();
        }}
      >
        {copy.signIn.useAnotherEmail}
      </Button>
    </form>
  );
}
