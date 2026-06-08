import { describe, expect, it } from "vitest";
import {
  defaultBikeCoords,
  getKuskiSelectionTriangle,
  isPointInKuskiSelectionBounds,
} from "./kuski-geometry";
import { isStartObjectHit } from "./helpers/selection-helpers";
import { ELMA_PIXEL_SCALE } from "./constants";
import {
  rotateMatrix,
  scaleMatrix,
  transformPoint,
  translateMatrix,
} from "./render/affine-math";
import { buildWebGLBikePose } from "./render/webgl-bike-pose";

const start = { x: 10, y: 20 };

describe("isStartObjectHit", () => {
  it("keeps the rendered bike image selectable when object graphics are visible", () => {
    expect(
      isStartObjectHit(
        pointInBikeSprite(0.55, 0.62),
        start,
        "boundsWithImage",
        true,
      ),
    ).toBe(true);
  });

  it("ignores transparent wheel sprite corners when object graphics are visible", () => {
    const pose = buildWebGLBikePose({ start, coords: defaultBikeCoords });

    expect(
      isStartObjectHit(
        transformPoint(pose.frontWheelMatrix, 0.02, 0.02),
        start,
        "boundsWithImage",
        true,
      ),
    ).toBe(false);
  });

  it("does not fall back to collision-only triangle areas in image mode", () => {
    const trianglePoint = getKuskiSelectionTriangle({
      start,
      coords: defaultBikeCoords,
    })[2];

    expect(
      isPointInKuskiSelectionBounds({
        point: trianglePoint,
        start,
        coords: defaultBikeCoords,
      }),
    ).toBe(true);
    expect(
      isStartObjectHit(trianglePoint, start, "boundsWithImage", true),
    ).toBe(false);
  });
});

function pointInBikeSprite(x: number, y: number) {
  const pose = buildWebGLBikePose({ start, coords: defaultBikeCoords });
  const matrix = scaleMatrix(
    rotateMatrix(
      translateMatrix(
        pose.bikeMatrix,
        elmaPixelsToWorldUnits(-43),
        elmaPixelsToWorldUnits(-12),
      ),
      -Math.PI * 0.197,
    ),
    elmaPixelsToWorldUnits(0.215815 * 380),
    elmaPixelsToWorldUnits(0.215815 * 301),
  );

  return transformPoint(matrix, x, y);
}

function elmaPixelsToWorldUnits(pixels: number) {
  return pixels * ELMA_PIXEL_SCALE;
}
