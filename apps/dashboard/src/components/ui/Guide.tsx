import type { ReactNode } from 'react';

/**
 * The mockup's `.guide`: the gold heads-up that belongs WHERE THE DECISION IS MADE.
 *
 * Distinct from `Notice`, and worth saying why rather than leaving them to be merged later.
 * A Notice states a SITUATION that already exists ("we could not load the queue", "this
 * would leave a branch with no leader"). A guide is advice the reader needs BEFORE acting,
 * and the frames give it the gold wash for exactly that reason: the moderation queue's
 * safeguarding rule sits above the decision it governs (`17` §1, `20`), and the events form
 * says how many phones a save reaches before anybody types a title.
 *
 * Promoted at the second copy rather than the fourth (W3.5 slice 4). The first was inlined
 * in the moderation page and the events form would have been the second; every other shared
 * widget in this dashboard was promoted late enough that a copy had already drifted.
 */
export function Guide({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-card border border-[rgba(185,134,0,0.34)] bg-[rgba(255,207,74,0.14)] px-4 py-3">
      <span
        aria-hidden="true"
        className="mt-px text-gold-deep dark:text-accent"
      >
        ⚠
      </span>
      <p className="text-body leading-relaxed text-text">
        <b className="font-extrabold">{title}</b> {children}
      </p>
    </div>
  );
}
