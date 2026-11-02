import type { Position } from "~/editor/elma-types";
import type { WorldRect } from "~/editor/render/world-geometry";

function distanceToSegment(point: Position, from: Position, to: Position) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const fraction =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared,
          ),
        );
  return Math.hypot(
    point.x - from.x - fraction * dx,
    point.y - from.y - fraction * dy,
  );
}

/** Even-odd containment also gives predictable results for crossing lasso paths. */
export function isPointInLasso(point: Position, path: Position[]): boolean {
  if (path.length < 3) return false;
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const a = path[j];
    const b = path[i];
    if (distanceToSegment(point, a, b) < 1e-9) return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function circleIntersectsLasso(
  center: Position,
  radius: number,
  path: Position[],
): boolean {
  return (
    isPointInLasso(center, path) ||
    path.some(
      (point, index) =>
        distanceToSegment(center, point, path[(index + 1) % path.length]) <=
        radius,
    )
  );
}

export function rectIntersectsLasso(
  rect: WorldRect,
  path: Position[],
): boolean {
  const corners = [
    { x: rect.minX, y: rect.minY },
    { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY },
    { x: rect.minX, y: rect.maxY },
  ];
  if (corners.some((point) => isPointInLasso(point, path))) return true;
  // Clip each lasso segment against the rectangle, including fully enclosed paths.
  return path.some((from, index) => {
    const to = path[(index + 1) % path.length];
    let start = 0;
    let end = 1;
    for (const [origin, delta, min, max] of [
      [from.x, to.x - from.x, rect.minX, rect.maxX],
      [from.y, to.y - from.y, rect.minY, rect.maxY],
    ]) {
      if (delta === 0) {
        if (origin < min || origin > max) return false;
      } else {
        const a = (min - origin) / delta;
        const b = (max - origin) / delta;
        start = Math.max(start, Math.min(a, b));
        end = Math.min(end, Math.max(a, b));
        if (start > end) return false;
      }
    }
    return true;
  });
}
