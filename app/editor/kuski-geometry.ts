import { ELMA_PIXEL_SCALE, OBJECT_DIAMETER } from "./constants";
import {
  translateMatrix,
  rotateMatrix,
  scaleMatrix,
  type AffineMatrix,
} from "./render/affine-math";
import { buildWebGLBikePose } from "./render/webgl-bike-pose";

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
  turnProgress: 1,
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

export function isPointInKuskiSelectionArea({
  point,
  start,
  coords = defaultBikeCoords,
  useImageHitArea = false,
}: {
  point: { x: number; y: number };
  start: { x: number; y: number };
  coords?: BikeCoords;
  useImageHitArea?: boolean;
}): boolean {
  if (useImageHitArea) {
    return isPointInKuskiImageArea({
      point,
      start,
      coords,
    });
  }

  return isPointInKuskiSelectionBounds({ point, start, coords });
}

function isPointInKuskiImageArea({
  point,
  start,
  coords = defaultBikeCoords,
}: {
  point: { x: number; y: number };
  start: { x: number; y: number };
  coords?: BikeCoords;
}) {
  const pose = buildWebGLBikePose({ start, coords });
  if (
    isPointInTransformedSprite(
      point,
      pose.backWheelMatrix,
      isPointInUnitCircle,
    ) ||
    isPointInTransformedSprite(
      point,
      pose.frontWheelMatrix,
      isPointInUnitCircle,
    ) ||
    isPointInTransformedSprite(point, pose.bodyMatrix, isPointInBodyMask) ||
    isPointInTransformedSprite(point, pose.headMatrix, isPointInHeadMask)
  ) {
    return true;
  }

  if (
    isPointInSkewedSprite(point, {
      matrix: pose.suspensionMatrix,
      bx: 2,
      by: 0.5,
      br: 5,
      ih: 6,
      x1: pose.frontSuspensionTarget.x,
      y1: pose.frontSuspensionTarget.y,
      x2: -21.5,
      y2: -17,
    }) ||
    isPointInSkewedSprite(point, {
      matrix: pose.suspensionMatrix,
      bx: 0,
      by: 0.5,
      br: 5,
      ih: 6,
      x1: 9,
      y1: 20,
      x2: pose.rearSuspensionTarget.x,
      y2: pose.rearSuspensionTarget.y,
    })
  ) {
    return true;
  }

  if (
    isPointInTransformedSprite(
      point,
      scaleMatrix(
        rotateMatrix(
          translateMatrix(
            pose.bikeMatrix,
            worldUnitsFromElmaPixels(-43),
            worldUnitsFromElmaPixels(-12),
          ),
          -Math.PI * 0.197,
        ),
        worldUnitsFromElmaPixels(0.215815 * 380),
        worldUnitsFromElmaPixels(0.215815 * 301),
      ),
      isPointInBikeMask,
    )
  ) {
    return true;
  }

  const legStart = {
    x: worldUnitsFromElmaPixels(19.5),
    y: 0,
  };
  const handTarget = getVoltAdjustedHandPosition({ coords, pose });
  if (
    isPointInKuskiLimb(point, {
      matrix: pose.kuskiMatrix,
      firstLength: worldUnitsFromElmaPixels(26.25),
      firstBx: 0,
      firstBy: 0.6,
      firstBr: worldUnitsFromElmaPixels(6),
      firstIh: worldUnitsFromElmaPixels(39.4) / 3,
      secondLength: 1 - worldUnitsFromElmaPixels(26.25),
      secondBx: worldUnitsFromElmaPixels(5) / 3,
      secondBy: 0.45,
      secondBr: worldUnitsFromElmaPixels(4),
      secondIh: worldUnitsFromElmaPixels(60) / 3,
      x1: legStart.x,
      y1: legStart.y,
      x2: pose.pedalTarget.x,
      y2: pose.pedalTarget.y,
      clockwiseInner: false,
    }) ||
    isPointInKuskiLimb(point, {
      matrix: pose.kuskiMatrix,
      firstLength: 0.3234,
      firstBx: worldUnitsFromElmaPixels(12.2) / 3,
      firstBy: 0.5,
      firstBr: worldUnitsFromElmaPixels(13) / 3,
      firstIh: worldUnitsFromElmaPixels(-32) / 3,
      secondLength: 0.3444,
      secondBx: worldUnitsFromElmaPixels(3),
      secondBy: 0.5,
      secondBr: worldUnitsFromElmaPixels(13.2) / 3,
      secondIh: worldUnitsFromElmaPixels(22.8) / 3,
      x1: pose.shoulder.x,
      y1: pose.shoulder.y,
      x2: handTarget.x,
      y2: handTarget.y,
      clockwiseInner: true,
    })
  ) {
    return true;
  }

  return false;
}

const bikeMaskPolygon = [
  { x: 0.02, y: 0.2 },
  { x: 0.14, y: 0.11 },
  { x: 0.28, y: 0.05 },
  { x: 0.38, y: 0.31 },
  { x: 0.51, y: 0.44 },
  { x: 0.66, y: 0.47 },
  { x: 0.73, y: 0.61 },
  { x: 0.99, y: 0.75 },
  { x: 0.94, y: 0.88 },
  { x: 0.72, y: 0.81 },
  { x: 0.56, y: 0.73 },
  { x: 0.35, y: 0.94 },
  { x: 0.27, y: 0.78 },
  { x: 0.13, y: 0.78 },
  { x: 0.04, y: 0.66 },
  { x: 0.01, y: 0.43 },
];

function isPointInUnitCircle(point: { x: number; y: number }) {
  return Math.hypot(point.x - 0.5, point.y - 0.5) <= 0.5;
}

function isPointInBodyMask(point: { x: number; y: number }) {
  const dx = (point.x - 0.5) / 0.5;
  const dy = (point.y - 0.5) / 0.42;
  return dx * dx + dy * dy <= 1;
}

function isPointInHeadMask(point: { x: number; y: number }) {
  const helmetDx = (point.x - 0.52) / 0.47;
  const helmetDy = (point.y - 0.46) / 0.46;
  const inHelmet = helmetDx * helmetDx + helmetDy * helmetDy <= 1;
  const inNeck = point.x >= 0.45 && point.x <= 0.84 && point.y >= 0.72;
  return inHelmet || inNeck;
}

function isPointInBikeMask(point: { x: number; y: number }) {
  return isPointInPolygon(point, bikeMaskPolygon);
}

function getVoltAdjustedHandPosition({
  coords,
  pose,
}: {
  coords: BikeCoords;
  pose: ReturnType<typeof buildWebGLBikePose>;
}) {
  const voltProgress = coords.voltProgress ?? 0;
  const voltDirection = coords.voltDirection;
  if (!voltProgress || !voltDirection) {
    return {
      x: pose.handlebarTarget.x,
      y: pose.handlebarTarget.y,
    };
  }

  const sameDirection = (voltDirection === "right" ? 1 : 0) === coords.turn;
  const animx = pose.shoulder.x;
  const animy = pose.shoulder.y;
  let dangle: number;
  let ascale: number;
  let easedProgress = voltProgress;

  if (sameDirection) {
    if (easedProgress >= 0.25) {
      easedProgress = 0.25 - (0.25 * (easedProgress - 0.25)) / 0.75;
    }
    dangle = 10.8 * easedProgress;
    ascale = 1 - 1.2 * easedProgress;
  } else {
    if (easedProgress >= 0.2) {
      easedProgress = 0.2 - (0.2 * (easedProgress - 0.2)) / 0.8;
    }
    dangle = -8 * easedProgress;
    ascale = 1 + 0.75 * easedProgress;
  }

  const at =
    Math.atan2(pose.handlebarTarget.y - animy, pose.handlebarTarget.x - animx) +
    dangle;
  const dist =
    ascale *
    Math.hypot(pose.handlebarTarget.y - animy, pose.handlebarTarget.x - animx);

  return {
    x: animx + dist * Math.cos(at),
    y: animy + dist * Math.sin(at),
  };
}

function isPointInKuskiLimb(
  point: { x: number; y: number },
  {
    matrix,
    firstLength,
    firstBx,
    firstBy,
    firstBr,
    firstIh,
    secondLength,
    secondBx,
    secondBy,
    secondBr,
    secondIh,
    x1,
    y1,
    x2,
    y2,
    clockwiseInner,
  }: {
    matrix: AffineMatrix;
    firstLength: number;
    firstBx: number;
    firstBy: number;
    firstBr: number;
    firstIh: number;
    secondLength: number;
    secondBx: number;
    secondBy: number;
    secondBr: number;
    secondIh: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    clockwiseInner: boolean;
  },
) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  let adjustedFirstLength = firstLength;
  const prod =
    (dist + adjustedFirstLength + secondLength) *
    (dist - adjustedFirstLength + secondLength) *
    (dist + adjustedFirstLength - secondLength) *
    (-dist + adjustedFirstLength + secondLength);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  let jointAngle = 0;

  if (prod >= 0 && dist < adjustedFirstLength + secondLength) {
    const circumRadius =
      (dist * adjustedFirstLength * secondLength) / Math.sqrt(prod);
    jointAngle = Math.asin(secondLength / (2 * circumRadius));
  } else {
    adjustedFirstLength =
      (adjustedFirstLength / (adjustedFirstLength + secondLength)) * dist;
  }

  if (clockwiseInner) {
    jointAngle *= -1;
  }

  const jointx = x1 + adjustedFirstLength * Math.cos(angle + jointAngle);
  const jointy = y1 + adjustedFirstLength * Math.sin(angle + jointAngle);

  return (
    isPointInSkewedSprite(point, {
      matrix,
      bx: firstBx,
      by: firstBy,
      br: firstBr,
      ih: firstIh,
      x1,
      y1,
      x2: jointx,
      y2: jointy,
    }) ||
    isPointInSkewedSprite(point, {
      matrix,
      bx: secondBx,
      by: secondBy,
      br: secondBr,
      ih: secondIh,
      x1: jointx,
      y1: jointy,
      x2,
      y2,
    })
  );
}

function isPointInSkewedSprite(
  point: { x: number; y: number },
  {
    matrix,
    bx,
    by,
    br,
    ih,
    x1,
    y1,
    x2,
    y2,
  }: {
    matrix: AffineMatrix;
    bx: number;
    by: number;
    br: number;
    ih: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  },
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  let drawMatrix = translateMatrix(matrix, x1, y1);
  drawMatrix = rotateMatrix(drawMatrix, Math.atan2(dy, dx));
  drawMatrix = translateMatrix(drawMatrix, -bx, -by * ih);
  drawMatrix = scaleMatrix(drawMatrix, bx + br + length, ih);
  return isPointInWorldToUnitSquare(point, drawMatrix);
}

function isPointInTransformedSprite(
  point: { x: number; y: number },
  matrix: AffineMatrix,
  isPointInVisibleArea: (point: { x: number; y: number }) => boolean,
) {
  const localPoint = worldToUnitSquarePoint(point, matrix);
  if (!localPoint) return false;
  if (
    localPoint.x < 0 ||
    localPoint.x > 1 ||
    localPoint.y < 0 ||
    localPoint.y > 1
  ) {
    return false;
  }

  return isPointInVisibleArea(localPoint);
}

function isPointInWorldToUnitSquare(
  point: { x: number; y: number },
  matrix: AffineMatrix,
) {
  const localPoint = worldToUnitSquarePoint(point, matrix);
  if (!localPoint) return false;
  return (
    localPoint.x >= 0 &&
    localPoint.x <= 1 &&
    localPoint.y >= 0 &&
    localPoint.y <= 1
  );
}

function worldToUnitSquarePoint(
  point: { x: number; y: number },
  matrix: AffineMatrix,
) {
  const [a, b, c, d, e, f] = matrix;
  const det = a * d - b * c;
  if (det === 0) return null;

  const relativeX = point.x - e;
  const relativeY = point.y - f;
  const localX = (d * relativeX - c * relativeY) / det;
  const localY = (-b * relativeX + a * relativeY) / det;
  return { x: localX, y: localY };
}

function isPointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const from = polygon[i];
    const to = polygon[j];
    const intersects =
      from.y > point.y !== to.y > point.y &&
      point.x <
        ((to.x - from.x) * (point.y - from.y)) / (to.y - from.y) + from.x;
    if (intersects) inside = !inside;
  }

  return inside;
}
