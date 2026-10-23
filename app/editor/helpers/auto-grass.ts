import {
  ELMA_PIXEL_SCALE,
  GRASS_BASELINE_PX,
  QGRASS_TOP_EXTRA_PX,
} from "~/editor/constants";
import type { Polygon, Position } from "~/editor/elma-types";
import { isWorldPointInGroundRegion } from "~/editor/helpers/polygon-helpers";
import { DEFAULT_GRASS_MAX_SLOPE_DEGREES } from "~/editor/render/grass-renderer";

const SAMPLE_SPACING = 0.5;
const SURFACE_TEST_OFFSET = ELMA_PIXEL_SCALE * 8;
const MAX_GRASS_SLOPE_DEGREES = DEFAULT_GRASS_MAX_SLOPE_DEGREES;
// The renderer walks left to right and draws the final sprite in full. These
// margins allow a little sprite overlap to keep corner gaps visually small.
const GRASS_RIGHT_OVERHANG = ELMA_PIXEL_SCALE * 10;
const GRASS_TOP_CLEARANCE =
  ELMA_PIXEL_SCALE *
  (Math.ceil(GRASS_BASELINE_PX / 2) + QGRASS_TOP_EXTRA_PX + 1);
const GEOMETRY_EPSILON = 1e-8;

export type AutoGrassOptions = {
  depth: number;
  endInset: number;
};

export const defaultAutoGrassOptions: AutoGrassOptions = {
  depth: ELMA_PIXEL_SCALE * 16,
  endInset: ELMA_PIXEL_SCALE * 8,
};

type GrassableEdge = {
  sourceFrom: Position;
  sourceTo: Position;
  visibleStart: Position;
  visibleEnd: Position;
  direction: Position;
  length: number;
};

type GrassableSpan = GrassableEdge & {
  startT: number;
  endT: number;
  surfaceNormal: Position;
};

export function appendAutoGrassForPolygons({
  polygons,
  sourcePolygons,
  options = defaultAutoGrassOptions,
}: {
  polygons: Polygon[];
  sourcePolygons: Polygon[];
  options?: AutoGrassOptions;
}): Polygon[] {
  const generated = generateAutoGrassPolygons({
    polygons,
    sourcePolygons,
    options,
  });

  if (generated.length === 0) return polygons;
  return [...polygons, ...generated];
}

export function generateAutoGrassPolygons({
  polygons,
  sourcePolygons,
  options = defaultAutoGrassOptions,
}: {
  polygons: Polygon[];
  sourcePolygons: Polygon[];
  options?: AutoGrassOptions;
}): Polygon[] {
  const sourceSet = new Set(sourcePolygons);
  const solidPolygons = polygons.filter((polygon) => !polygon.grass);
  const generated: Polygon[] = [];

  for (const polygon of solidPolygons) {
    if (!sourceSet.has(polygon)) continue;
    if (polygon.vertices.length < 3) continue;

    generated.push(
      ...generateGrassForPolygon({ polygon, polygons: solidPolygons, options }),
    );
  }

  return generated;
}

export function getAutoGrassablePolygonsFromSelection(
  selectedVertices: Array<{ polygon: Polygon; vertex: Position }>,
): Polygon[] {
  const selectionCount = new Map<Polygon, number>();

  for (const { polygon } of selectedVertices) {
    selectionCount.set(polygon, (selectionCount.get(polygon) ?? 0) + 1);
  }

  return Array.from(selectionCount)
    .filter(
      ([polygon, count]) =>
        !polygon.grass &&
        polygon.vertices.length >= 3 &&
        count === polygon.vertices.length,
    )
    .map(([polygon]) => polygon);
}

function generateGrassForPolygon({
  polygon,
  polygons,
  options,
}: {
  polygon: Polygon;
  polygons: Polygon[];
  options: AutoGrassOptions;
}): Polygon[] {
  const grassableEdges = polygon.vertices.flatMap((from, index) =>
    getGrassableEdgeEntries({
      polygon,
      from,
      to: polygon.vertices[(index + 1) % polygon.vertices.length]!,
      polygons,
      options,
    }),
  );
  const runs = getContiguousRuns(grassableEdges);

  return runs
    .map((run) => generateGrassForEdgeRun(run, polygon, options))
    .filter((grassPolygon): grassPolygon is Polygon => Boolean(grassPolygon));
}

function getGrassableEdgeEntries({
  polygon,
  from,
  to,
  polygons,
  options,
}: {
  polygon: Polygon;
  from: Position;
  to: Position;
  polygons: Polygon[];
  options: AutoGrassOptions;
}): Array<GrassableEdge | null> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [null];

  const slopeDegrees = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
  const normalizedSlope = slopeDegrees > 90 ? 180 - slopeDegrees : slopeDegrees;
  if (normalizedSlope > MAX_GRASS_SLOPE_DEGREES) return [null];

  const dir = { x: dx / length, y: dy / length };
  const spans = getGrassableSpans({
    polygon,
    from,
    to,
    length,
    direction: dir,
    polygons,
  });
  if (spans.length === 0) return [null];

  const entries: Array<GrassableEdge | null> = [];
  if (spans[0]!.startT > 0) entries.push(null);

  spans.forEach((span, index) => {
    if (index > 0) entries.push(null);
    entries.push({
      sourceFrom: from,
      sourceTo: to,
      visibleStart: {
        x: span.visibleStart.x + span.surfaceNormal.x * options.depth,
        y: span.visibleStart.y + span.surfaceNormal.y * options.depth,
      },
      visibleEnd: {
        x: span.visibleEnd.x + span.surfaceNormal.x * options.depth,
        y: span.visibleEnd.y + span.surfaceNormal.y * options.depth,
      },
      direction: span.direction,
      length: span.length,
    });
  });

  if (spans[spans.length - 1]!.endT < 1) entries.push(null);
  return entries;
}

function getContiguousRuns(
  edges: Array<GrassableEdge | null>,
): GrassableEdge[][] {
  if (edges.every(Boolean)) {
    return [edges.filter((edge): edge is GrassableEdge => Boolean(edge))];
  }

  const startIndex = edges.findIndex(
    (edge, index) => edge && !edges[(index - 1 + edges.length) % edges.length],
  );
  if (startIndex === -1) return [];

  const runs: GrassableEdge[][] = [];
  let currentRun: GrassableEdge[] = [];

  for (let offset = 0; offset < edges.length; offset += 1) {
    const edge = edges[(startIndex + offset) % edges.length];
    if (edge) {
      currentRun.push(edge);
      continue;
    }

    if (currentRun.length > 0) {
      runs.push(currentRun);
      currentRun = [];
    }
  }

  if (currentRun.length > 0) runs.push(currentRun);
  return runs;
}

function generateGrassForEdgeRun(
  run: GrassableEdge[],
  polygon: Polygon,
  options: AutoGrassOptions,
): Polygon | null {
  const joinedVertices = getVisibleVerticesForEdgeRun(run);
  run = run.map((edge, index) => {
    const from = joinedVertices[index]!;
    const to = joinedVertices[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    return {
      ...edge,
      visibleStart: from,
      visibleEnd: to,
      length,
      direction:
        length > GEOMETRY_EPSILON
          ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
          : edge.direction,
    };
  });
  const firstEdge = run[0];
  const lastEdge = run[run.length - 1];
  if (!firstEdge || !lastEdge) return null;

  const totalRunLength = run.reduce((sum, edge) => sum + edge.length, 0);
  const startInset = getEndpointInset(run, polygon, options, true);
  const endInset = getEndpointInset(run, polygon, options, false);
  if (totalRunLength <= startInset + endInset + GEOMETRY_EPSILON) return null;

  // Walk the polyline rather than clamping the inset to one source edge. Short
  // segments must not force the endpoint to stay beside an unsafe corner.
  const visibleVertices: Position[] = [];
  let distance = 0;
  for (const edge of run) {
    const start = Math.max(0, startInset - distance);
    const end = Math.min(edge.length, totalRunLength - endInset - distance);
    if (end - start > GEOMETRY_EPSILON) {
      if (visibleVertices.length === 0) {
        visibleVertices.push(pointAlongEdge(edge, start));
      }
      visibleVertices.push(pointAlongEdge(edge, end));
    }
    distance += edge.length;
  }

  return {
    grass: true,
    grassDepth: options.depth,
    vertices:
      options.endInset <= 0
        ? visibleVertices
        : [
            ...visibleVertices,
            { ...visibleVertices[visibleVertices.length - 1]! } as Position,
          ],
  } as Polygon;
}

function pointAlongEdge(edge: GrassableEdge, distance: number): Position {
  return {
    x: edge.visibleStart.x + edge.direction.x * distance,
    y: edge.visibleStart.y + edge.direction.y * distance,
  } as Position;
}

// Only trim the ends of a run. Nearby, unrelated edges must not punch holes
// in an otherwise continuous floor. Look around the next two corners for a lip
// or inward roof, stopping as soon as we reach another grassable floor edge.
function getEndpointInset(
  run: GrassableEdge[],
  polygon: Polygon,
  options: AutoGrassOptions,
  atStart: boolean,
): number {
  const edge = run[atStart ? 0 : run.length - 1]!;
  const endpoint = atStart ? edge.visibleStart : edge.visibleEnd;
  const inward = atStart
    ? edge.direction
    : { x: -edge.direction.x, y: -edge.direction.y };
  const sourceIndex = polygon.vertices.indexOf(edge.sourceFrom);
  const count = polygon.vertices.length;
  let inset = Math.max(0, options.endInset);
  for (let step = 1; step <= Math.min(3, count - 1); step += 1) {
    const index = (sourceIndex + (atStart ? -step : step) + count) % count;
    const from = polygon.vertices[index]!;
    const to = polygon.vertices[(index + 1) % count]!;
    if (run.some((floor) => floor.sourceFrom === from)) break;
    const requiredInset = getWallInset(
      endpoint,
      { x: endpoint.x + inward.x, y: endpoint.y + inward.y } as Position,
      from,
      to,
      options.depth,
    );
    if (requiredInset == null) break;
    inset = Math.max(inset, requiredInset);
  }
  return inset;
}

// Project just the sky-side part of a neighbouring wall into the grass band.
// This varies continuously with the corner angle and ignores outward corners.
function getWallInset(
  from: Position,
  to: Position,
  wallFrom: Position,
  wallTo: Position,
  depth: number,
): number | null {
  const dx = to.x - from.x;
  if (Math.abs(dx) <= GEOMETRY_EPSILON) return null;
  const slope = (to.y - from.y) / dx;
  const groundBoundary = -depth * Math.hypot(1, slope);
  if (groundBoundary <= -GRASS_TOP_CLEARANCE) return null;
  const relativeY = (point: Position) =>
    point.y - (from.y + slope * (point.x - from.x));
  const y0 = relativeY(wallFrom);
  const deltaY = relativeY(wallTo) - y0;
  let start = 0;
  let end = 1;
  if (Math.abs(deltaY) <= GEOMETRY_EPSILON) {
    if (y0 < -GRASS_TOP_CLEARANCE || y0 >= groundBoundary - GEOMETRY_EPSILON) {
      return null;
    }
  } else {
    const t0 = (-GRASS_TOP_CLEARANCE - y0) / deltaY;
    const t1 = (groundBoundary - y0) / deltaY;
    start = Math.max(0, Math.min(t0, t1));
    end = Math.min(1, Math.max(t0, t1));
    if (end - start <= GEOMETRY_EPSILON) return null;
  }
  const x0 = wallFrom.x + (wallTo.x - wallFrom.x) * start;
  const x1 = wallFrom.x + (wallTo.x - wallFrom.x) * end;
  // Only the right end overruns by a sprite; the left end needs rounding room.
  const left = Math.min(x0, x1) - GRASS_RIGHT_OVERHANG;
  const right = Math.max(x0, x1) + ELMA_PIXEL_SCALE;
  const t0 = (left - from.x) / dx;
  const t1 = (right - from.x) / dx;
  const inset = Math.max(t0, t1);
  return inset > GEOMETRY_EPSILON ? inset : null;
}

function getVisibleVerticesForEdgeRun(run: GrassableEdge[]): Position[] {
  const visibleVertices = [run[0]!.visibleStart];

  for (let index = 1; index < run.length; index += 1) {
    visibleVertices.push(getOffsetLineJoin(run[index - 1]!, run[index]!));
  }

  visibleVertices.push(run[run.length - 1]!.visibleEnd);
  return visibleVertices;
}

function getOffsetLineJoin(
  previousEdge: GrassableEdge,
  nextEdge: GrassableEdge,
): Position {
  const cross =
    previousEdge.direction.x * nextEdge.direction.y -
    previousEdge.direction.y * nextEdge.direction.x;

  if (Math.abs(cross) < Number.EPSILON) {
    return previousEdge.visibleEnd;
  }

  const dx = nextEdge.visibleStart.x - previousEdge.visibleStart.x;
  const dy = nextEdge.visibleStart.y - previousEdge.visibleStart.y;
  const previousT =
    (dx * nextEdge.direction.y - dy * nextEdge.direction.x) / cross;

  return {
    x: previousEdge.visibleStart.x + previousEdge.direction.x * previousT,
    y: previousEdge.visibleStart.y + previousEdge.direction.y * previousT,
  } as Position;
}

// Keep both surface probes closer than any other boundary of this polygon.
// A fixed probe can jump across a thin tip and mistake ground for sky.
function getSurfaceTestOffset(
  point: Position,
  sourceFrom: Position,
  sourceTo: Position,
  polygon: Polygon,
): number {
  let distanceSquared = (SURFACE_TEST_OFFSET * 2) ** 2;
  for (let index = 0; index < polygon.vertices.length; index += 1) {
    const from = polygon.vertices[index]!;
    const to = polygon.vertices[(index + 1) % polygon.vertices.length]!;
    if (from === sourceFrom && to === sourceTo) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - from.x) * dx + (point.y - from.y) * dy) /
                lengthSquared,
            ),
          );
    distanceSquared = Math.min(
      distanceSquared,
      (point.x - from.x - t * dx) ** 2 + (point.y - from.y - t * dy) ** 2,
    );
  }
  return Math.sqrt(distanceSquared) / 2;
}

function edgeHasGrassClearance({
  offset,
  point,
  surfaceNormal,
  polygons,
}: {
  offset: number;
  point: Position;
  surfaceNormal: Position;
  polygons: Polygon[];
}) {
  const above = {
    x: point.x - surfaceNormal.x * offset,
    y: point.y - surfaceNormal.y * offset,
  };
  const below = {
    x: point.x + surfaceNormal.x * offset,
    y: point.y + surfaceNormal.y * offset,
  };

  if (isWorldPointInGroundRegion(above, polygons)) return false;
  if (!isWorldPointInGroundRegion(below, polygons)) return false;
  return true;
}

function getGrassableSpans({
  polygon,
  from,
  to,
  length,
  direction,
  polygons,
}: {
  polygon: Polygon;
  from: Position;
  to: Position;
  length: number;
  direction: Position;
  polygons: Polygon[];
}): GrassableSpan[] {
  const intervalCount = Math.max(3, Math.ceil(length / SAMPLE_SPACING));
  const surfaceNormal = getDownwardSurfaceNormal({ from, to, length });
  const spans: GrassableSpan[] = [];
  let spanStartIndex: number | null = null;

  for (
    let intervalIndex = 0;
    intervalIndex < intervalCount;
    intervalIndex += 1
  ) {
    const t = (intervalIndex + 0.5) / intervalCount;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    const hasClearance = edgeHasGrassClearance({
      offset: getSurfaceTestOffset(point, from, to, polygon),
      point,
      surfaceNormal,
      polygons,
    });

    if (hasClearance) {
      spanStartIndex ??= intervalIndex;
      continue;
    }

    if (spanStartIndex != null) {
      spans.push(
        createGrassableSpan({
          from,
          to,
          direction,
          startT: spanStartIndex / intervalCount,
          endT: intervalIndex / intervalCount,
        }),
      );
      spanStartIndex = null;
    }
  }

  if (spanStartIndex != null) {
    spans.push(
      createGrassableSpan({
        from,
        to,
        direction,
        startT: spanStartIndex / intervalCount,
        endT: 1,
      }),
    );
  }

  return spans;
}

function createGrassableSpan({
  from,
  to,
  direction,
  startT,
  endT,
}: {
  from: Position;
  to: Position;
  direction: Position;
  startT: number;
  endT: number;
}): GrassableSpan {
  const visibleStart = {
    x: from.x + (to.x - from.x) * startT,
    y: from.y + (to.y - from.y) * startT,
  };
  const visibleEnd = {
    x: from.x + (to.x - from.x) * endT,
    y: from.y + (to.y - from.y) * endT,
  };

  return {
    sourceFrom: from,
    sourceTo: to,
    visibleStart,
    visibleEnd,
    direction,
    surfaceNormal: getDownwardSurfaceNormal({
      from,
      to,
      length: Math.hypot(to.x - from.x, to.y - from.y),
    }),
    length: Math.hypot(
      visibleEnd.x - visibleStart.x,
      visibleEnd.y - visibleStart.y,
    ),
    startT,
    endT,
  };
}

function getDownwardSurfaceNormal({
  from,
  to,
  length,
}: {
  from: Position;
  to: Position;
  length: number;
}) {
  const normal = {
    x: -(to.y - from.y) / length,
    y: (to.x - from.x) / length,
  };

  return normal.y >= 0 ? normal : { x: -normal.x, y: -normal.y };
}
