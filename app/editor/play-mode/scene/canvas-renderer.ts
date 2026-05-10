import { LgrAssets } from "~/components/lgr-assets";
import { buildPlayModeScene } from "~/editor/play-mode/scene/play-mode-scene-builder";
import type { PlayModeRenderVisibility } from "~/editor/play-mode/scene/play-mode-scene";
import { renderCanvasWorldScene } from "~/editor/render/canvas-world-renderer";
import { getPictureWorldDimensions } from "~/editor/render/picture-metrics";
import type { GameState } from "~/editor/play-mode/engine/game/game-loop";

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lgrAssets: LgrAssets | null;
  private pixelsPerMeter = 48;

  constructor(canvas: HTMLCanvasElement, lgrAssets: LgrAssets | null = null) {
    this.canvas = canvas;
    this.lgrAssets = lgrAssets;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(
    state: GameState,
    options?: {
      visibility?: PlayModeRenderVisibility;
    },
  ): void {
    const { ctx, canvas } = this;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const cam = state.camera;
    const ppm = this.pixelsPerMeter * cam.zoom;

    // Clear
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(ppm, ppm);
    ctx.translate(-cam.x, cam.y);

    const scene = buildPlayModeScene({
      state,
      viewport: {
        width,
        height,
        centerX: cam.x,
        centerY: -cam.y,
        zoom: ppm,
      },
      visibility: options?.visibility ?? {
        useGroundSkyTextures: false,
        showObjectAnimations: true,
        showObjects: true,
        showPictures: true,
        showTextures: true,
        showPolygons: true,
        showPolygonBounds: false,
      },
      resolvePictureDimensions: (picture) =>
        getPictureWorldDimensions(picture, this.lgrAssets),
    });
    renderCanvasWorldScene({ ctx, scene, lgrAssets: this.lgrAssets });

    ctx.restore();
  }
}
