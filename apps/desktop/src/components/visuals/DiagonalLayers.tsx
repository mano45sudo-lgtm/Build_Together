import { cn } from '../../lib/cn';

/**
 * DiagonalLayers — overlapping skewed "build plates" that echo the angular, constructive geometry of
 * the brand. Two large parallelograms anchored to a corner, with a hairline edge and a barely-there
 * surface fill, so they read as intentional structure rather than floating glass. Pure inline SVG:
 * static, resolution-independent, and clipped to the parent box (no overflow, no scrollbars).
 */
export interface DiagonalLayersProps {
  /** Which corner the plates rise from. */
  anchor?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
  className?: string;
}

// `slice` fills the box and crops the geometry to it, anchoring the composition to the chosen corner.
const ASPECT: Record<NonNullable<DiagonalLayersProps['anchor']>, string> = {
  'top-right': 'xMaxYMin slice',
  'bottom-right': 'xMaxYMax slice',
  'top-left': 'xMinYMin slice',
  'bottom-left': 'xMinYMax slice',
};

export function DiagonalLayers({ anchor = 'bottom-right', className }: DiagonalLayersProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 480 320"
      preserveAspectRatio={ASPECT[anchor]}
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
    >
      <g
        strokeWidth={1}
        style={{
          fill: 'var(--color-primary)',
          stroke: 'var(--color-primary)',
          fillOpacity: 'var(--graphic-plate)',
          strokeOpacity: 'var(--graphic-line)',
        }}
      >
        <path d="M176 320 L356 44 L480 44 L300 320 Z" />
        <path d="M300 320 L480 44 L480 320 Z" />
      </g>
    </svg>
  );
}
