import type { CSSProperties } from 'react';

/**
 * The `.skel` block from `design/mockups/dashboard.html`, and the pieces the loading frames
 * build out of it (W4.12 slice 5).
 *
 * WHY THIS EXISTS AT ALL. `25` §4 has required four states of every data surface since it was
 * written, and the dashboard had error boundaries, some empty states, and NO loading states on
 * any screen. Four were drawn when the screens were designed and never built; six were drawn
 * for this item. These are those ten.
 *
 * NOT A SHIMMER. The mockup's `.skel` is a static three-stop gradient and there is no
 * `@keyframes` or `animation` anywhere in that file, so there is none here either. An
 * animated skeleton would be this file inventing a decision the design did not make, and a
 * moving gradient on a screen holding somebody's testimony is a fidget rather than
 * information.
 *
 * The three rules the frames state between them, which the pieces below encode so a screen
 * cannot get them wrong by accident:
 *
 *  - **A stat number is a skeleton, never a zero.** A "0 safeguarding" that becomes "3" a
 *    second later is the most reassuring wrong number this dashboard could print, so `Stats`
 *    draws boxes and takes no numbers at all.
 *  - **Actions are hidden while loading, never disabled.** Nothing here renders a control, so
 *    there is nothing under a skeleton to click.
 *  - **Offline is the one state where an action IS disabled rather than hidden**, which is a
 *    different surface and not this one.
 *
 * Alignment needs no help: a `loading.tsx` renders into the `(dashboard)` layout's own
 * `children` slot, inside the capped and centred content column, so a skeleton sits exactly
 * where the content it stands in for will sit.
 */

/** The mockup's `.skel`, tokens and all. Light and dark differ only in the middle stop. */
const SKEL =
  'rounded-[0.625rem] bg-[linear-gradient(90deg,var(--t-alt)_25%,rgba(140,127,106,0.10)_37%,var(--t-alt)_63%)] ' +
  'dark:bg-[linear-gradient(90deg,var(--t-alt)_25%,rgba(255,255,255,0.05)_37%,var(--t-alt)_63%)]';

export function Skeleton({
  width,
  height,
  className = '',
  style,
}: {
  /** Any CSS length or percentage, because the frames use both. */
  width?: string;
  height?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${SKEL} ${className}`}
      style={{ width, height, ...style }}
    />
  );
}

/**
 * The two lines every one of the ten frames opens with: the page title and its scope.
 *
 * Widths are per screen because they track the real text. "Reports" and "Branch requests" do
 * not occupy the same space, and a skeleton that pretended otherwise would jump.
 */
export function Header({ title, scope }: { title: string; scope: string }) {
  return (
    <>
      <Skeleton width={title} height="1.625rem" />
      <Skeleton width={scope} height="0.875rem" className="mt-[0.5625rem]" />
    </>
  );
}

/** The stat row, for the screens that have one. Never a number, only a box. */
export function Stats({ labels }: { labels: string[] }) {
  return (
    <div className="mt-[1.125rem] flex flex-wrap gap-2.5">
      {labels.map((label, index) => (
        <div
          // The widths ARE the identity here: these are anonymous boxes standing in for
          // labels of different lengths, and there is nothing else to key on.
          key={`${label}-${String(index)}`}
          className="flex-1 rounded-card border border-cardline bg-card px-3.5 py-3"
        >
          <Skeleton width="1.875rem" height="1.375rem" />
          <Skeleton
            width={label}
            height="0.625rem"
            className="mt-[0.4375rem]"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * A section label, and it is REAL TEXT rather than a skeleton in every frame.
 *
 * The reason is worth keeping: the label is the one thing on a loading screen that is already
 * known and cannot be wrong. Drawing it as a grey box would hide information the screen
 * already has, and it is what tells a reader which list is arriving.
 */
export function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase">
      {children}
    </p>
  );
}

/** The card shell every list frame repeats. */
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-card border border-cardline bg-card p-4">
      {children}
    </div>
  );
}

/** The pill a card carries, where that card has one. Branch rows deliberately do not. */
export function Pill({ width = '6rem' }: { width?: string }) {
  return <Skeleton width={width} height="1.125rem" className="rounded-full" />;
}
