import type { InputHTMLAttributes } from 'react';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  /** Field-level message. Rendered next to the input and linked by aria-describedby. */
  error?: string;
  hint?: string;
}

// A real, persistent <label>, never a placeholder standing in for one, and the error
// wired through aria-describedby so a screen reader hears why the field was refused.
export function TextField({
  id,
  label,
  error,
  hint,
  className = '',
  ...props
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-body font-semibold text-text">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-body text-sub">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={
          'min-h-12 rounded-control border bg-card px-4 text-body text-text ' +
          `${error ? 'border-danger' : 'border-cardline'} ${className}`
        }
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-body font-bold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
