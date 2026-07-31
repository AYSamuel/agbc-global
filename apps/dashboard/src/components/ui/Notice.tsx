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
 */
export type NoticeTone = 'plain' | 'bad' | 'off';

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
  off: { border: 'border-cardline', icon: 'text-muted', glyph: '◯' },
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
      <div className="min-w-0 flex-1">
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
