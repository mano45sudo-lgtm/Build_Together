import { cn } from '../../lib/cn';

/**
 * ArcAccent — a single, large-radius hairline curve with a short brighter highlight along a small
 * portion of it. Deliberately one arc, not a scatter of rings: it suggests motion/orbit behind an
 * empty state or a section introduction without competing with content. Static SVG, clipped to the
 * parent box, neutral stroke sampled from `--color-primary`.
 */
export interface ArcAccentProps {
  /** Flip the curve to sit from the top or the bottom of its box. */
  orientation?: 'convex' | 'concave';
  className?: string;
}

export function ArcAccent({ orientation = 'convex', className }: ArcAccentProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 480 320"
      preserveAspectRatio="xMidYMid slice"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full',
        orientation === 'concave' && '-scale-y-100',
        className,
      )}
    >
      <g fill="none" strokeLinecap="round" style={{ stroke: 'var(--color-primary)' }}>
        {/* Base hairline arc. */}
        <path
          d="M-40 300 Q 240 60 520 300"
          strokeWidth={1}
          style={{ strokeOpacity: 'var(--graphic-line)' }}
        />
        {/* Restrained highlight over a short portion near the apex. */}
        <path
          d="M180 150 Q 240 118 300 150"
          strokeWidth={1.5}
          style={{ strokeOpacity: 'calc(var(--graphic-line) * 2.4)' }}
        />
      </g>
    </svg>
  );
}
