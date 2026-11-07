import { describe, expect, it } from 'vitest';
import { restoreWindowState, type WorkArea } from './window-state';

const primary: WorkArea = { x: 0, y: 0, width: 1920, height: 1080 };

describe('restoreWindowState', () => {
  it('uses safe default bounds when saved state is missing', () => {
    expect(restoreWindowState(null, [primary], primary)).toEqual({
      x: 360,
      y: 140,
      width: 1200,
      height: 800,
      isMaximized: false,
    });
  });

  it('preserves a visible saved position and maximized state', () => {
    expect(
      restoreWindowState(
        { x: 120, y: 80, width: 1200, height: 800, isMaximized: true },
        [primary],
        primary,
      ),
    ).toEqual({ x: 120, y: 80, width: 1200, height: 800, isMaximized: true });
  });

  it('recenters a window whose saved display is no longer connected', () => {
    expect(
      restoreWindowState(
        { x: 2200, y: 100, width: 1200, height: 800, isMaximized: false },
        [primary],
        primary,
      ),
    ).toEqual({ x: 360, y: 140, width: 1200, height: 800, isMaximized: false });
  });

  it('clamps invalid or undersized dimensions to the window minimum', () => {
    expect(
      restoreWindowState(
        { x: Number.NaN, y: 0, width: 200, height: 200, isMaximized: false },
        [primary],
        primary,
      ),
    ).toEqual({ x: 490, y: 240, width: 940, height: 600, isMaximized: false });
  });
});
