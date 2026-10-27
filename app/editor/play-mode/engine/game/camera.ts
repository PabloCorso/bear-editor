/**
 * Camera follow with flip animation.
 * Handles smooth transitions when the bike turns direction.
 */
import { LEFT_WHEEL_DX, LEFT_WHEEL_DY } from "../core/constants";

export interface Camera {
  x: number;
  y: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  zoom: number;
}

export function createCamera(): Camera {
  return {
    x: 0,
    y: 0,
    minX: -1000,
    minY: -1000,
    maxX: 1000,
    maxY: 1000,
    zoom: 1.0,
  };
}

/** Frame the initial bike from its left-wheel start in physics coordinates. */
export function createStartCamera(start: { x: number; y: number }): Camera {
  const camera = createCamera();
  updateCamera(camera, start.x - LEFT_WHEEL_DX, start.y - LEFT_WHEEL_DY);
  return camera;
}

/** Follow the bike in physics coordinates (Y-up) */
export function updateCamera(
  camera: Camera,
  bikeX: number,
  bikeY: number,
): void {
  camera.x = Math.max(camera.minX, Math.min(camera.maxX, bikeX));
  camera.y = Math.max(camera.minY, Math.min(camera.maxY, bikeY));
}
