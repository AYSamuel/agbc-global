import type { ReactNode } from 'react';

/**
 * The mockup's `.pill`: a small uppercase label that says what KIND of thing this is.
 *
 * Promoted after a third private copy appeared (the queue's kinds, the People role pill,
 * the requests board). The tones are named for what they MEAN on this dashboard rather
 * than for their colour or for the surface that first used them, because the same wash
 * has to serve a content type, a role and a request state without reading as any one of
 * them:
 *
 *  - `notice`  gold. Something carrying weight: a testimony waiting, a role held.
 *  - `info`    blue. A neutral classification: a prayer request.
 *  - `quiet`   the alt surface. Metadata rather than news: a language, a past move.
 *  - `urgent`  red. Something is late.
 *  - `good`    green. Done and healthy: audio on the shelf. The fifth tone this file said
 *              would take a conversation, and it took one: nothing in moderation is ever
 *              "done and healthy", so the meaning genuinely did not exist here until the
 *              sermon-audio frames (W3.1, approved 2026-08-14) needed it. Wash verbatim
 *              from entry-flow's `.pill.live`, which carries no dark override either.
 *
 * If a future surface needs a tone that is none of these, that is worth a conversation
 * rather than a sixth colour: five is already the point at which a reader stops decoding
 * them and starts ignoring them.
 */
export type PillTone = 'notice' | 'info' | 'quiet' | 'urgent' | 'good';

const TONES: Record<PillTone, string> = {
  // Washes taken from the mockup's `.pill` rules; the gold uses the deep token because
  // bright gold fails contrast on a light surface (`05`).
  notice: 'bg-[rgba(185,134,0,0.18)] text-gold-deep dark:text-accent',
  info: 'bg-[rgba(47,111,237,0.14)] text-blue',
  quiet: 'bg-alt text-muted',
  urgent: 'bg-[rgba(224,52,44,0.14)] text-danger',
  good: 'bg-[rgba(31,138,91,0.14)] text-success',
};

export function Pill({
  tone = 'quiet',
  children,
}: {
  tone?: PillTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[0.62rem] font-extrabold tracking-wider whitespace-nowrap uppercase ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
