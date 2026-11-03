import { cn } from '../../lib/cn';

export interface AvatarProps {
  /** Display name; initials are derived from it. Used as the accessible label. */
  name: string;
  size?: 'sm' | 'md';
  className?: string;
}

function initialsFrom(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  const initials = initialsFrom(name) || '?';
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-medium text-secondary ring-1 ring-border-subtle',
        size === 'sm' ? 'size-6 text-2xs' : 'size-8 text-xs',
        className,
      )}
    >
      {initials}
    </span>
  );
}
