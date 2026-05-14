import { ELMA_PIXEL_SCALE, QGRASS_TOP_EXTRA_PX } from "~/editor/constants";

const MIN_ZOOM_EPSILON = 0.0001;
const GRASS_TINY_CANVAS_UNIT_PX = 1;
const GRASS_COLLINEAR_DOT_THRESHOLD = 0.98;
const GRASS_JOIN_OVERLAP = ELMA_PIXEL_SCALE;
export const WORLD_CULL_MARGIN = 2;

export type GrassFillQuad = readonly [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
];

export type WorldRect = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function buildPolygonPath(
  polygons: Array<{
    vertices: Array<{ x: number; y: number }>;
    isGrass?: boolean;
    grass?: boolean;
  }>,
): Path2D {
  const path = new Path2D();

  for (const polygon of polygons) {
    if (polygon.vertices.length < 3 || polygon.isGrass || polygon.grass) {
      continue;
    }

    path.moveTo(polygon.vertices[0]!.x, polygon.vertices[0]!.y);
    for (let i = 1; i < polygon.vertices.length; i += 1) {
      path.lineTo(polygon.vertices[i]!.x, polygon.vertices[i]!.y);
    }
    path.closePath();
  }

  return path;
}

export function buildViewportPathFromCenter(viewport: {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  zoom: number;
}): Path2D {
  const halfWidth = viewport.width / (2 * viewport.zoom);
  const halfHeight = viewport.height / (2 * viewport.zoom);
  const path = new Path2D();

  path.rect(
    viewport.centerX - halfWidth,
    viewport.centerY - halfHeight,
    halfWidth * 2,
    halfHeight * 2,
  );

  return path;
}

export function buildViewportPathFromOffset(viewport: {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
}): Path2D {
  const topLeft = {
    x: -viewport.offsetX / viewport.zoom,
    y: -viewport.offsetY / viewport.zoom,
  };
  const bottomRight = {
    x: topLeft.x + viewport.width / viewport.zoom,
    y: topLeft.y + viewport.height / viewport.zoom,
  };
  const path = new Path2D();

  path.rect(
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y,
  );

  return path;
}

export function buildViewportPathFromRect(rect: WorldRect): Path2D {
  const path = new Path2D();

  path.rect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);

  return path;
}

export function buildGroundPath(viewportPath: Path2D, skyPath: Path2D) {
  const path = new Path2D();
  path.addPath(viewportPath);
  path.addPath(skyPath);
  return path;
}

export function getViewportWorldRectFromCenter(
  viewport: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    zoom: number;
  },
  margin = WORLD_CULL_MARGIN,
): WorldRect {
  const halfWidth = viewport.width / (2 * viewport.zoom);
  const halfHeight = viewport.height / (2 * viewport.zoom);

  return {
    minX: viewport.centerX - halfWidth - margin,
    maxX: viewport.centerX + halfWidth + margin,
    minY: viewport.centerY - halfHeight - margin,
    maxY: viewport.centerY + halfHeight + margin,
  };
}

export function getViewportWorldRectFromOffset(viewport: {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  zoom: number;
}): WorldRect {
  const minX = -viewport.offsetX / viewport.zoom;
  const minY = -viewport.offsetY / viewport.zoom;

  return {
    minX,
    minY,
    maxX: minX + viewport.width / viewport.zoom,
    maxY: minY + viewport.height / viewport.zoom,
  };
}

export function getGrassEdgeIndices(vertices: Array<{ x: number; y: number }>) {
  const vertexCount = vertices.length;
  if (vertexCount < 2) return [];

  let longestEdgeIndex = -1;
  let longestEdgeLength = -1;
  for (let i = 0; i < vertexCount; i += 1) {
    const from = vertices[i]!;
    const to = vertices[(i + 1) % vertexCount]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > longestEdgeLength) {
      longestEdgeLength = length;
      longestEdgeIndex = i;
    }
  }

  return [...Array(vertexCount).keys()].filter(
    (index) => index !== longestEdgeIndex,
  );
}

export function getGrassFillQuads({
  vertices,
  zoom,
  depth,
}: {
  vertices: Array<{ x: number; y: number }>;
  zoom: number;
  depth: number;
}): GrassFillQuad[] {
  const tinyCanvasUnit =
    GRASS_TINY_CANVAS_UNIT_PX / Math.max(zoom, MIN_ZOOM_EPSILON);
  const topExtra = QGRASS_TOP_EXTRA_PX * ELMA_PIXEL_SCALE;
  const fillDepth = depth + topExtra;
  const grassEdgeIndices = getGrassEdgeIndices(vertices);
  const grassEdgesSet = new Set(grassEdgeIndices);
  const vertexCount = vertices.length;
  const quads: GrassFillQuad[] = [];

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

export function rectContainsPointWithMargin(
  rect: WorldRect,
  x: number,
  y: number,
  margin: number,
) {
  return (
    x >= rect.minX - margin &&
    x <= rect.maxX + margin &&
    y >= rect.minY - margin &&
    y <= rect.maxY + margin
  );
}

export function rectsIntersect(a: WorldRect, b: WorldRect) {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  );
}
