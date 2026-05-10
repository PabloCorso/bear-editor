import type { Polygon, Position } from "~/editor/elma-types";
import {
  getGrassEdgeIndices,
  rectContainsPointWithMargin,
  rectsIntersect,
  type WorldRect,
  WORLD_CULL_MARGIN,
} from "~/editor/render/world-geometry";

type CachedPolygonDerivedData = {
  bounds: WorldRect;
  grassEdgeIndices: number[];
};

const polygonDerivedDataCache = new WeakMap<
  { vertices: Array<{ x: number; y: number }>; grass?: boolean; isGrass?: boolean },
  CachedPolygonDerivedData
>();

export function getCachedPolygonDerivedData(
  polygon: Polygon | { vertices: Array<{ x: number; y: number }>; grass?: boolean; isGrass?: boolean },
): CachedPolygonDerivedData {
  const cached = polygonDerivedDataCache.get(polygon);
  if (cached) return cached;

  const derived = {
    bounds: getPolygonBounds(polygon.vertices),
    grassEdgeIndices: isGrassPolygon(polygon)
      ? getGrassEdgeIndices(polygon.vertices)
      : [],
  };
  polygonDerivedDataCache.set(polygon, derived);
  return derived;
}

export function getPolygonBounds(vertices: Array<{ x: number; y: number }>): WorldRect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const vertex of vertices) {
    if (vertex.x < minX) minX = vertex.x;
    if (vertex.y < minY) minY = vertex.y;
    if (vertex.x > maxX) maxX = vertex.x;
    if (vertex.y > maxY) maxY = vertex.y;
  }

  return { minX, minY, maxX, maxY };
}

export function isPolygonVisible(
  polygon: Polygon | { vertices: Array<{ x: number; y: number }>; grass?: boolean; isGrass?: boolean },
  viewportRect: WorldRect,
) {
  return rectsIntersect(getCachedPolygonDerivedData(polygon).bounds, viewportRect);
}

export function isPointVisible(position: Position, viewportRect: WorldRect) {
  return rectContainsPointWithMargin(
    viewportRect,
    position.x,
    position.y,
    WORLD_CULL_MARGIN,
  );
}

export function isPictureVisible(
  picture: {
    position: { x: number; y: number };
    name?: string;
    texture?: string;
    mask?: string;
  },
  viewportRect: WorldRect,
  resolvePictureDimensions?: (picture: {
    name?: string;
    texture?: string;
    mask?: string;
  }) => { width: number; height: number } | null,
) {
  const dimensions = resolvePictureDimensions?.({
    name: picture.name || undefined,
    texture: picture.texture || undefined,
    mask: picture.mask || undefined,
  });
  if (!dimensions) return true;

  return rectsIntersect(
    {
      minX: picture.position.x,
      minY: picture.position.y,
      maxX: picture.position.x + dimensions.width,
      maxY: picture.position.y + dimensions.height,
    },
    viewportRect,
  );
}

function isGrassPolygon(
  polygon: Polygon | { vertices: Array<{ x: number; y: number }>; grass?: boolean; isGrass?: boolean },
) {
  return polygon.grass || ("isGrass" in polygon && Boolean(polygon.isGrass));
}
