import { cn } from '../../lib/cn';

/**
 * SubtleGrid — a fine, low-contrast grid texture that fades progressively toward the content area so
 * it never sits behind dense text or tables. Pure CSS (two repeating linear-gradients + a mask), so
 * it costs nothing to render and stays crisp at any DPI. Neutral lines sampled from `--color-primary`.
 */
export interface SubtleGridProps {
  /** Direction the grid fades *toward* (i.e. where it stays visible longest). Default: bottom. */
  fade?: 'bottom' | 'top' | 'left' | 'right';
  /** Cell size in px/rem. Defaults to the shared `--graphic-grid` token. */
  cell?: string;
  /** Layer opacity. Defaults to the shared `--graphic-line` restraint token. */
  opacity?: number | string;
  className?: string;
}

// The mask keeps full opacity at the "origin" edge and dissolves to transparent toward the content.
const MASKS: Record<NonNullable<SubtleGridProps['fade']>, string> = {
  bottom: 'linear-gradient(to bottom, black 10%, transparent 80%)',
  top: 'linear-gradient(to top, black 10%, transparent 80%)',
  left: 'linear-gradient(to right, black 10%, transparent 80%)',
  right: 'linear-gradient(to left, black 10%, transparent 80%)',
};

export function SubtleGrid({
  fade = 'bottom',
  cell = 'var(--graphic-grid)',
  opacity = 'var(--graphic-line)',
  className,
}: SubtleGridProps) {
  const mask = MASKS[fade];
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage:
          'linear-gradient(to right, var(--color-primary) 1px, transparent 1px),' +
          'linear-gradient(to bottom, var(--color-primary) 1px, transparent 1px)',
        backgroundSize: `${cell} ${cell}`,
        opacity,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}
