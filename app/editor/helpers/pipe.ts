import { ELMA_PIXELS_PER_WORLD_UNIT } from "~/editor/constants";
import { WHEEL_RADIUS } from "~/editor/play-mode/engine/core/constants";
import {
  Gravity,
  type Apple,
  type Polygon,
  type Position,
} from "~/editor/elma-types";

export const DEFAULT_PIPE_WIDTH_PX = 90;
export const MIN_PIPE_WIDTH_PX = 1;
export const MAX_PIPE_WIDTH_PX = 2000;

export const PIPE_APPLE_MODES = ["none", "distance", "count"] as const;
export type PipeAppleMode = (typeof PIPE_APPLE_MODES)[number];
export const DEFAULT_PIPE_APPLE_DISTANCE = 4;
export const PIPE_APPLE_DISTANCE_STEP = 0.25;
export const MAX_PIPE_APPLE_DISTANCE = 100;
export const DEFAULT_PIPE_APPLE_COUNT = 10;
export const MAX_PIPE_APPLE_COUNT = 250;

// World units: the initial bike spans 2.5 units horizontally. The start object
// marks its rear wheel, rather than the center of the bike.
export const PIPE_START_CHAMBER_SIZE = 3.5;
const PIPE_START_CHAMBER_HEIGHT = 3;
const PIPE_FLOWER_APPLE_GAP = 1;

export function getPipeStart(
  points: Position[],
  width: number,
): Position | undefined {
  return createStartChamber(points, width)?.start;
}

export function getPipeFlower(
  points: Position[],
  width: number,
): Position | undefined {
  const length = getPipeLength(points);
  return length > 0
    ? pointAlongPipe(
        points,
        Math.max(0, length - getPipeFlowerInset(length, width)),
      )
    : undefined;
}

// Equal center-to-wall distances give the flower equal padding at the end
// cap and both side walls. Short pipes keep it within the middle of the path.
function getPipeFlowerInset(length: number, width: number): number {
  return Math.min(width / 2, length / 2);
}

function getPipeLength(points: Position[]): number {
  return points
    .slice(1)
    .reduce(
      (length, point, index) =>
        length +
        Math.hypot(point.x - points[index].x, point.y - points[index].y),
      0,
    );
}

function pointAlongPipe(points: Position[], offset: number): Position {
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length <= 1e-8) continue;
    if (offset <= length)
      return {
        x: start.x + ((end.x - start.x) * offset) / length,
        y: start.y + ((end.y - start.y) * offset) / length,
      };
    offset -= length;
  }
  return points[points.length - 1];
}

// Measure along the centerline, carrying spacing through corners. Keep apples
// inside the open ends, starting half a spacing interval from the start.
export function createPipeApples(
  points: Position[],
  mode: PipeAppleMode,
  distance = DEFAULT_PIPE_APPLE_DISTANCE,
  count = DEFAULT_PIPE_APPLE_COUNT,
  endFlower = false,
  width = DEFAULT_PIPE_WIDTH_PX / ELMA_PIXELS_PER_WORLD_UNIT,
): Apple[] {
  if (mode === "none" || points.length < 2) return [];
  const segments = points
    .slice(1)
    .map((end, index) => ({
      start: points[index],
      end,
      length: Math.hypot(end.x - points[index].x, end.y - points[index].y),
    }))
    .filter((segment) => segment.length > 1e-8);
  const totalLength = segments.reduce(
    (sum, segment) => sum + segment.length,
    0,
  );
  const length = endFlower
    ? Math.max(
        0,
        totalLength -
          getPipeFlowerInset(totalLength, width) -
          PIPE_FLOWER_APPLE_GAP,
      )
    : totalLength;
  if (!Number.isFinite(length) || length <= 0) return [];
  const appleCount =
    mode === "count"
      ? Math.min(MAX_PIPE_APPLE_COUNT, Math.max(0, Math.floor(count)))
      : Math.min(
          MAX_PIPE_APPLE_COUNT,
          Math.max(0, Math.ceil(length / distance - 0.5)),
        );
  const spacing = mode === "count" ? length / (appleCount + 0.5) : distance;
  if (!Number.isFinite(appleCount) || !Number.isFinite(spacing) || spacing <= 0)
    return [];

  let segmentIndex = 0;
  let segmentStart = 0;
  return Array.from({ length: appleCount }, (_, index) => {
    const offset = (index + 0.5) * spacing;
    while (
      segmentIndex < segments.length - 1 &&
      offset > segmentStart + segments[segmentIndex].length
    ) {
      segmentStart += segments[segmentIndex++].length;
    }
    const segment = segments[segmentIndex];
    const fraction = (offset - segmentStart) / segment.length;
    return {
      position: {
        x: segment.start.x + (segment.end.x - segment.start.x) * fraction,
        y: segment.start.y + (segment.end.y - segment.start.y) * fraction,
      },
      animation: 1,
      gravity: Gravity.None,
    };
  });
}

// Offset the centerline on both sides and intersect adjacent offset lines to
// make sharp corners. End caps stay perpendicular to the first/last segment.
export function createPipePolygon(
  points: Position[],
  width: number,
  startChamber = false,
): Polygon | null {
  const centers = points.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) >
        1e-8,
  );
  if (centers.length < 2 || !Number.isFinite(width) || width <= 0) return null;

  const normals = centers.slice(1).map((point, index) => {
    const dx = point.x - centers[index].x;
    const dy = point.y - centers[index].y;
    const length = Math.hypot(dx, dy);
    return { x: -dy / length, y: dx / length };
  });
  const sides = [-1, 1].map((side) =>
    centers.flatMap((point, index) => {
      const before = normals[Math.max(0, index - 1)];
      const after = normals[Math.min(index, normals.length - 1)];
      const denominator = 1 + before.x * after.x + before.y * after.y;
      const halfWidth = (side * width) / 2;
      // An exact reversal has no finite miter. Use two square corners instead.
      if (denominator < 1e-8) {
        return [before, after].map((normal) => ({
          x: point.x + normal.x * halfWidth,
          y: point.y + normal.y * halfWidth,
        }));
      }
      return [
        {
          x: point.x + ((before.x + after.x) * halfWidth) / denominator,
          y: point.y + ((before.y + after.y) * halfWidth) / denominator,
        },
      ];
    }),
  );
  const chamber = startChamber ? createStartChamber(centers, width) : undefined;
  if (chamber) {
    sides[0][0] = chamber.entranceA;
    sides[1][0] = chamber.entranceB;
  }
  const vertices = [...sides[0], ...sides[1].reverse()];
  return {
    vertices: chamber ? [...vertices, ...chamber.corners] : vertices,
    grass: false,
  };
}

// Join the pipe walls to an upright chamber. Depending on the first segment's
// angle, its opening occupies the side wall, roof, or floor. All chamber edges
// stay horizontal or vertical; the pipe walls retain their original slope.
function createStartChamber(points: Position[], width: number) {
  const first = points[0];
  if (!first) return undefined;
  const next = points.find(
    (point) => Math.hypot(point.x - first.x, point.y - first.y) > 1e-8,
  );
  if (!next || !Number.isFinite(width) || width <= 0) return undefined;
  const dx = next.x - first.x;
  const dy = next.y - first.y;
  const length = Math.hypot(dx, dy);
  const offset = {
    x: (-dy * width) / (2 * length),
    y: (dx * width) / (2 * length),
  };
  const entranceA = { x: first.x - offset.x, y: first.y - offset.y };
  const entranceB = { x: first.x + offset.x, y: first.y + offset.y };
  const direction = dx < 0 ? -1 : 1;
  // At a vertical entrance, choose the floor side consistently with the
  // neighbouring right-facing angles rather than comparing equal heights.
  const floorIsA = dx < 0 || (dx === 0 && dy > 0);
  const floor = floorIsA ? entranceA : entranceB;
  const ceiling = floorIsA ? entranceB : entranceA;
  const floorY = floor.y;
  const roofY =
    floorY -
    Math.max(PIPE_START_CHAMBER_HEIGHT, floor.y - ceiling.y + WHEEL_RADIUS);
  let floorJoin = floor;
  let ceilingJoin = ceiling;
  let frontX = floor.x;
  let backX = floor.x - direction * PIPE_START_CHAMBER_SIZE;
  const sideCeilingY =
    Math.abs(dx) > 1e-8
      ? ceiling.y + ((floor.x - ceiling.x) * dy) / dx
      : -Infinity;

  if (sideCeilingY >= roofY) {
    // Shallow pipes open through the front wall. Extend the ceiling to that
    // wall instead of leaving a narrow vertical spike beside the opening.
    ceilingJoin = { x: frontX, y: sideCeilingY };
  } else if (dy < 0) {
    // Steep upward pipes open through the roof. Both walls meet the same roof
    // height, and the front wall continues vertically down to the floor.
    floorJoin = {
      x: floor.x + ((roofY - floor.y) * dx) / dy,
      y: roofY,
    };
    ceilingJoin = {
      x: ceiling.x + ((roofY - ceiling.y) * dx) / dy,
      y: roofY,
    };
    frontX = floorJoin.x;
    backX =
      direction > 0
        ? Math.min(backX, ceilingJoin.x)
        : Math.max(backX, ceilingJoin.x);
  } else {
    // Steep downward pipes open through the floor, on either side.
    ceilingJoin = {
      x: ceiling.x + ((floorY - ceiling.y) * dx) / dy,
      y: floorY,
    };
    frontX = ceilingJoin.x;
  }

  const corners = [
    ...(floorJoin.y !== floorY ? [{ x: frontX, y: floorY }] : []),
    { x: backX, y: floorY },
    { x: backX, y: roofY },
    ...(floorJoin.y === floorY ? [{ x: frontX, y: roofY }] : []),
  ];
  // The pipe outline ends at B and closes back to A.
  const orderedCorners = floorIsA ? corners.reverse() : corners;
  const from = floorIsA ? ceilingJoin : floorJoin;
  const to = floorIsA ? floorJoin : ceilingJoin;
  const boundary = [from, ...orderedCorners, to].filter(
    (point, index, all) =>
      index === 0 ||
      Math.hypot(point.x - all[index - 1].x, point.y - all[index - 1].y) > 1e-8,
  );
  return {
    entranceA: floorIsA ? floorJoin : ceilingJoin,
    entranceB: floorIsA ? ceilingJoin : floorJoin,
    corners: boundary.slice(1, -1),
    start: {
      x: (backX + (dy > 0 ? floor.x : frontX)) / 2 - 0.85,
      y: floorY - WHEEL_RADIUS,
    },
  };
}
