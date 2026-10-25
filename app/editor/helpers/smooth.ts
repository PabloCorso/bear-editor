import type { Polygon, Position } from "../elma-types";
import { getClosestPointOnLineSegment } from "./coordinate-helpers";
import { isPolygonClockwise } from "./polygon-helpers";
import { validateLevelTopology } from "./level-topology";

export const DEFAULT_SMOOTH_AMOUNT = 1;
export const MIN_SMOOTH_AMOUNT = -5;
export const MAX_SMOOTH_AMOUNT = 5;
// Bound subdivision and topology checking, including repeated clicks.
export const MAX_SMOOTH_VERTICES = 2048;

export type SmoothResult = { polygon: Polygon; message?: string };

/** Positive steps cut corners (Chaikin); negative steps simplify the closed ring.
 * Neither operation is the inverse of the other. Every preview starts from source.
 */
export function transformSmoothPolygon(
  source: Polygon,
  amount: number,
): SmoothResult {
  if (!Number.isFinite(amount)) return { polygon: source };
  amount = Math.max(
    MIN_SMOOTH_AMOUNT,
    Math.min(MAX_SMOOTH_AMOUNT, Math.trunc(amount)),
  );
  if (amount === 0) return { polygon: source };
  if (
    source.vertices.length < 3 ||
    source.vertices.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  ) {
    return {
      polygon: source,
      message: "Choose a polygon with at least three finite vertices",
    };
  }
  if (source.vertices.length > MAX_SMOOTH_VERTICES) {
    return {
      polygon: source,
      message: "Polygon exceeds the Smooth vertex limit",
    };
  }

  let vertices = source.vertices;
  let message: string | undefined;
  if (amount > 0) {
    for (let pass = 0; pass < amount; pass++) {
      if (vertices.length * 2 > MAX_SMOOTH_VERTICES) {
        message = "Smooth vertex limit reached";
        break;
      }
      vertices = vertices.flatMap((point, index) => {
        const next = vertices[(index + 1) % vertices.length];
        return [
          {
            x: point.x * 0.75 + next.x * 0.25,
            y: point.y * 0.75 + next.y * 0.25,
          },
          {
            x: point.x * 0.25 + next.x * 0.75,
            y: point.y * 0.25 + next.y * 0.75,
          },
        ];
      });
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
    if (vertices.length === source.vertices.length)
      return {
        polygon: source,
        message: "No vertices to simplify at this amount",
      };
  }
  if (vertices === source.vertices) return { polygon: source, message };
  const polygon = { ...source, vertices };
  const area = vertices.reduce((sum, p, i) => {
    const next = vertices[(i + 1) % vertices.length];
    return sum + p.x * next.y - next.x * p.y;
  }, 0);
  // Decorative grass also needs a safe ring here; validate it as solid geometry.
  const issues = validateLevelTopology({
    polygons: [{ ...polygon, grass: false }],
  }).issues;
  if (
    vertices.length < 3 ||
    Math.abs(area) < 1e-12 ||
    isPolygonClockwise(vertices) !== isPolygonClockwise(source.vertices) ||
    issues.some((issue) =>
      ["duplicate-vertex", "nearby-vertex", "self-intersection"].includes(
        issue.type,
      ),
    )
  ) {
    return {
      polygon: source,
      message: "This amount would create an invalid polygon",
    };
  }
  return { polygon, message };
}

function distanceSquared(a: Position, b: Position) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
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
