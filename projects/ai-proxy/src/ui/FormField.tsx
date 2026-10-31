import type { ReactNode } from 'react';

export interface FormFieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid': boolean;
}

export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (controlProps: FormFieldControlProps) => ReactNode;
}

/** Connects a visible label, help and validation message to an existing control. */
export function FormField({ id, label, hint, error, className, children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return <div className={className}>
    <label htmlFor={id}>{label}</label>
    {children({ id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}
    {hint && <p id={hintId} className="hint">{hint}</p>}
    {error && <p id={errorId} role="alert" className="notice error">{error}</p>}
  </div>;
}
