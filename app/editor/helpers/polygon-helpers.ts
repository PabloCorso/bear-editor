import type { Polygon, Position } from "../elma-types";
import { buildPolygonPath } from "../render/world-geometry";

let cachedGroundRegionPath: Path2D | null = null;
let cachedGroundRegionPathPolygons: Polygon[] | null = null;
let groundRegionPathContext: CanvasRenderingContext2D | null | undefined;

export function isPolygonClockwise(vertices: Position[]): boolean {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % vertices.length];
    sum += (next.x - current.x) * (next.y + current.y);
  }
  return sum > 0;
}

// Helper function to determine if a polygon should be ground based on winding rule
export function shouldPolygonBeGround(
  polygon: Polygon,
  allPolygons: Polygon[],
): boolean {
  const samplePoints: Position[] = computePolygonSamples(polygon);

  // Majority vote from all sample points
  let groundVotes = 0;
  let skyVotes = 0;

  for (const point of samplePoints) {
    let containmentCount = 0;

    for (const otherPolygon of allPolygons) {
      // Skip the current polygon and grass polygons (grass is decorative only)
      if (otherPolygon === polygon || otherPolygon.grass) continue;
      if (isPointInPolygon(point, otherPolygon.vertices)) {
        containmentCount++;
      }
    }

    // If contained by odd number of polygons, it should be sky (not ground)
    if (containmentCount % 2 === 0) {
      groundVotes++;
    } else {
      skyVotes++;
    }
  }

  // Return the majority vote
  return groundVotes >= skyVotes;
}

export function correctPolygonWinding(
  polygon: Polygon,
  allPolygons: Polygon[],
) {
  // Calculate winding and ground/sky determination
  const isClockwise = isPolygonClockwise(polygon.vertices);
  const shouldBeGround = shouldPolygonBeGround(polygon, allPolygons);

  // Canvas API fills based on winding direction using "non-zero winding rule":
  // - CW polygons add to the fill count
  // - CCW polygons subtract from the fill count
  // For correct rendering: ground polygons need CW, sky polygons need CCW
  // So we reverse vertices when shouldBeGround doesn't match isClockwise
  const vertices =
    shouldBeGround !== isClockwise
      ? [...polygon.vertices].reverse()
      : [...polygon.vertices];
  return { ...polygon, vertices };
}

export function correctPolygonPrecision(polygon: Polygon) {
  const vertices = polygon.vertices.map((pos) => correctVertexPrecision(pos));
  return { ...polygon, vertices };
}

export function isWorldPointInGroundRegion(
  point: Position,
  polygons: Polygon[],
): boolean {
  if (polygons.length === 0) return true;
  if (typeof Path2D !== "undefined") {
    const groundPath = getCachedGroundRegionPath(polygons);
    const context = getGroundRegionHitTestContext();
    if (context) {
      const isPointInPath = (
        context as unknown as {
          isPointInPath: (
            path: Path2D,
            x: number,
            y: number,
            fillRule?: CanvasFillRule,
          ) => boolean;
        }
      ).isPointInPath;
      if (typeof isPointInPath === "function") {
        return !isPointInPath.call(
          context,
          groundPath,
          point.x,
          point.y,
          "evenodd",
        );
      }
    }
  }

  let containmentCount = 0;
  for (const polygon of polygons) {
    if (polygon.grass) continue;
    if (isPointInPolygon(point, polygon.vertices)) {
      containmentCount += 1;
    }
  }

  // Even parity => ground; odd parity => sky.
  return containmentCount % 2 === 0;
}

function getGroundRegionHitTestContext() {
  if (groundRegionPathContext !== undefined) {
    return groundRegionPathContext;
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      groundRegionPathContext = context;
      return context;
    }
  }

  const offscreenCanvas = (
    globalThis as {
      OffscreenCanvas?: {
        new (
          width: number,
          height: number,
        ): { getContext: (type: string) => any };
      };
    }
  ).OffscreenCanvas;
  if (offscreenCanvas) {
    const canvas = new offscreenCanvas(1, 1);
    const context = canvas.getContext("2d") as CanvasRenderingContext2D | null;
    if (context) {
      groundRegionPathContext = context;
      return context;
    }
  }

  groundRegionPathContext = null;
  return null;
}

function getCachedGroundRegionPath(polygons: Polygon[]): Path2D {
  if (cachedGroundRegionPathPolygons === polygons && cachedGroundRegionPath) {
    return cachedGroundRegionPath;
  }

  const groundPath = buildPolygonPath(polygons);
  cachedGroundRegionPath = groundPath;
  cachedGroundRegionPathPolygons = polygons;
  return groundPath;
}

// Ensure coordinates are floating point (not integers)
export function correctVertexPrecision(pos: Position) {
  return {
    x: Number.isInteger(pos.x) ? parseFloat(pos.x.toFixed(1)) : pos.x,
    y: Number.isInteger(pos.y) ? parseFloat(pos.y.toFixed(1)) : pos.y,
  };
}

// Use a small set of strategic sample points for accuracy while maintaining performance
// Center + one point per edge (midpoint) provides good coverage without excessive checks
function computePolygonSamples(polygon: Polygon) {
  const center = getPolygonCenter(polygon.vertices);
  const samplePoints: Position[] = [center];

  // Add midpoint of each edge for better accuracy
  for (let i = 0; i < polygon.vertices.length; i++) {
    const current = polygon.vertices[i];
    const next = polygon.vertices[(i + 1) % polygon.vertices.length];
    samplePoints.push({
      x: (current.x + next.x) / 2,
      y: (current.y + next.y) / 2,
    });
  }
  return samplePoints;
}

// Helper function to get the center of a polygon
function getPolygonCenter(vertices: Position[]): Position {
  const sumX = vertices.reduce((sum, v) => sum + v.x, 0);
  const sumY = vertices.reduce((sum, v) => sum + v.y, 0);
  return {
    x: sumX / vertices.length,
    y: sumY / vertices.length,
  };
}

// Helper function to check if a point is inside a polygon with improved precision
function isPointInPolygon(point: Position, vertices: Position[]): boolean {
  if (vertices.length < 3) return false;

  let inside = false;
  const epsilon = 1e-10; // Small epsilon for floating-point comparisons

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;

    // Handle horizontal edges (avoid division by zero)
    if (Math.abs(yj - yi) < epsilon) {
      // Horizontal edge - check if point is on the edge
      if (Math.abs(point.y - yi) < epsilon) {
        const minX = Math.min(xi, xj);
        const maxX = Math.max(xi, xj);
        if (point.x >= minX - epsilon && point.x <= maxX + epsilon) {
          return true; // Point is on the edge, consider it inside
        }
      }
      continue; // Skip horizontal edges for ray casting
    }

    // Check if the ray intersects this edge
    if (yi > point.y !== yj > point.y) {
      // Calculate intersection x-coordinate
      const intersectX = ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

      // Use epsilon for floating-point comparison
      if (point.x < intersectX - epsilon) {
        inside = !inside;
      } else if (Math.abs(point.x - intersectX) < epsilon) {
        // Point is exactly on the edge
        return true;
      }
    }
  }

  return inside;
}

// Debug function to help identify polygon orientation issues
export function debugPolygonOrientation(
  polygon: Polygon,
  allPolygons: Polygon[],
): {
  isClockwise: boolean;
  shouldBeGround: boolean;
  samplePoints: Position[];
  containmentResults: Array<{
    point: Position;
    containmentCount: number;
    isGround: boolean;
  }>;
} {
  const isClockwise = isPolygonClockwise(polygon.vertices);
  const samplePoints = computePolygonSamples(polygon);
  const containmentResults = [];

  for (const point of samplePoints) {
    let containmentCount = 0;

    for (const otherPolygon of allPolygons) {
      // Skip the current polygon and grass polygons (grass is decorative only)
      if (otherPolygon === polygon || otherPolygon.grass) continue;
      if (isPointInPolygon(point, otherPolygon.vertices)) {
        containmentCount++;
      }
    }

    const isGround = containmentCount % 2 === 0;
    containmentResults.push({ point, containmentCount, isGround });
  }

  const groundVotes = containmentResults.filter((r) => r.isGround).length;
  const skyVotes = containmentResults.filter((r) => !r.isGround).length;
  const shouldBeGround = groundVotes >= skyVotes;

  return {
    isClockwise,
    shouldBeGround,
    samplePoints,
    containmentResults,
  };
}
