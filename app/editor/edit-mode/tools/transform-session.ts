import type { Position } from "~/editor/elma-types";
import {
  getResizeTransform,
  getSkewTransform,
  getTransformCenter,
  rotateTransformPoint,
  transformControls,
  type TransformFrameCorners,
  type TransformHandle,
} from "~/editor/helpers/selection-transform";
import type { WorldRect } from "~/editor/render/world-geometry";

import type { SelectToolState } from "./select-tool";

export type TransformFrame = {
  bounds: WorldRect;
  angle: number;
  corners?: TransformFrameCorners;
};

export type ArtifactTransform = {
  start: number;
  length: number;
  apply: (points: Position[]) => void;
  restore?: () => void;
};

type TransformSessionOptions = {
  frame: TransformFrame;
  handle: TransformHandle | "rotate" | "move";
  points: Position[];
  artifacts: ArtifactTransform[];
  selection: SelectToolState;
};

type UpdateOptions = {
  startPosition: Position;
  constrain: boolean;
  snapTranslation: (anchor: Position, delta: Position) => Position;
};

export class TransformSession {
  readonly frame: TransformFrame;
  readonly handle: TransformHandle | "rotate" | "move";
  readonly points: Position[];
  readonly artifacts: ArtifactTransform[];
  readonly selection: SelectToolState;
  previewFrame: TransformFrame;
  private map: (point: Position) => Position = (point) => point;

  constructor(options: TransformSessionOptions) {
    this.frame = options.frame;
    this.previewFrame = options.frame;
    this.handle = options.handle;
    this.points = options.points;
    this.artifacts = options.artifacts;
    this.selection = options.selection;
  }

  update(worldPosition: Position, options: UpdateOptions): void {
    const center = getTransformCenter(this.frame.bounds);
    let angle = this.frame.angle;
    if (this.handle === "move") {
      const delta = {
        x: worldPosition.x - options.startPosition.x,
        y: worldPosition.y - options.startPosition.y,
      };
      const anchor = this.points[0];
      const translation = anchor
        ? options.snapTranslation(anchor, delta)
        : delta;
      this.map = (point) => ({
        x: point.x + translation.x,
        y: point.y + translation.y,
      });
    } else if (this.selection.skewMode && typeof this.handle === "object") {
      this.map = getSkewTransform(this.getFrameCorners(), this.handle, {
        x: worldPosition.x - options.startPosition.x,
        y: worldPosition.y - options.startPosition.y,
      });
    } else if (this.handle === "rotate") {
      let delta =
        Math.atan2(worldPosition.y - center.y, worldPosition.x - center.x) -
        Math.atan2(
          options.startPosition.y - center.y,
          options.startPosition.x - center.x,
        );
      if (options.constrain) {
        delta =
          Math.round(delta / transformControls.rotationSnap) *
          transformControls.rotationSnap;
      }
      angle += delta;
      this.map = (point) => rotateTransformPoint(point, center, delta);
    } else {
      const local = rotateTransformPoint(worldPosition, center, -angle);
      const start = rotateTransformPoint(options.startPosition, center, -angle);
      const resize = getResizeTransform(
        this.frame.bounds,
        this.handle,
        { x: local.x - start.x, y: local.y - start.y },
        !options.constrain,
      );
      this.map = (point) =>
        rotateTransformPoint(
          resize(rotateTransformPoint(point, center, -angle)),
          center,
          angle,
        );
    }
    this.previewFrame = this.createPreviewFrame(center, angle);
  }

  getPositions(): Position[] {
    return this.points.map(this.map);
  }

  getFrameCorners(): TransformFrameCorners {
    if (this.frame.corners) return this.frame.corners;
    const { minX, minY, maxX, maxY } = this.frame.bounds;
    const center = getTransformCenter(this.frame.bounds);
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ].map((point) =>
      rotateTransformPoint(point, center, this.frame.angle),
    ) as TransformFrameCorners;
  }

  private createPreviewFrame(center: Position, angle: number): TransformFrame {
    if (this.selection.skewMode) {
      return {
        ...this.frame,
        corners: this.getFrameCorners().map(this.map) as TransformFrameCorners,
      };
    }
    const bounds = this.frame.bounds;
    const toWorld = (point: Position) =>
      rotateTransformPoint(point, center, this.frame.angle);
    const left = this.map(toWorld({ x: bounds.minX, y: center.y }));
    const right = this.map(toWorld({ x: bounds.maxX, y: center.y }));
    const top = this.map(toWorld({ x: center.x, y: bounds.minY }));
    const bottom = this.map(toWorld({ x: center.x, y: bounds.maxY }));
    const nextCenter = this.map(center);
    const halfWidth = Math.hypot(right.x - left.x, right.y - left.y) / 2;
    const halfHeight = Math.hypot(bottom.x - top.x, bottom.y - top.y) / 2;
    return {
      angle,
      bounds: {
        minX: nextCenter.x - halfWidth,
        maxX: nextCenter.x + halfWidth,
        minY: nextCenter.y - halfHeight,
        maxY: nextCenter.y + halfHeight,
      },
    };
  }
}
