'use client';

import { useFormStatus } from 'react-dom';

import { Button, type ButtonProps } from './Button';

/**
 * A submit button that knows its own form is busy.
 *
 * Its own component because `useFormStatus()` reports the form it is RENDERED INSIDE, so it
 * cannot live in the parent that owns the `<form>`. That constraint is why this kept being
 * rewritten locally: `AudioUploader` and `ArtworkUploader` each grew a private copy (W3.1),
 * and the broadcast review actions were about to be the third. Promoted here per
 * `~/.claude/standards/frontend.md`: a reusable widget buried in one screen is a widget the
 * next screen copies.
 *
 * WHAT IT IS ACTUALLY FOR, beyond looking busy. A server action that takes a moment gives no
 * sign it is running, so the reader clicks again. On the broadcast queue that second click
 * would be a second attempt to release a message to the whole ministry. The database refuses
 * it (approve_broadcast only accepts a row still `pending_approval`), so the damage is
 * bounded either way, but a control that stays live while it works is a control that invites
 * the double press, and the honest fix is at the button rather than in the refusal.
 */
export function SubmitButton({
  label,
  pendingLabel,
  ...props
}: {
  label: string;
  /** Shown while the form is submitting. Say what is happening, not "Loading". */
  pendingLabel: string;
} & Omit<ButtonProps, 'type' | 'children' | 'disabled'>) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
