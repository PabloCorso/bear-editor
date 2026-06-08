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
  private devicePixelRatio = 1;

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
    this.devicePixelRatio = dpr;
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
    const snappedCenter = getDevicePixelSnappedViewportCenter({
      centerX: cam.x,
      centerY: -cam.y,
      width,
      height,
      zoom: ppm,
      devicePixelRatio: this.devicePixelRatio,
    });

    const scene = buildPlayModeScene({
      state,
      viewport: {
        width,
        height,
        centerX: snappedCenter.x,
        centerY: snappedCenter.y,
        zoom: ppm,
      },
      visibility: options?.visibility ?? {
        useGroundSkyTextures: false,
        useGrassTextures: false,
        zoomTextures: true,
        showObjectAnimations: true,
        showObjects: true,
        showPictures: true,
        showTextures: true,
        showPolygons: true,
        showGroundBounds: false,
        showGrassBounds: false,
      },
      resolvePictureDimensions: (picture) =>
        getPictureWorldDimensions(picture, this.lgrAssets),
    });
    this.worldRenderer.render(scene);
  }
}

function getDevicePixelSnappedViewportCenter({
  centerX,
  centerY,
  width,
  height,
  zoom,
  devicePixelRatio,
}: {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  zoom: number;
  devicePixelRatio: number;
}) {
  const unitsPerDevicePixel = 1 / Math.max(zoom * devicePixelRatio, 0.0001);
  const halfWidth = width / (2 * zoom);
  const halfHeight = height / (2 * zoom);
  const minX = snapToGrid(centerX - halfWidth, unitsPerDevicePixel);
  const minY = snapToGrid(centerY - halfHeight, unitsPerDevicePixel);

  return {
    x: minX + halfWidth,
    y: minY + halfHeight,
  };
}

function snapToGrid(value: number, gridSize: number) {
  return Math.round(value / gridSize) * gridSize;
}
