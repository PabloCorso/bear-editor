import {
  ELMA_PIXEL_SCALE,
  QGRASS_TOP_EXTRA_PX,
} from "~/editor/constants";
import type { WorldPoint } from "~/editor/render/world-scene";

const MIN_ZOOM_EPSILON = 0.0001;
const GRASS_TINY_CANVAS_UNIT_PX = 1;
const GRASS_COLLINEAR_DOT_THRESHOLD = 0.98;
const GRASS_JOIN_OVERLAP = ELMA_PIXEL_SCALE;

const triangulationCache = new WeakMap<
  WorldPoint[],
  Array<readonly [number, number, number]>
>();

export function getCachedTriangulation(vertices: WorldPoint[]) {
  const cached = triangulationCache.get(vertices);
  if (cached) return cached;

  const computed = triangulatePolygon(vertices);
  triangulationCache.set(vertices, computed);
  return computed;
}

export function appendRectVertices(
  vertices: number[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  vertices.push(
    x,
    y,
    0,
    0,
    x + width,
    y,
    0,
    0,
    x,
    y + height,
    0,
    0,
    x,
    y + height,
    0,
    0,
    x + width,
    y,
    0,
    0,
    x + width,
    y + height,
    0,
    0,
  );
}

export function appendLineVertices(
  vertices: number[],
  from: WorldPoint,
  to: WorldPoint,
  width: number,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;

  const nx = (-dy / length) * (width / 2);
  const ny = (dx / length) * (width / 2);
  vertices.push(
    from.x + nx,
    from.y + ny,
    0,
    0,
    from.x - nx,
    from.y - ny,
    0,
    0,
    to.x + nx,
    to.y + ny,
    0,
    0,
    to.x + nx,
    to.y + ny,
    0,
    0,
    from.x - nx,
    from.y - ny,
    0,
    0,
    to.x - nx,
    to.y - ny,
    0,
    0,
  );
}

export function appendRectOutlineVertices(
  vertices: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  lineWidth: number,
) {
  if (lineWidth <= 0) return;

  const halfLineWidth = lineWidth / 2;
  const innerMinX = Math.min(x + halfLineWidth, x + width / 2);
  const innerMaxX = Math.max(x + width - halfLineWidth, x + width / 2);
  const innerMinY = Math.min(y + halfLineWidth, y + height / 2);
  const innerMaxY = Math.max(y + height - halfLineWidth, y + height / 2);

  const outerTopLeft = { x: x - halfLineWidth, y: y - halfLineWidth };
  const outerTopRight = {
    x: x + width + halfLineWidth,
    y: y - halfLineWidth,
  };
  const outerBottomRight = {
    x: x + width + halfLineWidth,
    y: y + height + halfLineWidth,
  };
  const outerBottomLeft = {
    x: x - halfLineWidth,
    y: y + height + halfLineWidth,
  };

  const innerTopLeft = { x: innerMinX, y: innerMinY };
  const innerTopRight = { x: innerMaxX, y: innerMinY };
  const innerBottomRight = { x: innerMaxX, y: innerMaxY };
  const innerBottomLeft = { x: innerMinX, y: innerMaxY };

  appendRingQuad(
    vertices,
    outerTopLeft,
    outerTopRight,
    innerTopRight,
    innerTopLeft,
  );
  appendRingQuad(
    vertices,
    outerTopRight,
    outerBottomRight,
    innerBottomRight,
    innerTopRight,
  );
  appendRingQuad(
    vertices,
    outerBottomRight,
    outerBottomLeft,
    innerBottomLeft,
    innerBottomRight,
  );
  appendRingQuad(
    vertices,
    outerBottomLeft,
    outerTopLeft,
    innerTopLeft,
    innerBottomLeft,
  );
}

export function appendCircleVertices(
  vertices: number[],
  center: WorldPoint,
  radius: number,
) {
  const segments = 24;
  for (let index = 0; index < segments; index += 1) {
    const a = (index / segments) * Math.PI * 2;
    const b = ((index + 1) / segments) * Math.PI * 2;
    vertices.push(
      center.x,
      center.y,
      0,
      0,
      center.x + Math.cos(a) * radius,
      center.y + Math.sin(a) * radius,
      0,
      0,
      center.x + Math.cos(b) * radius,
      center.y + Math.sin(b) * radius,
      0,
      0,
    );
  }
}

export function appendCircleOutlineVertices(
  vertices: number[],
  center: WorldPoint,
  radius: number,
  lineWidth: number,
) {
  const segments = 24;
  for (let index = 0; index < segments; index += 1) {
    const a = (index / segments) * Math.PI * 2;
    const b = ((index + 1) / segments) * Math.PI * 2;
    const outerA = {
      x: center.x + Math.cos(a) * (radius + lineWidth / 2),
      y: center.y + Math.sin(a) * (radius + lineWidth / 2),
    };
    const innerA = {
      x: center.x + Math.cos(a) * Math.max(0, radius - lineWidth / 2),
      y: center.y + Math.sin(a) * Math.max(0, radius - lineWidth / 2),
    };
    const outerB = {
      x: center.x + Math.cos(b) * (radius + lineWidth / 2),
      y: center.y + Math.sin(b) * (radius + lineWidth / 2),
    };
    const innerB = {
      x: center.x + Math.cos(b) * Math.max(0, radius - lineWidth / 2),
      y: center.y + Math.sin(b) * Math.max(0, radius - lineWidth / 2),
    };

    vertices.push(
      outerA.x,
      outerA.y,
      0,
      0,
      innerA.x,
      innerA.y,
      0,
      0,
      outerB.x,
      outerB.y,
      0,
      0,
      outerB.x,
      outerB.y,
      0,
      0,
      innerA.x,
      innerA.y,
      0,
      0,
      innerB.x,
      innerB.y,
      0,
      0,
    );
  }
}

export function getSimpleGrassFillQuads({
  vertices,
  grassEdgeIndices,
  zoom,
  depth,
}: {
  vertices: WorldPoint[];
  grassEdgeIndices: number[];
  zoom: number;
  depth: number;
}) {
  const tinyCanvasUnit =
    GRASS_TINY_CANVAS_UNIT_PX / Math.max(zoom, MIN_ZOOM_EPSILON);
  const grassEdgesSet = new Set(grassEdgeIndices);
  const vertexCount = vertices.length;
  const fillDepth = depth + QGRASS_TOP_EXTRA_PX * ELMA_PIXEL_SCALE;
  const quads: Array<
    readonly [WorldPoint, WorldPoint, WorldPoint, WorldPoint]
  > = [];

  for (const index of grassEdgeIndices) {
    const from = vertices[index]!;
    const to = vertices[(index + 1) % vertexCount]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) continue;

    const prevEdgeIndex = (index - 1 + vertexCount) % vertexCount;
    const nextEdgeIndex = (index + 1) % vertexCount;
    const hasPrevGrass = grassEdgesSet.has(prevEdgeIndex);
    const hasNextGrass = grassEdgesSet.has(nextEdgeIndex);
    const edgeDir = {
      x: (to.x - from.x) / length,
      y: (to.y - from.y) / length,
    };
    const edgeOverlap = Math.min(GRASS_JOIN_OVERLAP, length * 0.25);
    const prevFrom = vertices[prevEdgeIndex]!;
    const prevTo = vertices[index]!;
    const prevLength = Math.hypot(prevTo.x - prevFrom.x, prevTo.y - prevFrom.y);
    const nextFrom = vertices[(index + 1) % vertexCount]!;
    const nextTo = vertices[(index + 2) % vertexCount]!;
    const nextLength = Math.hypot(nextTo.x - nextFrom.x, nextTo.y - nextFrom.y);

    let fromX = from.x;
    let fromY = from.y;
    let toX = to.x;
    let toY = to.y;
    let fromExtend = 0;
    let toExtend = 0;

    if (hasPrevGrass && prevLength > 0) {
      const prevDir = {
        x: (prevTo.x - prevFrom.x) / prevLength,
        y: (prevTo.y - prevFrom.y) / prevLength,
      };
      const dot = prevDir.x * edgeDir.x + prevDir.y * edgeDir.y;
      if (dot >= GRASS_COLLINEAR_DOT_THRESHOLD) {
        fromExtend = edgeOverlap;
      }
    }

    if (hasNextGrass && nextLength > 0) {
      const nextDir = {
        x: (nextTo.x - nextFrom.x) / nextLength,
        y: (nextTo.y - nextFrom.y) / nextLength,
      };
      const dot = edgeDir.x * nextDir.x + edgeDir.y * nextDir.y;
      if (dot >= GRASS_COLLINEAR_DOT_THRESHOLD) {
        toExtend = edgeOverlap;
      }
    }

    if (hasPrevGrass && hasNextGrass) {
      toExtend = Math.max(toExtend, Math.min(tinyCanvasUnit, length * 0.25));
    }

    fromX -= edgeDir.x * fromExtend;
    fromY -= edgeDir.y * fromExtend;
    toX += edgeDir.x * toExtend;
    toY += edgeDir.y * toExtend;

    quads.push([
      { x: fromX, y: fromY },
      { x: toX, y: toY },
      {
        x: toX,
        y: toY - fillDepth,
      },
      {
        x: fromX,
        y: fromY - fillDepth,
      },
    ]);
  }

  return quads;
}

function triangulatePolygon(vertices: WorldPoint[]) {
  if (vertices.length < 3) return [];
  if (vertices.length === 3) return [[0, 1, 2] as const];

  const indices = vertices.map((_, index) => index);
  const triangles: Array<readonly [number, number, number]> = [];
  const isClockwise = signedArea(vertices) < 0;
  let guard = vertices.length * vertices.length;

  while (indices.length > 3 && guard > 0) {
    guard -= 1;
    let clippedEar = false;

    for (let index = 0; index < indices.length; index += 1) {
      const previousIndex =
        indices[(index - 1 + indices.length) % indices.length]!;
      const currentIndex = indices[index]!;
      const nextIndex = indices[(index + 1) % indices.length]!;
      const previous = vertices[previousIndex]!;
      const current = vertices[currentIndex]!;
      const next = vertices[nextIndex]!;

      if (!isConvex(previous, current, next, isClockwise)) continue;

      const containsOtherVertex = indices.some((candidateIndex) => {
        if (
          candidateIndex === previousIndex ||
          candidateIndex === currentIndex ||
          candidateIndex === nextIndex
        ) {
          return false;
        }

        return isPointInTriangle(
          vertices[candidateIndex]!,
          previous,
          current,
          next,
        );
      });
      if (containsOtherVertex) continue;

      triangles.push([previousIndex, currentIndex, nextIndex]);
      indices.splice(index, 1);
      clippedEar = true;
      break;
    }

    if (!clippedEar) {
      return triangulatePolygonFan(vertices);
    }
  }

  if (indices.length === 3) {
    triangles.push([indices[0]!, indices[1]!, indices[2]!]);
  }

  return triangles;
}

function triangulatePolygonFan(vertices: WorldPoint[]) {
  const triangles: Array<readonly [number, number, number]> = [];
  for (let index = 1; index < vertices.length - 1; index += 1) {
    triangles.push([0, index, index + 1]);
  }
  return triangles;
}

function appendRingQuad(
  vertices: number[],
  outerA: WorldPoint,
  outerB: WorldPoint,
  innerB: WorldPoint,
  innerA: WorldPoint,
) {
  vertices.push(
    outerA.x,
    outerA.y,
    0,
    0,
    innerA.x,
    innerA.y,
    0,
    0,
    outerB.x,
    outerB.y,
    0,
    0,
    outerB.x,
    outerB.y,
    0,
    0,
    innerA.x,
    innerA.y,
    0,
    0,
    innerB.x,
    innerB.y,
    0,
    0,
  );
}

function signedArea(vertices: WorldPoint[]) {
  let area = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function isConvex(
  previous: WorldPoint,
  current: WorldPoint,
  next: WorldPoint,
  isClockwise: boolean,
) {
  const cross =
    (current.x - previous.x) * (next.y - current.y) -
    (current.y - previous.y) * (next.x - current.x);
  return isClockwise ? cross < 0 : cross > 0;
}

function isPointInTriangle(
  point: WorldPoint,
  a: WorldPoint,
  b: WorldPoint,
  c: WorldPoint,
) {
  const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) < 0.000001) return false;

  const alpha =
    ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) /
    denominator;
  const beta =
    ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) /
    denominator;
  const gamma = 1 - alpha - beta;

  return alpha >= 0 && beta >= 0 && gamma >= 0;
}
