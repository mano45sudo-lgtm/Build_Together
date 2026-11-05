import { cn } from '../../lib/cn';

/**
 * SoftGradientLighting — the most restrained depth cue in the graphics system: a single, near-white
 * radial illumination that is almost invisible until read against a flat surface. Neutral only (it
 * samples `--color-primary`), static, and bounded to its parent. Never a coloured glow or vignette.
 */
export interface SoftLightingProps {
  /** Where the light "source" sits, which sets the falloff origin. */
  position?: 'top' | 'top-left' | 'top-right' | 'bottom' | 'center';
  /** Spread of the illuminated ellipse. */
  size?: string;
  /** Layer opacity. Defaults to the shared `--graphic-light` restraint token. */
  opacity?: number | string;
  className?: string;
}

const ORIGINS: Record<NonNullable<SoftLightingProps['position']>, string> = {
  top: '50% -10%',
  'top-left': '18% -12%',
  'top-right': '82% -12%',
  bottom: '50% 110%',
  center: '50% 42%',
};

export function SoftLighting({
  position = 'top',
  size = '60% 55%',
  opacity = 'var(--graphic-light)',
  className,
}: SoftLightingProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        background: `radial-gradient(${size} at ${ORIGINS[position]}, var(--color-primary), transparent 70%)`,
        opacity,
      }}
    />
  );
}
