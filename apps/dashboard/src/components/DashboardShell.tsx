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
  { key: 'people', label: copy.nav.people, icon: '☺' },
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
  children,
}: {
  caller: Caller;
  current: string;
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
            destination={destination}
            current={current}
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
}: {
  destination: Destination;
  current: string;
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
    </a>
  );
}
