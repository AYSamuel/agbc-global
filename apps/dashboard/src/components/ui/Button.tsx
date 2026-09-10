import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Full width, which is what a single action at the end of a form wants. */
  block?: boolean;
}

// 48px minimum height: the preferred target size from the responsiveness rules, and the
// same floor the app's primitives use. Weight 800 on the primary matches the mockup's
// .btn. Colours are tokens; there is no hex here.
const base =
  'inline-flex min-h-12 items-center justify-center rounded-button px-5 text-body ' +
  'font-body transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-btn text-btn-text font-extrabold hover:opacity-90',
  // `controlline`, not `cardline`, since W4.12. An outline button has NOTHING but this
  // line to say it is a button, which is WCAG 1.4.11's 3:1 for "visual information
  // required to identify user interface components". W4.7 split the two tokens apart for
  // exactly this and named an outline button as one of its cases, but that pass swept the
  // mobile app only, so every outline button in the dashboard stayed on the decorative
  // hairline at 1.31:1 against a card. `cardline` remains right for a card's own edge,
  // which content identifies on its own.
  secondary:
    'border border-controlline bg-card text-text font-semibold hover:bg-alt',
  ghost: 'text-blue font-semibold underline-offset-4 hover:underline',
  // The mockup's `.btn.danger`: outlined rather than filled, because a destructive control
  // should be findable without being the thing the eye lands on first. Added for the event
  // cancellation (W3.5 slice 4); the same treatment was already inlined by three surfaces
  // that render a `<summary>` or a link rather than a button and so cannot use it.
  danger:
    'border border-danger bg-transparent text-danger font-bold hover:bg-danger/10',
};

export function Button({
  variant = 'primary',
  block = false,
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${block ? 'w-full' : ''} ${className}`}
      {...props}
    />
  );
}
