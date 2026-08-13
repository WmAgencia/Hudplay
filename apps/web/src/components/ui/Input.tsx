import { cn } from '@/lib/cn';
import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from 'react';

const fieldClasses =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  id?: string;
}

function FieldShell({ label, error, hint, id, children }: FieldProps & { children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={id} className="block text-xs font-medium text-slate-600">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {}

export function Input({ label, error, hint, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const fieldId = id ?? (label ? autoId : undefined);
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId}>
      <input id={fieldId} className={cn(fieldClasses, error && 'border-red-400', className)} {...rest} />
    </FieldShell>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

export function Textarea({ label, error, hint, id, className, ...rest }: TextareaProps) {
  const autoId = useId();
  const fieldId = id ?? (label ? autoId : undefined);
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId}>
      <textarea
        id={fieldId}
        className={cn(fieldClasses, 'min-h-24', error && 'border-red-400', className)}
        {...rest}
      />
    </FieldShell>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {}

export function Select({ label, error, hint, id, className, children, ...rest }: SelectProps) {
  const autoId = useId();
  const fieldId = id ?? (label ? autoId : undefined);
  return (
    <FieldShell label={label} error={error} hint={hint} id={fieldId}>
      <select id={fieldId} className={cn(fieldClasses, error && 'border-red-400', className)} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}
