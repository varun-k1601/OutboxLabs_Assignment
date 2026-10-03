import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'outline' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:hover:bg-brand-600',
  outline: 'border border-brand-600 bg-white text-brand-700 hover:bg-brand-50',
  secondary: 'border border-gray-300 bg-white text-gray-700 shadow-xs hover:bg-gray-50',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  danger: 'text-red-600 hover:bg-red-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  pill?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  pill = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        pill ? 'rounded-full' : 'rounded-lg',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ComponentProps<'button'> {
  label: string;
  size?: 'sm' | 'md';
}

export function IconButton({ label, size = 'md', className, children, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
