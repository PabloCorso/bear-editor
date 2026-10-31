import clipping, {
  type MultiPolygon,
  type Polygon as ClipPolygon,
} from "polygon-clipping";
import simplify from "simplify-js";
import earcut from "earcut";
import type { Polygon } from "../elma-types";
import type { Ring, Shape, TraceOptions } from "./types";

export function ringArea(ring: Ring): number {
  return (
    Math.abs(
      ring.reduce((sum, p, i) => {
        const next = ring[(i + 1) % ring.length];
        return sum + p.x * next.y - next.x * p.y;
      }, 0),
    ) / 2
  );
}

function cleanRing(ring: Ring): Ring {
  if (ring.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    throw new Error("The tracer returned invalid coordinates.");
  const cleaned = ring.filter(
    (p, i) => !i || p.x !== ring[i - 1].x || p.y !== ring[i - 1].y,
  );
  if (
    cleaned.length > 1 &&
    cleaned[0].x === cleaned.at(-1)!.x &&
    cleaned[0].y === cleaned.at(-1)!.y
  )
    cleaned.pop();
  return cleaned;
}

function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (!tolerance || ring.length < 4) return ring;
  // Split a closed ring into two open arcs; RDP on a coincident start/end
  // otherwise erases small closed shapes unpredictably.
  let split = 1,
    distance = 0;
  ring.forEach((p, i) => {
    const d = (p.x - ring[0].x) ** 2 + (p.y - ring[0].y) ** 2;
    if (d > distance) {
      distance = d;
      split = i;
    }
  });
  return [
    ...simplify(ring.slice(0, split + 1), tolerance, true).slice(0, -1),
    ...simplify([...ring.slice(split), ring[0]], tolerance, true).slice(0, -1),
  ];
}

export function unionShapes(shapes: Shape[]): MultiPolygon {
  let groups: MultiPolygon[] = shapes
    .filter((s) => s[0]?.length >= 3)
    .map((s) => [s.map((r) => r.map((p) => [p.x, p.y])) as ClipPolygon]);
  // Bound argument counts for detailed artwork and union stroke joints before
  // exporting rings: overlapping Elma polygons would cancel under parity fill.
  while (groups.length > 1) {
    const next: MultiPolygon[] = [];
    for (let i = 0; i < groups.length; i += 32) {
      const batch = groups.slice(i, i + 32);
      next.push(clipping.union(batch[0], ...batch.slice(1)));
    }
    groups = next;
  }
  return groups.length ? clipping.union(groups[0]) : [];
}

export function finalizeShapes(
  shapes: Shape[],
  width: number,
  height: number,
  options: TraceOptions,
): { polygons: Polygon[]; warnings: string[] } {
  const warnings: string[] = [];
  const cleaned = shapes
    .map((s) => s.map((r) => cleanRing(r)))
    .filter((s) => s[0]?.length >= 3)
    .map((s) => s.filter((r) => r.length >= 3));
  const region = unionShapes(cleaned);
  const simplified: Shape[] = region
    .map((s) =>
      s
        .map((r) => {
          const original = cleanRing(r.map(([x, y]) => ({ x, y })));
          const candidate = simplifyRing(original, options.simplify);
          return candidate.length >= 3 && ringArea(candidate) > 1e-8
            ? candidate
            : original;
        })
        .filter((r, i) => i === 0 || ringArea(r) >= options.minArea),
    )
    .filter((s) => ringArea(s[0]) >= options.minArea);
  // Boolean normalization repairs any intersections introduced by simplification
  // and returns simple outer/hole contours for the Elma parity model.
  const normalized = unionShapes(simplified);
  let rings: Ring[] = [];
  for (const shape of normalized) {
    if (options.decompose && shape.length > 1) {
      const points = shape.map((r) => cleanRing(r.map(([x, y]) => ({ x, y }))));
      const holes: number[] = [];
      let offset = points[0].length;
      for (const hole of points.slice(1)) {
        holes.push(offset);
        offset += hole.length;
      }
      const flat = points.flat();
      const triangles = earcut(
        flat.flatMap((p) => [p.x, p.y]),
        holes,
        2,
      );
      for (let i = 0; i < triangles.length; i += 3)
        rings.push(triangles.slice(i, i + 3).map((index) => flat[index]));
    } else {
      rings.push(...shape.map((r) => cleanRing(r.map(([x, y]) => ({ x, y })))));
    }
  }
  if (options.decompose)
    warnings.push(
      "Hole decomposition creates triangles with shared edges. This is a visual experiment; topology checks can report those edges.",
    );
  if (options.darkGround && normalized.length)
    rings.unshift([
      { x: -1, y: -1 },
      { x: width + 1, y: -1 },
      { x: width + 1, y: height + 1 },
      { x: -1, y: height + 1 },
    ]);
  rings = rings.filter((r) => r.length >= 3 && ringArea(r) > 1e-8);
  if (!normalized.length)
    warnings.push("No dark regions survived these settings.");
  return {
    polygons: rings.map((vertices) => ({ grass: false, vertices })),
    warnings,
  };
}

// Round-capped segment regions are unioned, avoiding XOR gaps at line joins.
export function strokePolylines(lines: number[][][], width: number): Shape[] {
  const shapes: Shape[] = [];
  const radius = width / 2;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1],
        [bx, by] = line[i];
      const length = Math.hypot(bx - ax, by - ay);
      if (!length) continue;
      const dx = (-(by - ay) / length) * radius,
        dy = ((bx - ax) / length) * radius;
      shapes.push([
        [
          { x: ax + dx, y: ay + dy },
          { x: bx + dx, y: by + dy },
          { x: bx - dx, y: by - dy },
          { x: ax - dx, y: ay - dy },
        ],
      ]);
    }
    for (const [x, y] of line)
      shapes.push([
        Array.from({ length: 12 }, (_, i) => ({
          x: x + Math.cos((i * Math.PI) / 6) * radius,
          y: y + Math.sin((i * Math.PI) / 6) * radius,
        })),
      ]);
  }
  return shapes;
}
