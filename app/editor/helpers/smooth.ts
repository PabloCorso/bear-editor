import type { Polygon, Position } from "../elma-types";
import { getClosestPointOnLineSegment } from "./coordinate-helpers";
import { isPolygonClockwise } from "./polygon-helpers";
import { validateLevelTopology } from "./level-topology";

export const DEFAULT_SMOOTH_AMOUNT = 1;
export const MIN_SMOOTH_AMOUNT = -5;
export const MAX_SMOOTH_AMOUNT = 5;
export const DEFAULT_SMOOTH_VERTEX_OFFSET = 75;
export const MIN_SMOOTH_VERTEX_OFFSET = 50;
export const MAX_SMOOTH_VERTEX_OFFSET = 100;
// Bound subdivision and topology checking, including repeated clicks.
export const MAX_SMOOTH_VERTICES = 2048;

export type SmoothResult = { polygon: Polygon };

/** Positive steps cut corners (Chaikin); negative steps simplify the closed ring.
 * Neither operation is the inverse of the other. Every preview starts from source.
 */
export function transformSmoothPolygon(
  source: Polygon,
  amount: number,
  vertexOffset = DEFAULT_SMOOTH_VERTEX_OFFSET,
): SmoothResult {
  if (!Number.isFinite(amount)) return { polygon: source };
  amount = Math.max(
    MIN_SMOOTH_AMOUNT,
    Math.min(MAX_SMOOTH_AMOUNT, Math.trunc(amount)),
  );
  if (amount === 0) return { polygon: source };
  const minimumVertexCount = source.grass ? 2 : 3;
  if (
    source.vertices.length < minimumVertexCount ||
    source.vertices.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  ) {
    return { polygon: source };
  }
  if (source.vertices.length > MAX_SMOOTH_VERTICES) {
    return { polygon: source };
  }

  let vertices = source.vertices;
  if (amount > 0) {
    const offset =
      Math.max(
        MIN_SMOOTH_VERTEX_OFFSET,
        Math.min(MAX_SMOOTH_VERTEX_OFFSET, vertexOffset),
      ) / 100;
    if (offset === 1) return { polygon: source };
    for (let pass = 0; pass < amount; pass++) {
      if (vertices.length * 2 > MAX_SMOOTH_VERTICES) {
        break;
      }
      vertices = dedupeClosedRing(
        vertices.flatMap((point, index) => {
          const next = vertices[(index + 1) % vertices.length];
          return [
            {
              x: point.x * offset + next.x * (1 - offset),
              y: point.y * offset + next.y * (1 - offset),
            },
            {
              x: point.x * (1 - offset) + next.x * offset,
              y: point.y * (1 - offset) + next.y * offset,
            },
          ];
        }),
      );
    }
  } else {
    const xs = vertices.map((p) => p.x);
    const ys = vertices.map((p) => p.y);
    const diagonal = Math.hypot(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
    );
    const tolerance = diagonal * 0.005 * 2 ** (-amount - 1);
    // Split into two open arcs before RDP so the closing edge gets equal treatment.
    let split = 1;
    for (let i = 2; i < vertices.length; i++) {
      if (
        distanceSquared(vertices[0], vertices[i]) >
        distanceSquared(vertices[0], vertices[split])
      )
        split = i;
    }
    vertices = [
      ...simplifyArc(vertices.slice(0, split + 1), tolerance).slice(0, -1),
      ...simplifyArc([...vertices.slice(split), vertices[0]], tolerance).slice(
        0,
        -1,
      ),
    ];
    if (vertices.length === source.vertices.length) return { polygon: source };
  }
  if (vertices === source.vertices) return { polygon: source };
  const polygon = { ...source, vertices };
  if (vertices.length < minimumVertexCount) return { polygon: source };
  if (!source.grass) {
    const area = vertices.reduce((sum, p, i) => {
      const next = vertices[(i + 1) % vertices.length];
      return sum + p.x * next.y - next.x * p.y;
    }, 0);
    const issues = validateLevelTopology({ polygons: [polygon] }).issues;
    if (
      Math.abs(area) < 1e-12 ||
      isPolygonClockwise(vertices) !== isPolygonClockwise(source.vertices) ||
      issues.some((issue) =>
        ["duplicate-vertex", "nearby-vertex", "self-intersection"].includes(
          issue.type,
        ),
      )
    ) {
      return { polygon: source };
    }
  }
  return { polygon };
}

function distanceSquared(a: Position, b: Position) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function dedupeClosedRing(vertices: Position[]) {
  const deduped = vertices.filter(
    (vertex, index) =>
      index === 0 || distanceSquared(vertex, vertices[index - 1]) !== 0,
  );
  if (
    deduped.length > 1 &&
    distanceSquared(deduped[0], deduped[deduped.length - 1]) === 0
  ) {
    deduped.pop();
  }
  return deduped;
}

// Iterative Ramer–Douglas–Peucker avoids recursion limits on imported polygons.
function simplifyArc(points: Position[], tolerance: number): Position[] {
  const keep = new Set([0, points.length - 1]);
  const pending = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    let farthest = -1;
    let maxDistance = tolerance ** 2;
    for (let i = start + 1; i < end; i++) {
      const closest = getClosestPointOnLineSegment(
        points[i],
        points[start],
        points[end],
      );
      const distance = distanceSquared(points[i], closest);
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep.add(farthest);
      pending.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, index) => keep.has(index));
}
