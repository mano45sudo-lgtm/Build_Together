import { cn } from '../../lib/cn';

export interface SkeletonProps {
  className?: string;
}

/** Loading placeholder that reserves layout so content does not jump in. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded-md bg-surface-3', className)} aria-hidden="true" />
  );
}
