import type { Polygon, Position } from "../elma-types";
import { selectionThresholds } from "../constants";
import {
  isWithinThreshold,
  getClosestPointOnLineSegment,
} from "./coordinate-helpers";
import { getCachedPolygonDerivedData } from "../render/world-derived-data-cache";
import { rectsIntersect, type WorldRect } from "../render/world-geometry";

export type SelectedVertex = {
  polygon: Polygon;
  vertex: Position;
};

export function findVertexNearPosition(
  pos: Position,
  polygons: Polygon[],
  threshold: number = selectionThresholds.vertex,
): { polygon: Polygon; vertex: Position } | null {
  const candidatePolygons = getCandidatePolygons(polygons, pos, threshold);
  for (const polygon of candidatePolygons) {
    for (const vertex of polygon.vertices) {
      if (isWithinThreshold(pos, vertex, threshold)) {
        return { polygon, vertex };
      }
    }
  }
  return null;
}

export function findObjectNearPosition(
  position: Position,
  objects: Position[],
  threshold: number = selectionThresholds.object,
): Position | null {
  for (const object of objects) {
    if (isWithinThreshold(position, object, threshold)) {
      return object;
    }
  }
  return null;
}

export function isVertexSelected(
  vertex: { polygon: Polygon; vertex: Position },
  selectedVertices: SelectedVertex[],
): boolean {
  return selectedVertices.some(
    (sv) => sv.polygon === vertex.polygon && sv.vertex === vertex.vertex,
  );
}

export function isObjectSelected(
  object: Position,
  selectedObjects: Position[],
): boolean {
  return selectedObjects.includes(object);
}

export function getAllObjects(
  apples: Position[],
  killers: Position[],
  flowers: Position[],
  start: Position,
): Array<{ obj: Position; type: string }> {
  return [
    ...apples.map((apple) => ({ obj: apple, type: "apple" })),
    ...killers.map((killer) => ({ obj: killer, type: "killer" })),
    ...flowers.map((flower) => ({ obj: flower, type: "flower" })),
    { obj: start, type: "start" },
  ];
}

export function isPointInRect(
  point: Position,
  rect: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  return (
    point.x >= rect.minX &&
    point.x <= rect.maxX &&
    point.y >= rect.minY &&
    point.y <= rect.maxY
  );
}

export function getSelectionBounds(
  startPos: Position,
  endPos: Position,
): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(startPos.x, endPos.x),
    maxX: Math.max(startPos.x, endPos.x),
    minY: Math.min(startPos.y, endPos.y),
    maxY: Math.max(startPos.y, endPos.y),
  };
}

export function findPolygonEdgeNearPosition(
  pos: Position,
  polygons: Polygon[],
  threshold: number = selectionThresholds.polygonEdge,
  shouldConsiderEdge: (polygon: Polygon, edgeIndex: number) => boolean = () =>
    true,
): Polygon | null {
  const candidatePolygons = getCandidatePolygons(polygons, pos, threshold);
  for (const polygon of candidatePolygons) {
    if (polygon.vertices.length < 3) continue;

    // Check each edge of the polygon
    for (let i = 0; i < polygon.vertices.length; i++) {
      if (!shouldConsiderEdge(polygon, i)) continue;
      const start = polygon.vertices[i];
      const end = polygon.vertices[(i + 1) % polygon.vertices.length];

      // Calculate distance from point to line segment
      const distance = distanceToLineSegment(pos, start, end);

      if (distance <= threshold) {
        return polygon;
      }
    }
  }

  return null;
}

function distanceToLineSegment(
  point: Position,
  lineStart: Position,
  lineEnd: Position,
): number {
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;

  if (lenSq === 0) {
    // Line segment is actually a point
    return Math.sqrt(A * A + B * B);
  }

  const param = dot / lenSq;

  let xx, yy;
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

export function findPolygonVertexForEditing(
  pos: Position,
  polygons: Polygon[],
  threshold: number = selectionThresholds.vertex,
  zoom: number,
): { polygon: Polygon; vertexIndex: number; vertex: Position } | null {
  const adjustedThreshold = threshold / zoom;
  const candidatePolygons = getCandidatePolygons(
    polygons,
    pos,
    adjustedThreshold,
  );
  for (const polygon of candidatePolygons) {
    for (let i = 0; i < polygon.vertices.length; i++) {
      const vertex = polygon.vertices[i];
      if (isWithinThreshold(pos, vertex, adjustedThreshold)) {
        return { polygon, vertexIndex: i, vertex };
      }
    }
  }
  return null;
}

export function findPolygonLineForEditing(
  pos: Position,
  polygons: Polygon[],
  threshold: number = selectionThresholds.polygonEdge,
  zoom: number,
): {
  polygon: Polygon;
  pivotVertexIndex: number;
  side: "next" | "previous";
} | null {
  const adjustedThreshold = threshold / zoom;

  const candidatePolygons = getCandidatePolygons(
    polygons,
    pos,
    adjustedThreshold,
  );
  for (const polygon of candidatePolygons) {
    if (polygon.vertices.length < 3) continue;

    // Check each edge of the polygon
    for (let i = 0; i < polygon.vertices.length; i++) {
      const start = polygon.vertices[i];
      const end = polygon.vertices[(i + 1) % polygon.vertices.length];

      // Calculate distance from point to line segment
      const distance = distanceToLineSegment(pos, start, end);

      if (distance <= adjustedThreshold) {
        const closestPoint = getClosestPointOnLineSegment(pos, start, end);
        const distanceToStart = Math.hypot(
          closestPoint.x - start.x,
          closestPoint.y - start.y,
        );
        const distanceToEnd = Math.hypot(
          closestPoint.x - end.x,
          closestPoint.y - end.y,
        );
        const startVertexIndex = i;
        const endVertexIndex = (i + 1) % polygon.vertices.length;
        const isStartCloser = distanceToStart <= distanceToEnd;

        return {
          polygon,
          pivotVertexIndex: isStartCloser ? startVertexIndex : endVertexIndex,
          side: isStartCloser ? "previous" : "next",
        };
      }
    }
  }

  return null;
}

function getCandidatePolygons(
  polygons: Polygon[],
  pos: Position,
  threshold: number,
) {
  const searchRect = getSearchRect(pos, threshold);
  return polygons.filter((polygon) =>
    rectsIntersect(getCachedPolygonDerivedData(polygon).bounds, searchRect),
  );
}

function getSearchRect(pos: Position, threshold: number): WorldRect {
  return {
    minX: pos.x - threshold,
    minY: pos.y - threshold,
    maxX: pos.x + threshold,
    maxY: pos.y + threshold,
  };
}
