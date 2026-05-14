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

export class PlayModeSceneRenderer {
  private canvas: HTMLCanvasElement;
  private worldRenderer: WorldSceneRenderer;
  private lgrAssets: LgrAssets | null;
  private pixelsPerMeter = 48;
  private viewportWidth = 0;
  private viewportHeight = 0;

  constructor(
    canvas: HTMLCanvasElement,
    lgrAssets: LgrAssets | null = null,
    backend: WorldSceneRendererBackend = "webgl",
  ) {
    this.canvas = canvas;
    this.lgrAssets = lgrAssets;
    this.worldRenderer = createWorldSceneRenderer({
      canvas,
      lgrAssets,
      backend,
    });
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    this.viewportWidth = pixelWidth / dpr;
    this.viewportHeight = pixelHeight / dpr;
    this.worldRenderer.resize({
      width: this.viewportWidth,
      height: this.viewportHeight,
      devicePixelRatio: dpr,
    });
  }

  render(
    state: GameState,
    options?: {
      visibility?: PlayModeRenderVisibility;
    },
  ): void {
    const width = this.viewportWidth;
    const height = this.viewportHeight;
    if (width <= 0 || height <= 0) return;
    const cam = state.camera;
    const ppm = this.pixelsPerMeter * cam.zoom;

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
        zoomTextures: true,
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
  }
}
