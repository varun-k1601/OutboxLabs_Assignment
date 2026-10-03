import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-12 text-base' };

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const classes = cn('shrink-0 rounded-full', sizes[size], className);

  if (src && !failed) {
    // Google avatars don't load if a Referer header is sent
    return <img src={src} alt={name} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={cn(classes, 'object-cover')} />;
  }
  return (
    <span aria-label={name} className={cn(classes, 'inline-flex items-center justify-center bg-brand-100 font-semibold text-brand-800')}>
      {initials(name)}
    </span>
  );
}
