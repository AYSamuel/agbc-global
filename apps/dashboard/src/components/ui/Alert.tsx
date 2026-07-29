import type { ReactNode } from 'react';

export interface AlertProps {
  /** 'error' announces assertively; 'info' is polite. */
  tone?: 'error' | 'info';
  title?: string;
  children: ReactNode;
}

/**
 * The form-level message. On a failed submit the caller moves focus here, so it carries
 * tabIndex={-1}: "the form has errors somewhere" is not recoverable for a screen reader
 * user (~/.claude/standards/frontend.md).
 */
export function Alert({ tone = 'error', title, children }: AlertProps) {
  const isError = tone === 'error';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      tabIndex={-1}
      className={
        // break-words: alert copy interpolates data (the address someone just typed),
        // and one long token must not widen the page.
        'rounded-control border px-4 py-3 text-body break-words ' +
        (isError
          ? 'border-danger text-danger'
          : 'border-cardline bg-alt text-text')
      }
    >
      {title ? <p className="font-extrabold">{title}</p> : null}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  );
}
