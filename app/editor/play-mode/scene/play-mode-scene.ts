import type { LevelVisibilitySettings } from "~/editor/level-visibility";
import type { LevelData } from "~/editor/play-mode/engine/level";
import type {
  WorldRenderBikeItem,
  WorldRenderObjectItem,
  WorldRenderPictureItem,
  WorldRenderScene,
} from "~/editor/render/world-scene";

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
  | PlayModeSceneBikeItem;

export type PlayModeScene = Omit<WorldRenderScene, "drawItems"> & {
  drawItems: PlayModeSceneDrawItem[];
  level: LevelData;
};
