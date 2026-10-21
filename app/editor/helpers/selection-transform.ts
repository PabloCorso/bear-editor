import type { Position } from "~/editor/elma-types";
import type { WorldRect } from "~/editor/render/world-geometry";

export type TransformHandle = {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  position: Position;
  cursor: string;
};

export function getTransformBounds(points: Position[]): WorldRect | null {
  if (!points.length) return null;
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

export function getTransformCenter(bounds: WorldRect): Position {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

export function getTransformHandles(bounds: WorldRect): TransformHandle[] {
  const center = getTransformCenter(bounds);
  const handles: TransformHandle[] = [];
  for (const y of [-1, 0, 1] as const) {
    for (const x of [-1, 0, 1] as const) {
      if (!x && !y) continue;
      // A collinear selection can only scale along its nonzero dimension.
      if (x && bounds.minX === bounds.maxX) continue;
      if (y && bounds.minY === bounds.maxY) continue;
      handles.push({
        x,
        y,
        position: {
          x: x < 0 ? bounds.minX : x > 0 ? bounds.maxX : center.x,
          y: y < 0 ? bounds.minY : y > 0 ? bounds.maxY : center.y,
        },
        cursor: !x
          ? "ns-resize"
          : !y
            ? "ew-resize"
            : x === y
              ? "nwse-resize"
              : "nesw-resize",
      });
    }
  }
  return handles;
}

export function rotateTransformPoint(
  point: Position,
  center: Position,
  angle: number,
): Position {
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * Math.cos(angle) - y * Math.sin(angle),
    y: center.y + x * Math.sin(angle) + y * Math.cos(angle),
  };
}

export function getResizeTransform(
  bounds: WorldRect,
  handle: TransformHandle,
  delta: Position,
  freeProportions: boolean,
): (point: Position) => Position {
  const anchor = {
    x:
      handle.x < 0
        ? bounds.maxX
        : handle.x > 0
          ? bounds.minX
          : getTransformCenter(bounds).x,
    y:
      handle.y < 0
        ? bounds.maxY
        : handle.y > 0
          ? bounds.minY
          : getTransformCenter(bounds).y,
  };
  const width = handle.position.x - anchor.x;
  const height = handle.position.y - anchor.y;
  // Stop at the opposite edge; flipping is a separate operation.
  let scaleX = handle.x ? Math.max(0.001, (width + delta.x) / width) : 1;
  let scaleY = handle.y ? Math.max(0.001, (height + delta.y) / height) : 1;
  if (handle.x && handle.y && !freeProportions) {
    const scale = Math.max(
      0.001,
      ((width + delta.x) * width + (height + delta.y) * height) /
        (width * width + height * height),
    );
    scaleX = scaleY = scale;
  }
  return (point) => ({
    x: anchor.x + (point.x - anchor.x) * scaleX,
    y: anchor.y + (point.y - anchor.y) * scaleY,
  });
}
