import type { LevelVisibilitySettings } from "~/editor/level-visibility";
import type { LevelData } from "~/editor/play-mode/engine/level";
import type {
  WorldRenderBikeItem,
  WorldRenderStartItem,
  WorldRenderObjectItem,
  WorldRenderPictureItem,
  WorldRenderScene,
} from "~/editor/render/world-scene";

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

export type PlayModeViewport = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  zoom: number;
};

export type PlayModeScenePictureItem = WorldRenderPictureItem;
export type PlayModeSceneObjectItem = WorldRenderObjectItem;
export type PlayModeSceneBikeItem = WorldRenderBikeItem;
export type PlayModeSceneDrawItem =
  | PlayModeScenePictureItem
  | PlayModeSceneObjectItem
  | PlayModeSceneBikeItem
  | WorldRenderStartItem;

export type PlayModeScene = Omit<WorldRenderScene, "drawItems"> & {
  drawItems: PlayModeSceneDrawItem[];
  level: LevelData;
};
