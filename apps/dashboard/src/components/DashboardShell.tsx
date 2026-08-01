import type { ReactNode } from 'react';

import { copy } from '@/copy/en';
import type { Caller } from '@/server/authorize';

/**
 * The rail and the page frame, from `design/mockups/dashboard.html`.
 *
 * The rail lists the WHOLE dashboard, not only what is built. `17` specs six modules and
 * Phase A builds one and a half; showing four rows and nothing else would read as "this
 * is all there will ever be". The later destinations are dimmed and tagged with their
 * phase, and each phase lights one up rather than reshaping the navigation.
 */

interface Destination {
  key: string;
  label: string;
  href?: string;
  phase?: 'B' | 'C';
  icon: string;
}

const PHASE_A: Destination[] = [
  {
    key: 'moderation',
    label: copy.nav.moderation,
    href: '/moderation',
    icon: '▢',
  },
  { key: 'reports', label: copy.nav.reports, icon: '⚑' },
  { key: 'verses', label: copy.nav.verses, icon: '✎' },
  // ONE People row, two destinations, because People means different work depending on
  // who you are: an admin hands out roles, a leader decides who joins their branch. The
  // frames draw a single rail row for both, so the row points at whichever surface is
  // actually the caller's.
  //
  // It was `/people` for everyone until 2026-08-01, when a leader following it landed on
  // "roles are handed out by an admin" with no route onward and their own queue
  // unreachable, while the badge beside the row counted the very requests it was hiding.
  { key: 'people', label: copy.nav.people, href: '/people', icon: '☺' },
];

const LATER: Destination[] = [
  { key: 'broadcasts', label: copy.nav.broadcasts, phase: 'B', icon: '✉' },
  { key: 'events', label: copy.nav.events, phase: 'B', icon: '☀' },
  { key: 'branches', label: copy.nav.branches, phase: 'B', icon: '▦' },
  { key: 'library', label: copy.nav.library, phase: 'C', icon: '□' },
  { key: 'insights', label: copy.nav.insights, phase: 'C', icon: '▭' },
];

export function DashboardShell({
  caller,
  current,
  waiting = 0,
  children,
}: {
  caller: Caller;
  current: string;
  /**
   * Branch requests waiting on this caller (decision 12). It rides the rail so a leader
   * meets it on the same visit as their moderation queue, which is the whole mechanism:
   * nothing is emailed about a waiting request.
   *
   * The ACTIONABLE queue only. History never contributes to a badge, because a number that
   * counts things you cannot act on trains people to ignore the number.
   */
  waiting?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <nav
        aria-label={copy.nav.label}
        className="flex flex-col gap-0.5 border-cardline bg-card p-3 lg:w-56 lg:border-r"
      >
        <p className="px-2.5 pt-1 pb-3.5 font-display text-[1rem] font-extrabold">
          {copy.nav.brand}
        </p>

        <RailSection title="Phase A" />
        {PHASE_A.map((destination) => (
          <RailRow
            key={destination.key}
            destination={
              destination.key === 'people'
                ? { ...destination, href: peopleHref(caller.role) }
                : destination
            }
            current={current}
            count={destination.key === 'people' ? waiting : 0}
          />
        ))}

        <RailSection title={copy.nav.later} />
        {LATER.map((destination) => (
          <RailRow
            key={destination.key}
            destination={destination}
            current={current}
          />
        ))}

        <div className="mt-auto border-t border-cardline px-2.5 pt-3.5 text-label leading-relaxed text-muted">
          {copy.nav.signedInAs}
          <b className="block text-body font-extrabold text-text">
            {caller.displayName}
          </b>
          {copy.identity.roles[caller.role]}
          {caller.role === 'admin' ? '' : ` · ${caller.branchName}`}
        </div>
      </nav>

      <main id="main" className="min-w-0 flex-1 px-5 py-6 sm:px-7">
        {children}
      </main>
    </div>
  );
}

/**
 * Where People goes for this caller.
 *
 * An admin's People is role assignment, which links on to the queue; a leader's People IS
 * the queue, because `/people` has nothing for them but a refusal.
 */
function peopleHref(role: Caller['role']): string {
  return role === 'admin' ? '/people' : '/people/requests';
}

function RailSection({ title }: { title: string }) {
  return (
    <p className="px-2.5 pt-3.5 pb-1.5 text-[0.59rem] font-extrabold tracking-[0.14em] text-muted uppercase">
      {title}
    </p>
  );
}

function RailRow({
  destination,
  current,
  count = 0,
}: {
  destination: Destination;
  current: string;
  count?: number;
}) {
  const active = destination.key === current;
  const base =
    'flex items-center gap-2.5 rounded-control px-2.5 py-2.5 text-body font-bold';

  // A destination that does not exist yet is not a link and is not focusable: a keyboard
  // user should not tab through five dead stops to reach the content.
  if (!destination.href) {
    return (
      <span className={`${base} text-muted opacity-60`}>
        <span aria-hidden="true" className="w-4.5">
          {destination.icon}
        </span>
        {destination.label}
        {destination.phase ? (
          <>
            <span
              aria-hidden="true"
              className="ml-auto rounded-full bg-alt px-1.5 py-0.5 text-[0.56rem] font-extrabold tracking-wider uppercase"
            >
              {destination.phase}
            </span>
            {/* The dimming is not the message: say it out loud for assistive tech. */}
            <span className="sr-only">
              {copy.nav.notYet(destination.phase)}
            </span>
          </>
        ) : null}
      </span>
    );
  }

  return (
    <a
      href={destination.href}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${active ? 'bg-alt text-text' : 'text-sub hover:bg-alt'}`}
    >
      <span aria-hidden="true" className="w-4.5">
        {destination.icon}
      </span>
      {destination.label}
      {count > 0 ? (
        // The number is not the message: it is read out as part of the link's name, so a
        // screen reader hears "People, 2 waiting" rather than "People 2".
        <span className="ml-auto min-w-5 rounded-full bg-btn px-1.5 py-0.5 text-center text-[0.66rem] font-extrabold text-btn-text">
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">{copy.nav.waiting(count)}</span>
        </span>
      ) : null}
    </a>
  );
}
