import type { LgrAssets } from "~/components/lgr-assets";
import type { LevelVisibilitySettings } from "~/editor/level-visibility";
import type { GameState } from "~/editor/play-mode/engine/game/game-loop";
import type { WorldSceneRendererBackend } from "~/editor/render/world-scene-renderer";
import { PlayModeSceneRenderer } from "./play-mode-scene-renderer";

export type PlayModeRenderVisibility = Pick<
  LevelVisibilitySettings,
  | "useGroundSkyTextures"
  | "zoomTextures"
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
  backend = "webgl",
}: {
  canvas: HTMLCanvasElement;
  lgrAssets: LgrAssets | null;
  backend?: WorldSceneRendererBackend;
}): PlayModeRenderer {
  return new PlayModeSceneRenderer(canvas, lgrAssets, backend);
}
