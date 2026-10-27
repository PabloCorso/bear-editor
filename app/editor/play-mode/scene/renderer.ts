import type { LgrAssets } from "~/components/lgr-assets";
import type { LevelVisibilitySettings } from "~/editor/level-visibility";
import type { GameState } from "~/editor/play-mode/engine/game/game-loop";
import type { WorldSceneRendererBackend } from "~/editor/render/world-scene-renderer";
import { PlayModeSceneRenderer } from "./play-mode-scene-renderer";

export type PlayModeRenderVisibility = Pick<
  LevelVisibilitySettings,
  | "useGroundSkyTextures"
  | "useGrassTextures"
  | "zoomTextures"
  | "showObjectAnimations"
  | "showObjects"
  | "showPictures"
  | "showTextures"
  | "showPolygons"
  | "showGroundBounds"
  | "showGrassBounds"
>;

export type PlayModeRenderOptions = {
  visibility?: PlayModeRenderVisibility;
  testStartState?: Pick<
    import("~/editor/editor-state").EditorState,
    "start" | "testStarts"
  >;
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
