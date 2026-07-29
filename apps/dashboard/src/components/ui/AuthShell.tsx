import type { ReactNode } from 'react';

export interface AuthShellProps {
  title: string;
  intro?: string;
  children: ReactNode;
}

/**
 * The single-column layout every pre-dashboard screen uses: sign in, the MFA ceremonies,
 * and the honest refusals.
 *
 * Width is capped and centred so it does not stretch on a desktop monitor, and the
 * padding is fluid so it still breathes on a narrow window. Nothing assumes viewport
 * height: the column scrolls if the content or the text size outgrows the screen.
 */
export function AuthShell({ title, intro, children }: AuthShellProps) {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col justify-center gap-6 px-5 py-10 sm:px-6"
    >
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-section leading-tight font-extrabold text-text">
          {title}
        </h1>
        {intro ? (
          <p className="text-body leading-relaxed text-sub">{intro}</p>
        ) : null}
      </header>
      {children}
    </main>
  );
}
