import type { ReactNode, Ref } from 'react';

/**
 * The mockup's `.banner`: an icon, a headline, a sentence, and sometimes one action.
 *
 * Distinct from `Alert`, and worth saying why rather than leaving two similar components
 * to be merged by someone later. `Alert` is the form-level message: one line, no icon,
 * announced. This is the page-level statement of a SITUATION, which is what the dashboard
 * frames use for "no account for that address", "this would leave a branch with no
 * leader", "we could not load the queue" and "you are offline". They are not the same
 * element in the design and collapsing them would flatten both.
 *
 * The three tones are the mockup's three variants:
 *
 *  - `plain` states an outcome. The icon is red because in this product a banner is
 *    usually news you did not want, which is the mockup's own default.
 *  - `bad` outlines in danger and is for a refusal or a warning about consequences.
 *  - `off` mutes the icon: nothing is wrong with the news, or with the reader.
 *  - `good` greens the icon into a check: the thing worked and the banner says what is
 *    now true. First needed by the sermon-audio "uploaded and read" moment (W3.1 frames,
 *    approved 2026-08-14); until then no banner in this product ever carried good news.
 *  - `tell` blues the icon into an envelope: this save will REACH somebody. The frame's
 *    `.banner.tell` (W3.5 slice 4, approved 2026-08-20), and blue for the reason every
 *    other blue in this file is blue: it classifies rather than warns. Red is kept for the
 *    cancellation, which is the one that cannot be taken back off a lock screen.
 */
export type NoticeTone = 'plain' | 'bad' | 'off' | 'good' | 'tell';

export interface NoticeProps {
  tone?: NoticeTone;
  title: string;
  children: ReactNode;
  /** A single control, right-aligned, the way the frame places "Look again". */
  action?: ReactNode;
  /**
   * Announce it when it appears. Every use of this component so far is the result of
   * something the reader just did, and a result that only exists visually is not a
   * result for everyone.
   */
  live?: 'polite' | 'assertive';
  /**
   * Take focus programmatically after a failed submit (frontend.md: an error summary the
   * keyboard lands on). Only ever set by our own code, never left to the framework.
   */
  ref?: Ref<HTMLDivElement>;
}

const TONES: Record<
  NoticeTone,
  { border: string; icon: string; glyph: string }
> = {
  plain: { border: 'border-cardline', icon: 'text-danger', glyph: 'ℹ' },
  bad: { border: 'border-danger', icon: 'text-danger', glyph: '⚠' },
  // ℹ muted, not the mockup's ◯. That glyph belongs to its OFFLINE banner, where a hollow
  // circle reads as "disconnected"; next to a sentence it reads as an unfinished radio
  // button, which is what it looked like on the refusal screen (seen 2026-08-01).
  off: { border: 'border-cardline', icon: 'text-muted', glyph: 'ℹ' },
  good: { border: 'border-cardline', icon: 'text-success', glyph: '✓' },
  tell: { border: 'border-cardline', icon: 'text-blue', glyph: '✉' },
};

export function Notice({
  tone = 'plain',
  title,
  children,
  action,
  live,
  ref,
}: NoticeProps) {
  const style = TONES[tone];

  return (
    <div
      ref={ref}
      role={live === 'assertive' ? 'alert' : live ? 'status' : undefined}
      aria-live={live}
      // -1 rather than nothing: a div that our code may focus must be focusable, and a
      // div that is never focused loses nothing by being reachable only that way.
      tabIndex={live ? -1 : undefined}
      className={`mt-4 flex flex-wrap items-start gap-3 rounded-button border bg-card px-4 py-3.5 ${style.border}`}
    >
      <span aria-hidden="true" className={`mt-px flex-none ${style.icon}`}>
        {style.glyph}
      </span>
      {/* A floor on the text column, not `min-w-0`. The row wraps, but with no floor the
          action beside it never wrapped: the sentence shrank to a five-character ribbon
          instead, which is what "German has no verses at all" looked like at 390px
          (seen 2026-08-02). Below this width the action drops to its own line.
          `min(14rem, 100%)` and not a flat 14rem, because rem follows the reader's own
          font size: at 200% text on a small window a flat floor is wider than the card it
          sits in, and the page scrolls sideways (measured the same afternoon). */}
      <div className="min-w-[min(14rem,100%)] flex-1">
        <h2 className="font-display text-body font-extrabold text-text">
          {title}
        </h2>
        {/* break-words: these sentences interpolate data (an address someone typed, a
            branch name), and one long token must not widen the page. */}
        <p className="mt-1 text-body leading-normal break-words text-sub">
          {children}
        </p>
      </div>
      {action ? <div className="ml-auto self-center">{action}</div> : null}
    </div>
  );
}
