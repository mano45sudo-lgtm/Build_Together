import { Hammer } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * BrandMarkBackground — an oversized, very-low-opacity rendering of the **actual** BuildTogether brand
 * mark (the Lucide `Hammer` used in the sidebar, splash and auth header — there is no separate logo
 * asset, so this reuses the real one rather than approximating it). It sits in negative space as a
 * quiet watermark, never a competing logo. Static, single element, neutral.
 */
export interface BrandMarkBackgroundProps {
  /** Edge length of the mark in px/rem. */
  size?: number | string;
  /** Layer opacity. Defaults to the shared `--graphic-ghost` restraint token. */
  opacity?: number | string;
  /** Position/anchoring classes (e.g. `-right-10 -bottom-10`). */
  className?: string;
}

export function BrandMarkBackground({
  size = 360,
  opacity = 'var(--graphic-ghost)',
  className,
}: BrandMarkBackgroundProps) {
  return (
    <Hammer
      aria-hidden="true"
      className={cn('pointer-events-none absolute text-primary', className)}
      style={{ width: size, height: size, opacity }}
      strokeWidth={1}
    />
  );
}
