import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { DashboardShell } from '@/components/DashboardShell';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBranchRequests } from '@/server/branchRequests';

/**
 * The shell, for every signed-in dashboard route (W4.12 slice 4).
 *
 * WHAT THIS IS ACTUALLY FOR, beyond removing 31 copies of the same wrapper. Next preserves
 * a layout across a client-side navigation and re-renders only the page beneath it, so the
 * rail stops being torn down and rebuilt on every click, and `loading.tsx` gets somewhere
 * to render that is not the whole screen. Without this, a loading state would blank the
 * navigation along with the content, which is worse than the blank page it replaced. It is
 * the reason slice 5 comes after this one rather than before.
 *
 * A ROUTE GROUP, so no URL changes. `(dashboard)` is parentheses on purpose: `/moderation`
 * is still `/moderation`, which is what let 83 files move without a single redirect.
 *
 * `/`, `/sign-in`, `/mfa` and `/auth` stay outside it, and must: they are the screens a
 * caller sees when they have no rail to be shown. `/` in particular renders `AuthShell` and
 * redirects a legitimate leader straight to `/moderation`.
 *
 * THIS IS NOT THE AUTHORIZATION BOUNDARY, and nothing here should be mistaken for one. Each
 * page still awaits its own `authorize()` for its own action, which is what `17` requires
 * and what a layout cannot do on its behalf: Next does not re-run a layout on every
 * client-side navigation, so a check that lived only here would go stale the moment a
 * caller moved between routes without a reload. The check here exists to decide what the
 * SHELL should show, and to send a signed-out visitor somewhere useful. The database is
 * still the boundary.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'access_dashboard' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    // A member, a closed account, or a session with no profile. `/` holds those
    // explanations, because they are about the person rather than about a screen.
    redirect('/');
  }

  const { caller } = verdict;

  // The rail's badge, read once for the whole shell rather than by the three pages that
  // used to pass it. Two things follow from moving it here, and both are improvements.
  // It now appears on EVERY screen instead of only Moderation, Reports and Requests, which
  // is what decision 12 always meant: a leader learns of a waiting request from the
  // dashboard, and nothing about it is emailed. And the year-wide view scan behind it is
  // paid once per load instead of once per those three pages.
  //
  // It degrades rather than throwing. A rail that cannot count is still a rail, and the
  // request queue itself says so honestly when you reach it; taking the whole dashboard
  // down over a badge would be the wrong trade.
  const waiting = await countWaiting(supabase, caller);

  return (
    <DashboardShell caller={caller} waiting={waiting}>
      {children}
    </DashboardShell>
  );
}

async function countWaiting(
  supabase: Awaited<ReturnType<typeof createServerComponentClient>>,
  caller: Parameters<typeof loadBranchRequests>[1],
): Promise<number> {
  try {
    const board = await loadBranchRequests(supabase, caller);
    return board.waiting.length;
  } catch {
    return 0;
  }
}
