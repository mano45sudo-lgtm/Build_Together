import { ArcAccent } from './ArcAccent';
import { DiagonalLayers } from './DiagonalLayers';
import { SoftLighting } from './SoftLighting';
import { SubtleGrid } from './SubtleGrid';

/**
 * EmptyStateVisual — the purpose-built half of the graphics system. Each variant composes the *same*
 * primitives (grid, plates, arc, lighting) under the shared restraint tokens, so every empty state
 * reads as one visual family rather than four unrelated illustrations. The motif relates to the action
 * the empty state is asking for, and always sits behind the content (the host box lifts its content to
 * `z-10`). Purely decorative: static, neutral, `pointer-events-none`, `aria-hidden`.
 */
export type EmptyStateVariant = 'workspace' | 'board' | 'decision' | 'connection' | 'generic';

export interface EmptyStateVisualProps {
  variant?: EmptyStateVariant;
}

export function EmptyStateVisual({ variant = 'generic' }: EmptyStateVisualProps) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {variant === 'workspace' ? (
        <>
          <SubtleGrid fade="bottom" />
          <DiagonalLayers anchor="bottom-right" />
        </>
      ) : null}

      {variant === 'board' ? (
        <>
          <SoftLighting position="top" />
          <DiagonalLayers anchor="bottom-left" />
        </>
      ) : null}

      {variant === 'decision' ? (
        <>
          <SoftLighting position="center" />
          <ArcAccent orientation="convex" />
        </>
      ) : null}

      {variant === 'connection' ? (
        <>
          <ArcAccent orientation="concave" />
          <ConnectionMotif />
        </>
      ) : null}

      {variant === 'generic' ? (
        <>
          <SoftLighting position="top" />
          <SubtleGrid fade="bottom" />
        </>
      ) : null}
    </div>
  );
}

/** Two nodes joined by a hairline — the one bespoke motif, kept geometric so it belongs to the family. */
function ConnectionMotif() {
  return (
    <svg
      viewBox="0 0 480 320"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <g
        style={{
          stroke: 'var(--color-primary)',
          fill: 'var(--color-primary)',
          strokeOpacity: 'var(--graphic-line)',
          fillOpacity: 'var(--graphic-line)',
        }}
      >
        <line x1="150" y1="120" x2="330" y2="200" strokeWidth={1} />
        <circle cx="150" cy="120" r="4" stroke="none" />
        <circle cx="330" cy="200" r="4" stroke="none" />
      </g>
    </svg>
  );
}
