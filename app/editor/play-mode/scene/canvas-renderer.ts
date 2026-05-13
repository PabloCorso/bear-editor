import { LgrAssets } from "~/components/lgr-assets";
import { buildPlayModeScene } from "~/editor/play-mode/scene/play-mode-scene-builder";
import type { PlayModeRenderVisibility } from "~/editor/play-mode/scene/play-mode-scene";
import { getPictureWorldDimensions } from "~/editor/render/picture-metrics";
import {
  createWorldSceneRenderer,
  type WorldSceneRendererBackend,
  type WorldSceneRenderer,
} from "~/editor/render/world-scene-renderer";
import type { GameState } from "~/editor/play-mode/engine/game/game-loop";

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private worldRenderer: WorldSceneRenderer;
  private lgrAssets: LgrAssets | null;
  private pixelsPerMeter = 48;

  constructor(
    canvas: HTMLCanvasElement,
    lgrAssets: LgrAssets | null = null,
    backend: WorldSceneRendererBackend = "canvas",
  ) {
    this.canvas = canvas;
    this.lgrAssets = lgrAssets;
    this.worldRenderer = createWorldSceneRenderer({ canvas, lgrAssets, backend });
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.worldRenderer.resize({
      width: this.canvas.clientWidth,
      height: this.canvas.clientHeight,
      devicePixelRatio: dpr,
    });
  }

  render(
    state: GameState,
    options?: {
      visibility?: PlayModeRenderVisibility;
    },
  ): void {
    const ctx = this.worldRenderer.getContext();
    if (!ctx) {
      throw new Error("World renderer did not provide a 2D context");
    }

    const { canvas } = this;
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
    this.worldRenderer.render(scene);

    ctx.restore();
  }
}
