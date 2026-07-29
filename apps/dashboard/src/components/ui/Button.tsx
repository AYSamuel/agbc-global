import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

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
  secondary:
    'border border-cardline bg-card text-text font-semibold hover:bg-alt',
  ghost: 'text-blue font-semibold underline-offset-4 hover:underline',
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
