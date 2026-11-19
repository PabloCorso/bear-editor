import type { Position } from "./elma-types";
import type { WorldRect } from "./render/world-geometry";
import type { WorldRenderOverlayItem } from "./render/world-scene";

export type GridSettings = { visible: boolean; snap: boolean; size: number };
export const defaultGridSettings: GridSettings = {
  visible: false,
  snap: false,
  size: 1,
};
export const MIN_GRID_SIZE = 0.01;
export const MAX_GRID_SIZE = 1000;
const MIN_GRID_LINE_SPACING_PX = 8;

export function normalizeGridSettings(
  settings?: Partial<GridSettings>,
): GridSettings {
  return {
    visible: typeof settings?.visible === "boolean" ? settings.visible : false,
    snap: typeof settings?.snap === "boolean" ? settings.snap : false,
    size:
      typeof settings?.size === "number" && Number.isFinite(settings.size)
        ? Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, settings.size))
        : 1,
  };
}

export function snapToGrid(position: Position, grid: GridSettings): Position {
  if (!grid.snap) return position;
  return {
    x: Math.round(position.x / grid.size) * grid.size,
    y: Math.round(position.y / grid.size) * grid.size,
  };
}

// One anchor supplies a shared translation; never round each selected point.
export function snapGridTranslation(
  anchor: Position,
  delta: Position,
  grid: GridSettings,
): Position {
  if (!grid.snap) return delta;
  const target = snapToGrid(
    { x: anchor.x + delta.x, y: anchor.y + delta.y },
    grid,
  );
  return { x: target.x - anchor.x, y: target.y - anchor.y };
}

export function buildGridOverlays(
  grid: GridSettings,
  viewport: WorldRect,
  zoom: number,
): WorldRenderOverlayItem[] {
  if (!grid.visible || !Number.isFinite(zoom) || zoom <= 0) return [];
  // Coarsen only the drawing, never the underlying snap interval. Bound the
  // amount of geometry even on extremely large canvases or at minimum zoom.
  let step = grid.size;
  while (
    step * zoom < MIN_GRID_LINE_SPACING_PX ||
    (viewport.maxX - viewport.minX + viewport.maxY - viewport.minY) / step >
      2000
  )
    step *= 5;
  const lines: WorldRenderOverlayItem[] = [];
  for (const axis of ["x", "y"] as const) {
    const min = axis === "x" ? viewport.minX : viewport.minY;
    const max = axis === "x" ? viewport.maxX : viewport.maxY;
    for (
      let index = Math.ceil(min / step);
      index <= Math.floor(max / step);
      index++
    ) {
      const value = index * step;
      lines.push({
        type: "line",
        from:
          axis === "x"
            ? { x: value, y: viewport.minY }
            : { x: viewport.minX, y: value },
        to:
          axis === "x"
            ? { x: value, y: viewport.maxY }
            : { x: viewport.maxX, y: value },
        color: "#ffffff",
        opacity: index % 5 === 0 ? 0.22 : 0.09,
        width: 1 / zoom,
      });
    }
  }
  return lines;
}
