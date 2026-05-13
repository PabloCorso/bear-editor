import type { LgrAssets } from "~/components/lgr-assets";
import type { LevelVisibilitySettings } from "~/editor/level-visibility";
import type { GameState } from "~/editor/play-mode/engine/game/game-loop";
import type { WorldSceneRendererBackend } from "~/editor/render/world-scene-renderer";
import { CanvasRenderer } from "./canvas-renderer";

export type PlayModeRenderVisibility = Pick<
  LevelVisibilitySettings,
  | "useGroundSkyTextures"
  | "showObjectAnimations"
  | "showObjects"
  | "showPictures"
  | "showTextures"
  | "showPolygons"
  | "showPolygonBounds"
>;

export type PlayModeRenderOptions = {
  visibility?: PlayModeRenderVisibility;
};

export interface PlayModeRenderer {
  resize(): void;
  render(state: GameState, options?: PlayModeRenderOptions): void;
}

export function createPlayModeRenderer({
  canvas,
  lgrAssets,
  backend = "canvas",
}: {
  canvas: HTMLCanvasElement;
  lgrAssets: LgrAssets | null;
  backend?: WorldSceneRendererBackend;
}): PlayModeRenderer {
  // The shared renderer seam lives here so editor and play mode can choose the
  // same backend once the WebGL implementation is ready.
  return new CanvasRenderer(canvas, lgrAssets, backend);
}
