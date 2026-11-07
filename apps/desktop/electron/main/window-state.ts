export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState extends WindowBounds {
  isMaximized: boolean;
}

export type WorkArea = WindowBounds;

export const DEFAULT_WINDOW_STATE: WindowState = {
  x: 0,
  y: 0,
  width: 1200,
  height: 800,
  isMaximized: false,
};

const MIN_VISIBLE_WIDTH = 160;
const MIN_VISIBLE_HEIGHT = 100;

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function intersectionSize(startA: number, sizeA: number, startB: number, sizeB: number): number {
  return Math.max(0, Math.min(startA + sizeA, startB + sizeB) - Math.max(startA, startB));
}

function centeredBounds(area: WorkArea, width: number, height: number): WindowBounds {
  const safeWidth = Math.min(width, area.width);
  const safeHeight = Math.min(height, area.height);
  return {
    x: area.x + Math.round((area.width - safeWidth) / 2),
    y: area.y + Math.round((area.height - safeHeight) / 2),
    width,
    height,
  };
}

/** Validates saved state and keeps at least a useful portion of the window on an active display. */
export function restoreWindowState(
  value: unknown,
  workAreas: readonly WorkArea[],
  primaryArea: WorkArea,
): WindowState {
  const candidate = typeof value === 'object' && value !== null ? value : {};
  const state = candidate as Record<string, unknown>;
  const width = finiteNumber(state['width']) ? Math.max(940, Math.min(5000, state['width'])) : 1200;
  const height = finiteNumber(state['height'])
    ? Math.max(600, Math.min(4000, state['height']))
    : 800;
  const rawX = finiteNumber(state['x']) ? state['x'] : Number.NaN;
  const rawY = finiteNumber(state['y']) ? state['y'] : Number.NaN;
  const isMaximized = state['isMaximized'] === true;
  const areas = workAreas.length > 0 ? workAreas : [primaryArea];

  const visibleArea =
    Number.isFinite(rawX) && Number.isFinite(rawY)
      ? areas
          .map((area) => ({
            area,
            visible:
              intersectionSize(rawX, width, area.x, area.width) *
              intersectionSize(rawY, height, area.y, area.height),
          }))
          .sort((left, right) => right.visible - left.visible)[0]
      : undefined;

  if (!visibleArea || visibleArea.visible < MIN_VISIBLE_WIDTH * MIN_VISIBLE_HEIGHT) {
    return { ...centeredBounds(primaryArea, width, height), isMaximized };
  }

  const area = visibleArea.area;
  const x = Math.max(
    area.x - width + MIN_VISIBLE_WIDTH,
    Math.min(rawX, area.x + area.width - MIN_VISIBLE_WIDTH),
  );
  const y = Math.max(area.y, Math.min(rawY, area.y + area.height - MIN_VISIBLE_HEIGHT));
  return { x, y, width, height, isMaximized };
}
