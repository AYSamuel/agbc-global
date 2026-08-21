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

const BUILT: Destination[] = [
  {
    key: 'moderation',
    label: copy.nav.moderation,
    href: '/moderation',
    icon: '▢',
  },
  { key: 'reports', label: copy.nav.reports, href: '/reports', icon: '⚑' },
  // Linked for every staff caller rather than admins only, on the same reasoning as the
  // People row below: `/verses` refuses a leader honestly, inside the shell, and points them
  // at their own queue. A row that appears the day someone's role changes is a rail that
  // reshapes itself, which the dimmed-but-visible pattern above exists to avoid.
  { key: 'verses', label: copy.nav.verses, href: '/verses', icon: '✎' },
  // The first row from a later phase to light up (W3.1, frames approved 2026-08-14).
  // Same every-staff-caller linking as verses: `/sermon-audio` refuses a leader honestly.
  {
    key: 'sermonAudio',
    label: copy.nav.sermonAudio,
    href: '/sermon-audio',
    icon: '♪',
  },
  // ONE People row, two destinations, because People means different work depending on
  // who you are: an admin hands out roles, a leader decides who joins their branch. The
  // frames draw a single rail row for both, so the row points at whichever surface is
  // actually the caller's.
  //
  // It was `/people` for everyone until 2026-08-01, when a leader following it landed on
  // "roles are handed out by an admin" with no route onward and their own queue
  // unreachable, while the badge beside the row counted the very requests it was hiding.
  { key: 'people', label: copy.nav.people, href: '/people', icon: '☺' },
  // The first Phase B row to light up (W3.5, frames approved 2026-08-19). Linked for every
  // staff caller, like verses and sermon audio above: a leader composes for their own
  // branch, and the surface refuses nothing they can reach.
  {
    key: 'broadcasts',
    label: copy.nav.broadcasts,
    href: '/broadcasts',
    icon: '✉',
  },
  // W3.5 slice 4, frames approved 2026-08-20. Linked for every staff caller: a leader runs
  // their own branch's diary and sees the ministry-wide events their members are invited to,
  // which is exactly what the app shows those members.
  { key: 'events', label: copy.nav.events, href: '/events', icon: '☀' },
  // W3.5 slice 5b, frames approved 2026-08-21, and the last Phase B row to light up.
  //
  // Linked for every staff caller like the four rows above, and the refusal behind it is
  // the strictest in the rail: branch management is admin-only, and a leader gets no
  // version of it even for their own branch. That is `17` §5, and the reason is ADR 0015's:
  // `can_moderate_branch()` reads `profiles.branch_id`, so a leader editing their own
  // branch row would be editing the subject of their own authority check.
  { key: 'branches', label: copy.nav.branches, href: '/branches', icon: '▦' },
];

const LATER: Destination[] = [
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
      {/* The rail never scrolls with the page (Ayo, 2026-08-14, seeing the 100-row
          shelf walk it off screen): on desktop it pins to the viewport, exactly one
          screen tall, and scrolls itself in the rare window too short for its rows.
          Only at lg+, where it is a side column; stacked on a narrow window it is a
          header and flows with the page like one. */}
      <nav
        aria-label={copy.nav.label}
        className="flex flex-col gap-0.5 border-cardline bg-card p-3 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:self-start lg:overflow-y-auto lg:border-r"
      >
        <p className="px-2.5 pt-1 pb-3.5 font-display text-[1rem] font-extrabold">
          {copy.nav.brand}
        </p>

        {/* No section title over the lit rows since W3.1 lit the first later-phase one:
            a phase name over a mixed list would be false. Lit rows are simply the
            dashboard; "Later" keeps the dimmed tail (per the approved W3.1 frames). */}
        {BUILT.map((destination) => (
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
