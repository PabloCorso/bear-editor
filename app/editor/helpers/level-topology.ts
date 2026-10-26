import type { EditorLevel, Polygon, Position } from "../elma-types";
import { calculateBoundingBox } from "./level-helpers";

export const VERTEX_OVERLAP_EPSILON = 0.0000002;
const MAX_LEVEL_DIMENSION = 188;
const POSITION_EPSILON = 1e-10;

export type TopologyIssueType =
  | "duplicate-vertex"
  | "nearby-vertex"
  | "crossing-polygons"
  | "self-intersection"
  | "missing-polygon"
  | "missing-flower"
  | "bounds";

export type TopologyIssue = {
  type: TopologyIssueType;
  message: string;
  vertices: Position[];
};

export type TopologyCheckResult = {
  issues: TopologyIssue[];
  width: number;
  height: number;
};

type EdgeRef = {
  polygon: Polygon;
  polygonIndex: number;
  start: Position;
  startIndex: number;
  end: Position;
  endIndex: number;
};

type AggregatedIntersection = {
  type: "crossing-polygons" | "self-intersection";
  message: string;
  vertices: Position[];
  contacts: string[];
};

export function validateLevelTopology(
  level: Pick<EditorLevel, "polygons"> & { flowers?: EditorLevel["flowers"] },
): TopologyCheckResult {
  const issues: TopologyIssue[] = [];
  const intersections = new Map<string, AggregatedIntersection>();

  if (level.polygons.length === 0) {
    issues.push({
      type: "missing-polygon",
      message: "Level must contain at least one polygon.",
      vertices: [],
    });
  }

  const vertices = level.polygons.flatMap((polygon, polygonIndex) =>
    // Decorative grass may overlap itself or solid geometry, just as it may
    // cross edges. Only solid vertices participate in proximity checks.
    polygon.grass
      ? []
      : polygon.vertices.map((vertex, vertexIndex) => ({
          polygon,
          polygonIndex,
          vertex,
          vertexIndex,
        })),
  );

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const first = vertices[i];
      const second = vertices[j];
      const dx = Math.abs(first.vertex.x - second.vertex.x);
      const dy = Math.abs(first.vertex.y - second.vertex.y);

      if (dx < POSITION_EPSILON && dy < POSITION_EPSILON) {
        issues.push({
          type: "duplicate-vertex",
          message: "Two vertices overlap.",
          vertices: [first.vertex, second.vertex],
        });
        continue;
      }

      if (dx < VERTEX_OVERLAP_EPSILON && dy < VERTEX_OVERLAP_EPSILON) {
        issues.push({
          type: "nearby-vertex",
          message: "Two vertices are too close together.",
          vertices: [first.vertex, second.vertex],
        });
      }
    }
  }

  const edges = level.polygons.flatMap((polygon, polygonIndex) =>
    polygon.grass
      ? []
      : polygon.vertices.map((start, startIndex) => {
          const endIndex = (startIndex + 1) % polygon.vertices.length;
          return {
            polygon,
            polygonIndex,
            start,
            startIndex,
            end: polygon.vertices[endIndex],
            endIndex,
          };
        }),
  );

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const first = edges[i];
      const second = edges[j];

      if (sharesAdjacentVertex(first, second)) {
        continue;
      }

      if (
        !segmentsIntersect(first.start, first.end, second.start, second.end)
      ) {
        continue;
      }

      addIntersection(intersections, first, second);
    }
  }

  issues.push(
    ...Array.from(intersections.values()).map(
      ({ type, message, vertices }): TopologyIssue => ({
        type,
        message,
        vertices,
      }),
    ),
  );

  if ((level.flowers ?? []).length === 0) {
    issues.push({
      type: "missing-flower",
      message: "Level must contain at least one flower.",
      vertices: [],
    });
  }

  const { minX, minY, maxX, maxY } = calculateBoundingBox({
    polygons: level.polygons,
  });
  const width =
    Number.isFinite(minX) && Number.isFinite(maxX) ? maxX - minX : 0;
  const height =
    Number.isFinite(minY) && Number.isFinite(maxY) ? maxY - minY : 0;

  if (width > MAX_LEVEL_DIMENSION || height > MAX_LEVEL_DIMENSION) {
    if (width > MAX_LEVEL_DIMENSION) {
      issues.push({
        type: "bounds",
        message: `Level width exceeds ${MAX_LEVEL_DIMENSION}.`,
        vertices: [],
      });
    }

    if (height > MAX_LEVEL_DIMENSION) {
      issues.push({
        type: "bounds",
        message: `Level height exceeds ${MAX_LEVEL_DIMENSION}.`,
        vertices: [],
      });
    }
  }

  return { issues, width, height };
}

export function getTopologySelection(
  polygons: Polygon[],
  issues: TopologyIssue[],
): Array<{ polygon: Polygon; vertex: Position }> {
  const selectedVertices: Array<{ polygon: Polygon; vertex: Position }> = [];
  const seen = new Set<Position>();

  polygons.forEach((polygon) => {
    polygon.vertices.forEach((vertex) => {
      if (!issues.some((issue) => issue.vertices.includes(vertex))) return;
      if (seen.has(vertex)) return;
      seen.add(vertex);
      selectedVertices.push({ polygon, vertex });
    });
  });

  return selectedVertices;
}

export function formatTopologyCheckResult(result: TopologyCheckResult): string {
  if (result.issues.length === 0) {
    return `Topology check passed.\nBounds: ${formatNumber(result.width)} x ${formatNumber(result.height)}.`;
  }

  return [
    `Topology check found ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"}.`,
    `Bounds: ${formatNumber(result.width)} x ${formatNumber(result.height)}.`,
    "",
    ...result.issues.map((issue, index) => `${index + 1}. ${issue.message}`),
  ].join("\n");
}

function sharesAdjacentVertex(first: EdgeRef, second: EdgeRef) {
  const samePolygon = first.polygon === second.polygon;
  if (!samePolygon) {
    return sharesEndpointOnly(first, second);
  }

  const firstCount = first.polygon.vertices.length;
  const indexDistance = Math.abs(first.startIndex - second.startIndex);
  return (
    indexDistance <= 1 ||
    indexDistance === firstCount - 1 ||
    sharesEndpointOnly(first, second)
  );
}

function addIntersection(
  intersections: Map<string, AggregatedIntersection>,
  first: EdgeRef,
  second: EdgeRef,
) {
  const isSelfIntersection = first.polygon === second.polygon;
  const key = isSelfIntersection
    ? `self:${first.polygonIndex}`
    : `cross:${Math.min(first.polygonIndex, second.polygonIndex)}:${Math.max(first.polygonIndex, second.polygonIndex)}`;
  const existing = intersections.get(key);
  const vertices = mergeVertices(existing?.vertices ?? [], [
    first.start,
    first.end,
    second.start,
    second.end,
  ]);
  const contacts = mergeContacts(existing?.contacts ?? [], [
    getIntersectionKey(first, second),
  ]);

  intersections.set(key, {
    type: isSelfIntersection ? "self-intersection" : "crossing-polygons",
    message: formatIntersectionMessage(
      first.polygonIndex,
      second.polygonIndex,
      contacts.length,
      isSelfIntersection,
    ),
    vertices,
    contacts,
  });
}

function mergeVertices(existing: Position[], incoming: Position[]) {
  const merged = [...existing];
  incoming.forEach((vertex) => {
    if (merged.includes(vertex)) return;
    merged.push(vertex);
  });
  return merged;
}

function mergeContacts(existing: string[], incoming: string[]) {
  const merged = [...existing];
  incoming.forEach((contact) => {
    if (merged.includes(contact)) return;
    merged.push(contact);
  });
  return merged;
}

function formatIntersectionMessage(
  _firstPolygonIndex: number,
  _secondPolygonIndex: number,
  contactCount: number,
  isSelfIntersection: boolean,
) {
  const contactLabel = `${contactCount} contact point${contactCount === 1 ? "" : "s"}`;

  if (isSelfIntersection) {
    return `A shape intersects itself at ${contactLabel}.`;
  }

  return `Shapes cross at ${contactLabel}.`;
}

function sharesEndpointOnly(first: EdgeRef, second: EdgeRef) {
  return (
    isSamePoint(first.start, second.start) ||
    isSamePoint(first.start, second.end) ||
    isSamePoint(first.end, second.start) ||
    isSamePoint(first.end, second.end)
  );
}

function segmentsIntersect(
  p1: Position,
  q1: Position,
  p2: Position,
  q2: Position,
) {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

function getIntersectionKey(first: EdgeRef, second: EdgeRef) {
  const intersection = getSegmentIntersectionPoint(
    first.start,
    first.end,
    second.start,
    second.end,
  );
  return `${formatNumber(intersection.x)}:${formatNumber(intersection.y)}`;
}

function getSegmentIntersectionPoint(
  p1: Position,
  q1: Position,
  p2: Position,
  q2: Position,
) {
  const denominator =
    (p1.x - q1.x) * (p2.y - q2.y) - (p1.y - q1.y) * (p2.x - q2.x);

  if (Math.abs(denominator) >= POSITION_EPSILON) {
    const determinant1 = p1.x * q1.y - p1.y * q1.x;
    const determinant2 = p2.x * q2.y - p2.y * q2.x;
    return {
      x:
        (determinant1 * (p2.x - q2.x) - (p1.x - q1.x) * determinant2) /
        denominator,
      y:
        (determinant1 * (p2.y - q2.y) - (p1.y - q1.y) * determinant2) /
        denominator,
    };
  }

  const sharedEndpoints = [p1, q1, p2, q2].filter(
    (point, index, points) =>
      points.findIndex((candidate) => isSamePoint(candidate, point)) === index,
  );
  const touchingPoint = sharedEndpoints.find(
    (point) => onSegment(p1, point, q1) && onSegment(p2, point, q2),
  );
  if (touchingPoint) {
    return touchingPoint;
  }

  const overlapMinX = Math.max(Math.min(p1.x, q1.x), Math.min(p2.x, q2.x));
  const overlapMaxX = Math.min(Math.max(p1.x, q1.x), Math.max(p2.x, q2.x));
  const overlapMinY = Math.max(Math.min(p1.y, q1.y), Math.min(p2.y, q2.y));
  const overlapMaxY = Math.min(Math.max(p1.y, q1.y), Math.max(p2.y, q2.y));

  return {
    x: (overlapMinX + overlapMaxX) / 2,
    y: (overlapMinY + overlapMaxY) / 2,
  };
}

function orientation(a: Position, b: Position, c: Position) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < POSITION_EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: Position, b: Position, c: Position) {
  return (
    b.x <= Math.max(a.x, c.x) + POSITION_EPSILON &&
    b.x >= Math.min(a.x, c.x) - POSITION_EPSILON &&
    b.y <= Math.max(a.y, c.y) + POSITION_EPSILON &&
    b.y >= Math.min(a.y, c.y) - POSITION_EPSILON
  );
}

function isSamePoint(a: Position, b: Position) {
  return (
    Math.abs(a.x - b.x) < POSITION_EPSILON &&
    Math.abs(a.y - b.y) < POSITION_EPSILON
  );
}

function formatNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}
