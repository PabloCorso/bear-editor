import type { BikeCoords } from "~/editor/kuski-geometry";
import { ELMA_PIXEL_SCALE } from "~/editor/constants";
import {
  identityMatrix,
  rotateMatrix,
  scaleMatrix,
  translateMatrix,
  type AffineMatrix,
} from "~/editor/render/affine-math";

export type BikeRenderPoint = {
  x: number;
  y: number;
};

export type WebGLBikePose = {
  backWheelMatrix: AffineMatrix;
  backWheelPosition: BikeRenderPoint;
  backWheelRotation: number;
  bikeMatrix: AffineMatrix;
  bikeRotation: number;
  bodyMatrix: AffineMatrix;
  frontWheelMatrix: AffineMatrix;
  frontWheelPosition: BikeRenderPoint;
  frontWheelRotation: number;
  handlebarTarget: BikeRenderPoint;
  headMatrix: AffineMatrix;
  kuskiMatrix: AffineMatrix;
  pedalTarget: BikeRenderPoint;
  shoulder: BikeRenderPoint;
  suspensionMatrix: AffineMatrix;
  rearSuspensionTarget: BikeRenderPoint;
  frontSuspensionTarget: BikeRenderPoint;
};

export function buildWebGLBikePose({
  start,
  coords,
}: {
  start: BikeRenderPoint;
  coords: BikeCoords;
}): WebGLBikePose {
  const bikeRotation = (coords.bikeR * Math.PI * 2) / 10000;
  const turn = coords.turn;
  const leftX = coords.leftX / 1000;
  const leftY = coords.leftY / 1000;
  const leftRotation = (coords.leftR * Math.PI * 2) / 250;
  const rightX = coords.rightX / 1000;
  const rightY = coords.rightY / 1000;
  const rightRotation = (coords.rightR * Math.PI * 2) / 250;
  const headX = coords.headX / 1000;
  const headY = coords.headY / 1000;

  const baseMatrix = translateMatrix(
    translateMatrix(identityMatrix(), start.x, start.y),
    -leftX,
    leftY,
  );
  const bikeMatrix = turn
    ? scaleMatrix(rotateMatrix(baseMatrix, -bikeRotation), -1, 1)
    : rotateMatrix(baseMatrix, -bikeRotation);
  const suspensionMatrix = scaleMatrix(
    bikeMatrix,
    ELMA_PIXEL_SCALE,
    ELMA_PIXEL_SCALE,
  );

  const backWheelPosition = !turn
    ? { x: rightX, y: -rightY }
    : { x: leftX, y: -leftY };
  const backWheelRotation = !turn ? rightRotation : leftRotation;
  const frontWheelPosition = turn
    ? { x: rightX, y: -rightY }
    : { x: leftX, y: -leftY };
  const frontWheelRotation = turn ? rightRotation : leftRotation;

  const frontWheelAngle =
    Math.atan2(frontWheelPosition.y, (turn ? -1 : 1) * frontWheelPosition.x) +
    (turn ? -1 : 1) * bikeRotation;
  const frontWheelRadius = Math.hypot(
    frontWheelPosition.x,
    frontWheelPosition.y,
  );

  const rearWheelAngle =
    Math.atan2(backWheelPosition.y, (turn ? -1 : 1) * backWheelPosition.x) +
    (turn ? -1 : 1) * bikeRotation;
  const rearWheelRadius = Math.hypot(backWheelPosition.x, backWheelPosition.y);

  const backWheelMatrix = translateMatrix(
    scaleMatrix(
      rotateMatrix(
        translateMatrix(baseMatrix, backWheelPosition.x, backWheelPosition.y),
        -backWheelRotation,
      ),
      elmaPixelsToWorldUnits(38.4),
      elmaPixelsToWorldUnits(38.4),
    ),
    -0.5,
    -0.5,
  );
  const frontWheelMatrix = translateMatrix(
    scaleMatrix(
      rotateMatrix(
        translateMatrix(baseMatrix, frontWheelPosition.x, frontWheelPosition.y),
        -frontWheelRotation,
      ),
      elmaPixelsToWorldUnits(38.4),
      elmaPixelsToWorldUnits(38.4),
    ),
    -0.5,
    -0.5,
  );

  const headRadius = Math.hypot(headX, headY);
  const headAngle =
    Math.atan2(-headY, turn ? -headX : headX) +
    (turn ? -bikeRotation : bikeRotation);
  const wx = headRadius * Math.cos(headAngle);
  const wy = headRadius * Math.sin(headAngle);
  const kuskiMatrix = translateMatrix(bikeMatrix, wx, wy);

  return {
    backWheelMatrix,
    backWheelPosition,
    backWheelRotation,
    bikeMatrix,
    bikeRotation,
    bodyMatrix: scaleMatrix(
      rotateMatrix(
        translateMatrix(
          kuskiMatrix,
          elmaPixelsToWorldUnits(17),
          elmaPixelsToWorldUnits(9.25),
        ),
        Math.PI + 2 / 3,
      ),
      thirdElmaPixelsToWorldUnits(100),
      thirdElmaPixelsToWorldUnits(58),
    ),
    frontWheelMatrix,
    frontWheelPosition,
    frontWheelRotation,
    handlebarTarget: {
      x: -wx - thirdElmaPixelsToWorldUnits(64.5),
      y: -wy - thirdElmaPixelsToWorldUnits(59.6),
    },
    headMatrix: scaleMatrix(
      translateMatrix(
        kuskiMatrix,
        elmaPixelsToWorldUnits(-15.5),
        elmaPixelsToWorldUnits(-42),
      ),
      elmaPixelsToWorldUnits(23),
      elmaPixelsToWorldUnits(23),
    ),
    kuskiMatrix,
    pedalTarget: {
      x: -wx + thirdElmaPixelsToWorldUnits(10.2),
      y: -wy + thirdElmaPixelsToWorldUnits(65),
    },
    shoulder: {
      x: 0,
      y: elmaPixelsToWorldUnits(-17.5),
    },
    suspensionMatrix,
    rearSuspensionTarget: {
      x: elmaPixelsFromWorldUnits(rearWheelRadius * Math.cos(rearWheelAngle)),
      y: elmaPixelsFromWorldUnits(rearWheelRadius * Math.sin(rearWheelAngle)),
    },
    frontSuspensionTarget: {
      x: elmaPixelsFromWorldUnits(frontWheelRadius * Math.cos(frontWheelAngle)),
      y: elmaPixelsFromWorldUnits(frontWheelRadius * Math.sin(frontWheelAngle)),
    },
  };
}

function elmaPixelsToWorldUnits(pixels: number) {
  return pixels * ELMA_PIXEL_SCALE;
}

function thirdElmaPixelsToWorldUnits(pixels: number) {
  return elmaPixelsToWorldUnits(pixels) / 3;
}

function elmaPixelsFromWorldUnits(worldUnits: number) {
  return worldUnits / ELMA_PIXEL_SCALE;
}
