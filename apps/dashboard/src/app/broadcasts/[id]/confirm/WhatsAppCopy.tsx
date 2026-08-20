'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';

/**
 * "Copy for WhatsApp" (CONFIRM frame; `17` §2, ADR 0014).
 *
 * NOT A SEND, and the copy says so, because this is the only route that reaches people who
 * do not have the app and it would be easy to read the button as a second channel. Nothing
 * leaves the dashboard: the text goes to the clipboard and a human decides what to do with
 * it. It carries no member data, only the words the church wrote.
 *
 * The confirmation is a state rather than a toast because there is nothing to dismiss, and
 * it is announced, because a copy that only changes a label is not a result for a reader
 * using a screen reader.
 */
export function WhatsAppCopy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Notice
      tone="off"
      title={copy.broadcasts.whatsappTitle}
      action={
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied
            ? copy.broadcasts.whatsappCopied
            : copy.broadcasts.whatsappAction}
        </Button>
      }
    >
      {copy.broadcasts.whatsappBody}
      <span aria-live="polite" className="sr-only">
        {copied ? copy.broadcasts.whatsappCopied : ''}
      </span>
    </Notice>
  );
}
