import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

const inputBase =
  'w-full rounded-lg border bg-white px-3 text-sm text-gray-900 shadow-xs outline-none transition placeholder:text-gray-400 ' +
  'focus:border-brand-500 focus:ring-3 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-gray-50';

export interface InputProps extends ComponentProps<'input'> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(inputBase, 'h-10', invalid ? 'border-red-400' : 'border-gray-300', className)}
      {...props}
    />
  );
}

export interface SelectProps extends ComponentProps<'select'> {
  invalid?: boolean;
}

export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(inputBase, 'h-10 cursor-pointer pr-8', invalid ? 'border-red-400' : 'border-gray-300', className)}
      {...props}
    >
      {children}
    </select>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

// label + input + hint/error
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}
