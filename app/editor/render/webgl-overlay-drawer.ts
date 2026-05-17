import { colorToRgba, type WebGLRenderContext } from "~/editor/render/webgl-render-context";
import type {
  WorldPoint,
  WorldRenderOverlayItem,
  WorldRenderScene,
} from "~/editor/render/world-scene";
import {
  appendCircleOutlineVertices,
  appendCircleVertices,
  appendLineVertices,
  appendRectOutlineVertices,
  appendRectVertices,
} from "~/editor/render/webgl-geometry";

export class WebGLOverlayDrawer {
  constructor(private context: WebGLRenderContext) {}

  draw(scene: WorldRenderScene) {
    const filledRectBatches = new Map<string, number[]>();
    const lineBatches = new Map<string, number[]>();
    const filledCircleBatches = new Map<string, number[]>();
    const circleOutlineBatches = new Map<string, number[]>();

    for (const overlay of scene.overlays ?? []) {
      switch (overlay.type) {
        case "line":
          this.appendLineBatch(lineBatches, {
            from: overlay.from,
            to: overlay.to,
            width: overlay.width,
            color: overlay.color,
            opacity: overlay.opacity ?? 1,
          });
          break;
        case "polyline":
          this.appendPolylineBatch(lineBatches, overlay);
          break;
        case "rect":
          if (overlay.fillColor) {
            this.appendRectBatch(filledRectBatches, {
              x: overlay.position.x,
              y: overlay.position.y,
              width: overlay.width,
              height: overlay.height,
              color: overlay.fillColor,
              opacity: overlay.opacity ?? 1,
            });
          }
          if (overlay.strokeColor && overlay.lineWidth != null) {
            this.appendRectOutlineBatch(lineBatches, {
              x: overlay.position.x,
              y: overlay.position.y,
              width: overlay.width,
              height: overlay.height,
              lineWidth: overlay.lineWidth,
              color: overlay.strokeColor,
              opacity: overlay.opacity ?? 1,
            });
          }
          break;
        case "circle":
          if (overlay.fillColor) {
            this.appendCircleBatch(filledCircleBatches, {
              center: overlay.center,
              radius: overlay.radius,
              color: overlay.fillColor,
              opacity: overlay.opacity ?? 1,
            });
          }
          if (overlay.strokeColor && overlay.lineWidth != null) {
            this.appendCircleOutlineBatch(circleOutlineBatches, {
              center: overlay.center,
              radius: overlay.radius,
              lineWidth: overlay.lineWidth,
              color: overlay.strokeColor,
              opacity: overlay.opacity ?? 1,
            });
          }
          break;
      }
    }

    this.flushOverlayBatches(filledRectBatches, scene);
    this.flushOverlayBatches(lineBatches, scene);
    this.flushOverlayBatches(filledCircleBatches, scene);
    this.flushOverlayBatches(circleOutlineBatches, scene);
  }

  private appendRectBatch(
    batches: Map<string, number[]>,
    {
      x,
      y,
      width,
      height,
      color,
      opacity,
    }: {
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(batches, color, opacity);
    appendRectVertices(vertices, x, y, width, height);
  }

  private appendRectOutlineBatch(
    batches: Map<string, number[]>,
    {
      x,
      y,
      width,
      height,
      lineWidth,
      color,
      opacity,
    }: {
      x: number;
      y: number;
      width: number;
      height: number;
      lineWidth: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(
      batches,
      color,
      opacity,
      lineWidth.toFixed(6),
    );
    appendRectOutlineVertices(vertices, x, y, width, height, lineWidth);
  }

  private appendPolylineBatch(
    batches: Map<string, number[]>,
    overlay: Extract<WorldRenderOverlayItem, { type: "polyline" }>,
  ) {
    if (overlay.points.length < 2) return;

    for (let index = 1; index < overlay.points.length; index += 1) {
      this.appendLineBatch(batches, {
        from: overlay.points[index - 1]!,
        to: overlay.points[index]!,
        width: overlay.width,
        color: overlay.color,
        opacity: overlay.opacity ?? 1,
      });
    }

    if (overlay.closed) {
      this.appendLineBatch(batches, {
        from: overlay.points[overlay.points.length - 1]!,
        to: overlay.points[0]!,
        width: overlay.width,
        color: overlay.color,
        opacity: overlay.opacity ?? 1,
      });
    }
  }

  private appendLineBatch(
    batches: Map<string, number[]>,
    {
      from,
      to,
      width,
      color,
      opacity,
    }: {
      from: WorldPoint;
      to: WorldPoint;
      width: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(
      batches,
      color,
      opacity,
      width.toFixed(6),
    );
    appendLineVertices(vertices, from, to, width);
  }

  private appendCircleBatch(
    batches: Map<string, number[]>,
    {
      center,
      radius,
      color,
      opacity,
    }: {
      center: WorldPoint;
      radius: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(batches, color, opacity);
    appendCircleVertices(vertices, center, radius);
  }

  private appendCircleOutlineBatch(
    batches: Map<string, number[]>,
    {
      center,
      radius,
      lineWidth,
      color,
      opacity,
    }: {
      center: WorldPoint;
      radius: number;
      lineWidth: number;
      color: string;
      opacity: number;
    },
  ) {
    const vertices = getOverlayBatchVertices(
      batches,
      color,
      opacity,
      lineWidth.toFixed(6),
    );
    appendCircleOutlineVertices(vertices, center, radius, lineWidth);
  }

  private flushOverlayBatches(
    batches: Map<string, number[]>,
    scene: WorldRenderScene,
  ) {
    for (const [key, vertices] of batches) {
      const [color, opacityToken] = key.split("|");
      this.context.drawVertices({
        vertices,
        color: colorToRgba(color!, Number(opacityToken)),
        scene,
      });
    }
  }
}

function getOverlayBatchVertices(
  batches: Map<string, number[]>,
  color: string,
  opacity: number,
  discriminator = "",
) {
  const key = [color, opacity.toFixed(4), discriminator].join("|");
  const existing = batches.get(key);
  if (existing) return existing;

  const vertices: number[] = [];
  batches.set(key, vertices);
  return vertices;
}
