import type { EditorState } from "./editor-state";

export type VertexEdgeClickBehavior = "default" | "internal";

export type EditorPreferences = Pick<
  EditorState,
  | "defaultLevelTitle"
  | "customShapes"
  | "animateSprites"
  | "isUIVisible"
  | "levelVisibility"
  | "playModeZoom"
  | "playSettings"
  | "vertexEdgeClickBehavior"
  | "autoGrassOptions"
>;
