import Link from 'next/link';

import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';

/**
 * What a leader sees on every shelf route (frame: `SERMON-AUDIO-REFUSED`).
 *
 * The rail shows Sermon audio to every staff caller and the shelf is admin work (`17`
 * §4: one shelf serves every branch), so the refusal names what IS theirs and links to
 * it, the `VersesRefusal` shape. One component across all three routes: a leader who
 * types `/sermon-audio/new` is in the same position as one who followed the rail.
 */
export function ShelfRefusal() {
  return (
    <Notice
      tone="off"
      title={copy.sermonAudio.notAdminTitle}
      action={
        <Link
          href="/moderation"
          className="inline-flex min-h-12 items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
        >
          {copy.sermonAudio.notAdminAction}
        </Link>
      }
    >
      {copy.sermonAudio.notAdminBody}
    </Notice>
  );
}
