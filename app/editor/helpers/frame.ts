import clipping, { type Polygon as ClippingPolygon } from "polygon-clipping";
import type { Polygon, Position } from "~/editor/elma-types";

export const FRAME_MODES = ["inside", "outside", "centered"] as const;
export type FrameMode = (typeof FRAME_MODES)[number];
export const FRAME_MODE_LABELS: Record<FrameMode, string> = {
  inside: "Inside",
  outside: "Outside",
  centered: "Centered",
};
export const DEFAULT_FRAME_WIDTH_PX = 25;
export const MIN_FRAME_WIDTH_PX = 1;
export const MAX_FRAME_WIDTH_PX = 2000;
const EPSILON = 1e-8;

// Width is the total distance between the two outlines, in world units.
// Keep the original boundary for inside/outside; centered moves both halves.
export function createFramePolygons(
  polygon: Polygon,
  width: number,
  mode: FrameMode,
): Polygon[] | null {
  if (polygon.grass || !Number.isFinite(width) || width <= 0) return null;
  const vertices = polygon.vertices.filter(
    (point, index, all) =>
      distance(point, all[(index + 1) % all.length]) > EPSILON,
  );
  if (!isSimple(vertices) || Math.abs(signedArea(vertices)) < EPSILON)
    return null;
  const outerDistance =
    mode === "inside" ? 0 : mode === "centered" ? width / 2 : width;
  const innerDistance =
    mode === "outside" ? 0 : mode === "centered" ? -width / 2 : -width;
  const outer = offset(vertices, outerDistance);
  const inner = offset(vertices, innerDistance);
  if (!outer || !inner) return null;
  // Elma stores each boundary separately, including split interiors and holes.
  return [
    ...(outerDistance === 0
      ? [polygon]
      : outer.map((vertices) => ({ ...polygon, vertices }))),
    ...(innerDistance === 0
      ? [polygon]
      : inner.map((vertices) => ({ ...polygon, vertices, grass: false }))),
  ];
}

function offset(vertices: Position[], amount: number): Position[][] | null {
  const simple = simpleOffset(vertices, amount);
  if (simple) return [simple];

  // Sweep the boundary into strips, joining the exposed corners with miters.
  // Boolean clipping removes overlaps when thin sections or notches collapse,
  // allowing an inset to split into several surviving regions.
  const orientation = Math.sign(signedArea(vertices));
  const normals = vertices.map((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    const length = distance(point, next);
    return {
      x: (orientation * (next.y - point.y) * amount) / length,
      y: (-orientation * (next.x - point.x) * amount) / length,
    };
  });
  const strips: ClippingPolygon[] = [];
  const toPolygon = (points: Position[]): ClippingPolygon => [
    points.map(({ x, y }) => [x, y]),
  ];
  for (let index = 0; index < vertices.length; index++) {
    const point = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const previous = vertices[(index + vertices.length - 1) % vertices.length];
    const before = normals[(index + vertices.length - 1) % vertices.length];
    const after = normals[index];
    const shift = (origin: Position, normal: Position): Position => ({
      x: origin.x + normal.x,
      y: origin.y + normal.y,
    });
    strips.push(
      toPolygon([point, next, shift(next, after), shift(point, after)]),
    );
    if (cross(previous, point, next) * orientation * Math.sign(amount) <= 0)
      continue;
    const denominator =
      1 + (before.x * after.x + before.y * after.y) / (amount * amount);
    if (denominator < EPSILON) return null;
    strips.push(
      toPolygon([
        point,
        shift(point, before),
        {
          x: point.x + (before.x + after.x) / denominator,
          y: point.y + (before.y + after.y) / denominator,
        },
        shift(point, after),
      ]),
    );
  }
  try {
    const source = toPolygon(vertices);
    const regions =
      amount < 0
        ? clipping.difference(source, ...strips)
        : clipping.union(source, ...strips);
    const rings = regions.flatMap((region) =>
      region.map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y }))),
    );
    const surviving = rings.filter(
      (ring) => Math.abs(signedArea(ring)) > EPSILON,
    );
    return surviving.length && surviving.every(isSimple) ? surviving : null;
  } catch {
    // A failed preview must leave the original polygon intact.
    return null;
  }
}

function simpleOffset(vertices: Position[], amount: number): Position[] | null {
  if (amount === 0) return vertices;
  const orientation = Math.sign(signedArea(vertices));
  const normals = vertices.map((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    const length = distance(point, next);
    return {
      x: (orientation * (next.y - point.y)) / length,
      y: (-orientation * (next.x - point.x)) / length,
    };
  });
  const result: Position[] = [];
  for (let index = 0; index < vertices.length; index++) {
    const before = normals[(index + vertices.length - 1) % vertices.length];
    const after = normals[index];
    const denominator = 1 + before.x * after.x + before.y * after.y;
    if (denominator < EPSILON) return null;
    result.push({
      x: vertices[index].x + ((before.x + after.x) * amount) / denominator,
      y: vertices[index].y + ((before.y + after.y) * amount) / denominator,
    });
  }
  if (!isSimple(result) || signedArea(result) * orientation <= EPSILON)
    return null;
  for (let index = 0; index < result.length; index++) {
    const next = (index + 1) % result.length;
    // An edge reversing direction indicates an offset that has collapsed.
    if (
      (result[next].x - result[index].x) *
        (vertices[next].x - vertices[index].x) +
        (result[next].y - result[index].y) *
          (vertices[next].y - vertices[index].y) <=
      EPSILON
    )
      return null;
    if (amount < 0) {
      // Narrow concave features can disappear even without an edge reversal.
      if (!isPointInsideFramePolygon(result[index], vertices)) return null;
      for (let edge = 0; edge < vertices.length; edge++) {
        if (
          pointSegmentDistance(
            result[index],
            vertices[edge],
            vertices[(edge + 1) % vertices.length],
          ) <
          -amount - EPSILON
        )
          return null;
      }
    }
  }
  return result;
}

export function isPointInsideFramePolygon(
  point: Position,
  vertices: Position[],
): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function signedArea(vertices: Position[]): number {
  return (
    vertices.reduce((sum, point, index) => {
      const next = vertices[(index + 1) % vertices.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function distance(a: Position, b: Position) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentDistance(point: Position, a: Position, b: Position) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fraction = Math.max(
    0,
    Math.min(
      1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy),
    ),
  );
  return distance(point, { x: a.x + fraction * dx, y: a.y + fraction * dy });
}

function cross(a: Position, b: Position, c: Position) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isSimple(vertices: Position[]) {
  if (
    vertices.length < 3 ||
    vertices.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    return false;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (distance(a, b) <= EPSILON) return false;
    for (let j = i + 2; j < vertices.length; j++) {
      if (i === 0 && j === vertices.length - 1) continue;
      const c = vertices[j];
      const d = vertices[(j + 1) % vertices.length];
      if (
        Math.max(a.x, b.x) + EPSILON < Math.min(c.x, d.x) ||
        Math.max(c.x, d.x) + EPSILON < Math.min(a.x, b.x) ||
        Math.max(a.y, b.y) + EPSILON < Math.min(c.y, d.y) ||
        Math.max(c.y, d.y) + EPSILON < Math.min(a.y, b.y)
      )
        continue;
      if (
        cross(a, b, c) * cross(a, b, d) <= EPSILON &&
        cross(c, d, a) * cross(c, d, b) <= EPSILON
      )
        return false;
    }
  }
  return true;
}
