import type { LgrAssets } from "~/components/lgr-assets";
import type { WorldRenderScene } from "~/editor/render/world-scene";
import { renderCanvasWorldScene } from "~/editor/render/canvas-world-renderer";
import type { WorldSceneRenderer } from "./world-scene-renderer";

export class CanvasWorldSceneRenderer implements WorldSceneRenderer {
  readonly backend = "canvas" as const;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lgrAssets: LgrAssets | null;

  constructor(canvas: HTMLCanvasElement, lgrAssets: LgrAssets | null) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context missing");

    this.canvas = canvas;
    this.ctx = ctx;
    this.lgrAssets = lgrAssets;
  }

  getContext() {
    return this.ctx;
  }

  resize({
    width,
    height,
    devicePixelRatio = 1,
  }: {
    width: number;
    height: number;
    devicePixelRatio?: number;
  }) {
    this.canvas.width = width * devicePixelRatio;
    this.canvas.height = height * devicePixelRatio;
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  render(scene: WorldRenderScene) {
    renderCanvasWorldScene({
      ctx: this.ctx,
      scene,
      lgrAssets: this.lgrAssets,
    });
  }

  destroy() {}
}
