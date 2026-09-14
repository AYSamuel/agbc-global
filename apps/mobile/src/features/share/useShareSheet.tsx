import { useCallback, useState, type ReactElement } from 'react';

import { shareText } from '@/features/family/share';
import { track } from '@/lib/analytics';

import { PICTURE_SHARE_LINKED } from './capture';
import type { ShareContent } from './content';
import { SharePreviewSheet } from './SharePreviewSheet';

/**
 * One share sheet per screen, and one owner of what happens before it opens (W4.15
 * slice 2).
 *
 * Five surfaces reached the sheet in slice 2 and each would otherwise have carried its
 * own `useState`, its own dev-client degrade and its own `track` call. This puts all of
 * that behind `open()`, so a call site says what it wants to share and nothing about how.
 *
 * THE DEV-CLIENT DEGRADE LIVES HERE AND NOWHERE ELSE. A client built before W4.15 carries
 * neither native module, so there is no picture to preview and opening the sheet would do
 * nothing but apologise: the button sends the words exactly as it did for a year instead.
 * Recorded as `text_after_failure` rather than `text`, because the member expressed no
 * preference and `text` is reserved for somebody who chose words.
 *
 * The sheet stays mounted after it closes, with the last content still in it, so the
 * Modal gets its slide-out rather than vanishing on unmount.
 */
export interface ShareSheetHandle {
  /** Show the preview for this content; `fallbackText` is what the text buttons send. */
  open: (content: ShareContent, fallbackText: string) => void;
  /** Render this once, anywhere in the screen's tree. */
  element: ReactElement | null;
}

interface Pending {
  content: ShareContent;
  fallbackText: string;
  visible: boolean;
}

export function useShareSheet(): ShareSheetHandle {
  const [pending, setPending] = useState<Pending | null>(null);

  const open = useCallback((content: ShareContent, fallbackText: string) => {
    if (!PICTURE_SHARE_LINKED) {
      void shareText(fallbackText);
      track('content_shared', {
        content_kind: content.kind,
        sent_as: 'text_after_failure',
      });
      return;
    }
    setPending({ content, fallbackText, visible: true });
  }, []);

  const close = useCallback(() => {
    setPending((current) =>
      current === null ? null : { ...current, visible: false },
    );
  }, []);

  const element =
    pending === null ? null : (
      <SharePreviewSheet
        visible={pending.visible}
        content={pending.content}
        fallbackText={pending.fallbackText}
        onClose={close}
      />
    );

  return { open, element };
}
