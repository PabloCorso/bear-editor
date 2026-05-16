import type { EditorState } from "./editor-state";

export type VertexEdgeClickBehavior = "internal" | "smibu";

export type EditorPreferences = Pick<
  EditorState,
  | "animateSprites"
  | "isUIVisible"
  | "levelVisibility"
  | "playModeZoom"
  | "playSettings"
  | "vertexEdgeClickBehavior"
>;
