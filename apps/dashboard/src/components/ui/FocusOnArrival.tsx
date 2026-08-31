'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Puts focus on a message that arrived with the page.
 *
 * WHY THIS EXISTS. `~/.claude/standards/frontend.md` asks for two things that turn out to be
 * the same thing here: a failed submit moves focus to its error summary, and a client-side
 * route change moves focus rather than leaving it where the old page was. Every outcome in the
 * Academy module arrives as a `redirect()` from a Server Action, so both rules apply at once
 * and neither was met: the control that was focused is destroyed by the navigation, focus
 * falls to `<body>`, and a keyboard user who mistyped a confirmation name lands at the top of
 * a fresh page eleven tab stops from the field they have to fix.
 *
 * A live region does not cover it either. `Alert` and `Notice` already carry the right role
 * and `aria-live`, but a region that is INSERTED by a navigation rather than updated in place
 * is announced unreliably, so on a bad day the reader is told nothing at all about a link that
 * has just been made in somebody's name.
 *
 * WHY A CLIENT COMPONENT IS NOT A RETREAT FROM THE NO-JAVASCRIPT SHAPE. Every screen in this
 * module works with HTML alone and still does: the search is a GET form, choosing somebody is
 * a link, and the message this wraps renders and reads correctly with scripting off. All that
 * is lost without JavaScript is the focus move, which is the definition of an enhancement.
 * Both `Alert` and `Notice` already set `tabIndex={-1}` "for the caller that moves focus
 * here"; until now this module had no such caller.
 *
 * `signal` is the outcome the message is about. It is in the dependency array because the App
 * Router reuses this instance across two `/academy?outcome=…` renders, so a mount-only effect
 * would announce the first outcome and silently skip every one after it.
 */
export function FocusOnArrival({
  signal,
  children,
}: {
  signal: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Deferred a frame, the same way `MfaChallengeForm` defers its own: focusing inside the
    // commit that inserted the node can be dropped by the browser.
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [signal]);

  // No outline suppression, deliberately. It is only reachable programmatically, so the ring
  // never appears while tabbing, and when it does appear it is telling a keyboard user exactly
  // where they have been put.
  return (
    <div ref={ref} tabIndex={-1}>
      {children}
    </div>
  );
}
