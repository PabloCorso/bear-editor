import { ELMA_PIXEL_SCALE, OBJECT_DIAMETER } from "./constants";

function hypot(a: number, b: number) {
  return Math.sqrt(a * a + b * b);
}

function worldUnitsFromElmaPixels(pixels: number) {
  return pixels * ELMA_PIXEL_SCALE;
}

function rotatePoint(point: { x: number; y: number }, radians: number) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function transformBikeLocalPoint({
  point,
  bikeR,
  turn,
}: {
  point: { x: number; y: number };
  bikeR: number;
  turn: number;
}) {
  const mirroredX = turn ? -point.x : point.x;
  return rotatePoint({ x: mirroredX, y: point.y }, -bikeR);
}

export const defaultBikeCoords = {
  bikeR: 10000,
  turn: 0,
  leftX: -849.4,
  leftY: -600.6,
  leftR: 0.42,
  rightX: 849,
  rightY: -600,
  rightR: 0.42,
  headX: 0,
  headY: 439,
  voltDirection: null as "right" | "left" | null,
  voltProgress: 0,
};

export type BikeCoords = typeof defaultBikeCoords;

export type KuskiSelectionCircle = {
  x: number;
  y: number;
  radius: number;
};

export type KuskiSelectionTriangle = [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
];

export function getKuskiSelectionCircles({
  start,
  coords = defaultBikeCoords,
}: {
  start: { x: number; y: number };
  coords?: BikeCoords;
}): KuskiSelectionCircle[] {
  const bikeR = (coords.bikeR * Math.PI * 2) / 10000;
  const turn = coords.turn;
  const leftX = coords.leftX / 1000;
  const leftY = coords.leftY / 1000;
  const rightX = coords.rightX / 1000;
  const rightY = coords.rightY / 1000;
  const headX = coords.headX / 1000;
  const headY = coords.headY / 1000;

  const backX = !turn ? rightX : leftX;
  const backY = !turn ? rightY : leftY;
  const frontX = turn ? rightX : leftX;
  const frontY = turn ? rightY : leftY;

  const backCenter = {
    x: start.x - leftX + backX,
    y: start.y + leftY - backY,
  };
  const frontCenter = {
    x: start.x - leftX + frontX,
    y: start.y + leftY - frontY,
  };

  const headRadius = hypot(headX, headY);
  const headAngle =
    Math.atan2(-headY, turn ? -headX : headX) + (turn ? -bikeR : bikeR);
  const wx = headRadius * Math.cos(headAngle);
  const wy = headRadius * Math.sin(headAngle);
  const headCenterInRotatedSpace = {
    x: wx - worldUnitsFromElmaPixels(4),
    y: wy - worldUnitsFromElmaPixels(30.5),
  };
  const headOffset = transformBikeLocalPoint({
    point: headCenterInRotatedSpace,
    bikeR,
    turn,
  });
  const headCenter = {
    x: start.x - leftX + headOffset.x,
    y: start.y + leftY + headOffset.y,
  };

  const wheelRadius = OBJECT_DIAMETER / 2;
  const headBoundsRadius = worldUnitsFromElmaPixels(11.5);
  return [
    { x: backCenter.x, y: backCenter.y, radius: wheelRadius },
    { x: frontCenter.x, y: frontCenter.y, radius: wheelRadius },
    { x: headCenter.x, y: headCenter.y, radius: headBoundsRadius },
  ];
}

export function getKuskiSelectionTriangle({
  start,
  coords = defaultBikeCoords,
}: {
  start: { x: number; y: number };
  coords?: BikeCoords;
}): KuskiSelectionTriangle {
  const circles = getKuskiSelectionCircles({
    start,
    coords,
  });
  const centroid = circles.reduce(
    (acc, circle) => ({
      x: acc.x + circle.x / circles.length,
      y: acc.y + circle.y / circles.length,
    }),
    { x: 0, y: 0 },
  );

  const expandedPoints = circles.map((circle) => {
    const dx = circle.x - centroid.x;
    const dy = circle.y - centroid.y;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      x: circle.x + (dx / distance) * circle.radius,
      y: circle.y + (dy / distance) * circle.radius,
    };
  });

  return [expandedPoints[0], expandedPoints[1], expandedPoints[2]];
}

function triangleSign(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return (point.x - b.x) * (a.y - b.y) - (a.x - b.x) * (point.y - b.y);
}

function isPointInTriangle(
  point: { x: number; y: number },
  triangle: KuskiSelectionTriangle,
) {
  const [a, b, c] = triangle;
  const d1 = triangleSign(point, a, b);
  const d2 = triangleSign(point, b, c);
  const d3 = triangleSign(point, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

export function isPointInKuskiSelectionBounds({
  point,
  start,
  coords = defaultBikeCoords,
}: {
  point: { x: number; y: number };
  start: { x: number; y: number };
  coords?: BikeCoords;
}) {
  const selectionCircles = getKuskiSelectionCircles({ start, coords });
  if (
    selectionCircles.some((circle) => {
      const dx = point.x - circle.x;
      const dy = point.y - circle.y;
      return Math.hypot(dx, dy) <= circle.radius;
    })
  ) {
    return true;
  }

  return isPointInTriangle(point, getKuskiSelectionTriangle({ start, coords }));
}
