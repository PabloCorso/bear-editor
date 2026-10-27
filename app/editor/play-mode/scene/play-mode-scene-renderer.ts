import { getDevicePixelSnappedViewportCenter } from "~/editor/helpers/camera-helpers";
import { LgrAssets } from "~/components/lgr-assets";
import { testStartGhostOpacity } from "~/editor/test-starts";
import { PLAY_MODE_PIXELS_PER_METER } from "~/editor/play-mode/play-settings";
import { buildPlayModeScene } from "~/editor/play-mode/scene/play-mode-scene-builder";
import type { PlayModeRenderVisibility } from "~/editor/play-mode/scene/play-mode-scene";
import { getPictureWorldDimensions } from "~/editor/render/picture-metrics";
import { DEFAULT_OBJECT_RENDER_DISTANCE } from "~/editor/render/render-constants";
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
      testStartState?: Pick<
        import("~/editor/editor-state").EditorState,
        "start" | "testStarts"
      >;
    },
  ): void {
    const width = this.viewportWidth;
    const height = this.viewportHeight;
    if (width <= 0 || height <= 0) return;
    const cam = state.camera;
    const ppm = PLAY_MODE_PIXELS_PER_METER * cam.zoom;
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
    const starts = options?.testStartState;
    if (starts) {
      const active = starts.testStarts.items.find(
        (item) => item.id === starts.testStarts.activeId,
      );
      for (const item of scene.drawItems)
        if (item.type === "bike")
          item.color = active?.color ?? starts.testStarts.levelColor;
      const markers = [
        ...starts.testStarts.items.filter((item) => item.id !== active?.id),
        ...(active
          ? [{ position: starts.start, color: starts.testStarts.levelColor }]
          : []),
      ];
      const foregroundIndex = scene.drawItems.findIndex(
        (item) => item.distance < DEFAULT_OBJECT_RENDER_DISTANCE,
      );
      scene.drawItems.splice(
        foregroundIndex === -1 ? scene.drawItems.length : foregroundIndex,
        0,
        ...markers.map((item) => ({
          type: "start" as const,
          position: item.position,
          color: item.color,
          opacity: testStartGhostOpacity.play,
          distance: DEFAULT_OBJECT_RENDER_DISTANCE,
          clip: 0,
        })),
      );
    }
    this.worldRenderer.render(scene);
  }
}
