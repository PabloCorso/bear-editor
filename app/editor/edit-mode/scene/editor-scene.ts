import type { Picture } from "~/editor/elma-types";
import type {
  WorldRenderObjectItem,
  WorldRenderPictureItem,
  WorldRenderScene,
  WorldRenderStartItem,
} from "~/editor/render/world-scene";

export type EditorPictureSceneItem = WorldRenderPictureItem;
export type EditorAppleSceneItem = WorldRenderObjectItem & {
  objectKind: "apple";
};
export type EditorKillerSceneItem = WorldRenderObjectItem & {
  objectKind: "killer";
};
export type EditorFlowerSceneItem = WorldRenderObjectItem & {
  objectKind: "flower";
};
export type EditorStartSceneItem = WorldRenderStartItem;
type EditorObjectSceneItem =
  | EditorAppleSceneItem
  | EditorKillerSceneItem
  | EditorFlowerSceneItem;
export type EditorWorldDrawItem =
  | EditorPictureSceneItem
  | EditorObjectSceneItem
  | EditorStartSceneItem;
export type EditorWorldScene = Omit<WorldRenderScene, "drawItems"> & {
  drawItems: EditorWorldDrawItem[];
};

export type EditorHoverableWorldItem =
  | {
      kind: "object";
      type: "apple" | "killer" | "flower" | "start";
      position: { x: number; y: number };
    }
  | {
      kind: "picture";
      picture: Picture;
    };
