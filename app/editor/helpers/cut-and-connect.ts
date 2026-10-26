import clipping, { type Ring } from "polygon-clipping";
import type { Polygon, Position } from "~/editor/elma-types";
import { isWorldPointInGroundRegion } from "./polygon-helpers";
import { createPipePolygon } from "./pipe";
import { VERTEX_OVERLAP_EPSILON } from "./level-topology";

export const DEFAULT_CUT_CONNECT_WIDTH_PX = 10;
export const MIN_CUT_CONNECT_WIDTH_PX = 1;
export const MAX_CUT_CONNECT_WIDTH_PX = 2000;

export type CutConnectResult = {
  polygons: Polygon[];
  changedPolygons: Polygon[];
  error?: string;
};

// The document uses immutable polygon arrays. Build its parity region once,
// rather than re-running XOR for every pointer movement in the live preview.
const regionCache = new WeakMap<Polygon[], ReturnType<typeof prepareRegion>>();

function prepareRegion(polygons: Polygon[]) {
  const solids = polygons.filter((polygon) => !polygon.grass);
  const regions = solids.map((polygon) => {
    if (
      polygon.vertices.length < 3 ||
      polygon.vertices.some(
        (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
      )
    )
      throw new Error("Invalid polygon");
    return [toRing(polygon.vertices)];
  });
  return {
    solids: new Set(solids),
    sky: regions.length ? clipping.xor(regions[0], ...regions.slice(1)) : [],
    originals: new Map(
      solids.map((polygon) => [ringKey(polygon.vertices), polygon]),
    ),
  };
}

// Extend the starting material along a finite, square-ended stroke. Elma's
// rings alternate sky/ground by nesting, so XOR builds the actual sky region
// before union (cut ground) or difference (connect ground) reshapes it.
export function cutAndConnect(
  polygons: Polygon[],
  start: Position,
  end: Position,
  width: number,
): CutConnectResult {
  const unchanged = { polygons, changedPolygons: [] };
  if (![start.x, start.y, end.x, end.y, width].every(Number.isFinite)) {
    return unchanged;
  }
  const stroke = createPipePolygon([start, end], width);
  if (!stroke) return unchanged;

  try {
    let region = regionCache.get(polygons);
    if (!region) {
      region = prepareRegion(polygons);
      regionCache.set(polygons, region);
    }
    const { sky, solids, originals } = region;
    const brush = [toRing(stroke.vertices)];
    const nextSky = isWorldPointInGroundRegion(start, polygons)
      ? clipping.difference(sky, brush)
      : clipping.union(sky, brush);

    // Rings are stored separately in .lev, including holes and nested islands.
    // Reuse untouched originals, retaining their order and object identity.
    const next = nextSky.flatMap((region) =>
      region.map((ring) => {
        const vertices = ring.slice(0, -1).map(([x, y]) => ({ x, y }));
        return originals.get(ringKey(vertices)) ?? { vertices, grass: false };
      }),
    );
    const retained = new Set(next.filter((polygon) => solids.has(polygon)));
    const added = next.filter((polygon) => !retained.has(polygon));
    if (retained.size === solids.size && added.length === 0) return unchanged;
    if (hasNewVertexOverlap(retained, added)) {
      return {
        ...unchanged,
        error:
          "Cannot apply this stroke: terrain vertices would overlap or be too close. Adjust the endpoint or width.",
      };
    }
    return {
      polygons: [
        ...polygons.filter((polygon) => polygon.grass || retained.has(polygon)),
        ...added,
      ],
      changedPolygons: added,
    };
  } catch {
    // Imported malformed geometry must never destroy the level or break render.
    return {
      ...unchanged,
      error: "Cannot reshape these polygons. Check level topology.",
    };
  }
}

function hasNewVertexOverlap(
  retained: Set<Polygon>,
  added: Polygon[],
): boolean {
  // Boolean operations allow point contacts, but .lev topology forbids them.
  // Bucket vertices so the live preview does not need an all-pairs check.
  const cells = new Map<string, Position[]>();
  const cellIndex = (value: number) =>
    Math.floor(value / VERTEX_OVERLAP_EPSILON);
  const insert = (point: Position) => {
    const key = `${cellIndex(point.x)},${cellIndex(point.y)}`;
    const cell = cells.get(key);
    if (cell) cell.push(point);
    else cells.set(key, [point]);
  };
  // Existing issues on untouched polygons must not block an unrelated stroke.
  for (const polygon of retained) {
    for (const point of polygon.vertices) insert(point);
  }
  for (const polygon of added) {
    for (const point of polygon.vertices) {
      const x = cellIndex(point.x);
      const y = cellIndex(point.y);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = cells.get(`${x + dx},${y + dy}`);
          if (
            cell?.some(
              (other) =>
                Math.abs(point.x - other.x) < VERTEX_OVERLAP_EPSILON &&
                Math.abs(point.y - other.y) < VERTEX_OVERLAP_EPSILON,
            )
          )
            return true;
        }
      }
      insert(point);
    }
  }
  return false;
}

function toRing(vertices: Position[]): Ring {
  return vertices.map(({ x, y }) => [x, y]);
}

function ringKey(vertices: Position[]): string {
  // Boolean output drops collinear points. Match by shape so an unrelated
  // polygon retains deliberate intermediate vertices and selection identity.
  vertices = vertices.filter((point, index) => {
    const before = vertices[(index + vertices.length - 1) % vertices.length];
    const after = vertices[(index + 1) % vertices.length];
    const cross =
      (point.x - before.x) * (after.y - point.y) -
      (point.y - before.y) * (after.x - point.x);
    const dot =
      (point.x - before.x) * (after.x - point.x) +
      (point.y - before.y) * (after.y - point.y);
    return cross !== 0 || dot < 0;
  });
  let first = 0;
  for (let index = 1; index < vertices.length; index++) {
    if (
      vertices[index].x < vertices[first].x ||
      (vertices[index].x === vertices[first].x &&
        vertices[index].y < vertices[first].y)
    )
      first = index;
  }
  const keys = [1, -1].map((direction) =>
    JSON.stringify(
      vertices.map((_, index) => {
        const point =
          vertices[
            (first + direction * index + vertices.length) % vertices.length
          ];
        return [point.x, point.y];
      }),
    ),
  );
  return keys.sort()[0];
}
