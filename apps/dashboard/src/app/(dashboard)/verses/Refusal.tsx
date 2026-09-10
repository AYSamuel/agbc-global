import Link from 'next/link';

import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';

/**
 * What a leader sees on every verse route (frame: `VERSES-REFUSED`).
 *
 * The rail shows Daily verses to every staff caller, and the schedule is admin-only
 * (`17` §23, and the table's "admins manage daily verses" policy). PR #116 fixed exactly
 * this shape on People: a row leading somewhere the caller cannot act, with no route
 * onward. So the refusal names what IS theirs and links to it.
 *
 * One component rather than one per route, because the value of the refusal is that it
 * appears on ALL of them: a leader who types `/verses/new` is in the same position as one
 * who followed the rail, and would otherwise meet a form that could only fail on save.
 */
export function VersesRefusal() {
  return (
    <Notice
      tone="off"
      title={copy.verses.notAdminTitle}
      action={
        <Link
          href="/people/requests"
          className="inline-flex min-h-12 items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
        >
          {copy.verses.notAdminAction}
        </Link>
      }
    >
      {copy.verses.notAdminBody}
    </Notice>
  );
}
