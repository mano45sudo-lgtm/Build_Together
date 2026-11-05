/**
 * BuildTogether background-graphics system — a small, reusable, brand-aligned visual layer set for
 * the desktop renderer. Everything here is decorative, neutral, static and token-driven; it is kept
 * deliberately separate from functional `components/ui` primitives. Placement is governed by
 * `DESIGN.md` → "Background graphics": a few perfectly placed layers, never graphics everywhere.
 */
export { SoftLighting } from './SoftLighting';
export type { SoftLightingProps } from './SoftLighting';
export { DiagonalLayers } from './DiagonalLayers';
export type { DiagonalLayersProps } from './DiagonalLayers';
export { SubtleGrid } from './SubtleGrid';
export type { SubtleGridProps } from './SubtleGrid';
export { ArcAccent } from './ArcAccent';
export type { ArcAccentProps } from './ArcAccent';
export { BrandMarkBackground } from './BrandMarkBackground';
export type { BrandMarkBackgroundProps } from './BrandMarkBackground';
export { EmptyStateVisual } from './EmptyStateVisual';
export type { EmptyStateVariant, EmptyStateVisualProps } from './EmptyStateVisual';
