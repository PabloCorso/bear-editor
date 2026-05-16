import type { Tool, ToolState } from "./edit-mode/tools/tool-interface";
import type {
  Apple,
  EditorLevel,
  Picture,
  Polygon,
  Position,
} from "./elma-types";
import type { Widget } from "./edit-mode/widgets/widget-interface";
import { FileSession } from "./helpers/file-session";
import { LevelFolder } from "./helpers/level-folder";
import type { LevelVisibilitySettings } from "./level-visibility";
import type { VertexEdgeClickBehavior } from "./editor-preference-types";
import type {
  PlayRunEndBehavior,
  PlayKeyBindings,
  PlaySettings,
} from "./play-mode/play-settings";

type EditorDocumentSnapshot = Pick<
  EditorLevel,
  | "levelName"
  | "ground"
  | "sky"
  | "polygons"
  | "apples"
  | "killers"
  | "flowers"
  | "start"
  | "pictures"
>;

export type EditorDocumentOriginKind =
  | "default"
  | "builtin"
  | "file"
  | "download"
  | "api"
  | "workspace"
  | "recovery";

export type EditorDocumentOrigin = {
  kind: EditorDocumentOriginKind;
  label: string;
  canOverwrite: boolean;
};

export type EditorDocumentSaveState = "clean" | "dirty" | "saving" | "error";

export type EditorDocumentSession = {
  clipboardSessionId: string;
  baselineLevel: EditorLevel;
  origin: EditorDocumentOrigin;
  displayName: string;
  hasExternalHandle: boolean;
  pendingRecovery?: boolean;
  dirty: boolean;
  saveState: EditorDocumentSaveState;
  lastSavedAt?: number;
  lastError?: string;
};

export type EditorDocumentInput = {
  level: EditorLevel;
  origin: EditorDocumentOrigin;
  displayName?: string;
  hasExternalHandle?: boolean;
  pendingRecovery?: boolean;
};

export type EditorState = EditorLevel & {
  documentSession: EditorDocumentSession;

  // Editor state
  activeToolId: string;
  mousePosition: Position;
  mouseOnCanvas: boolean;

  // Camera state
  viewPortOffset: { x: number; y: number };
  zoom: number;
  playModeZoom: number;

  // View settings
  animateSprites: boolean;
  showSprites: boolean;
  levelVisibility: LevelVisibilitySettings;
  playSettings: PlaySettings;
  vertexEdgeClickBehavior: VertexEdgeClickBehavior;
  isUIVisible: boolean;
  isPlayMode: boolean;
  playModeSeedKeys: string[];

  // Fit to view trigger
  fitToViewTrigger: number;

  // Tools
  toolsMap: Map<string, Tool>;
  toolState: ToolState;

  // Widgets
  widgetsMap: Map<string, Widget>;

  // File system access
  fileSession: FileSession;
  levelFolder: LevelFolder;

  actions: {
    // Level data operations
    setStart: (position: Position) => void;
    addApple: (apple: Apple) => void;
    updateApple: (apple: Partial<Apple>) => void;
    removeApple: (apple: Apple) => void;
    addKiller: (killer: Position) => void;
    removeKiller: (killer: Position) => void;
    addFlower: (flower: Position) => void;
    removeFlower: (flower: Position) => void;
    addPicture: (picture: Picture) => void;
    removePicture: (picture: Picture) => void;
    setApples: (apples: Apple[]) => void;
    setKillers: (killers: Position[]) => void;
    setFlowers: (flowers: Position[]) => void;
    setPictures: (pictures: Picture[]) => void;

    setLevelName: (name: string) => void;
    setGround: (ground: string) => void;
    setSky: (sky: string) => void;
    setMousePosition: (position: Position) => void;
    setMouseOnCanvas: (onCanvas: boolean) => void;
    setCamera: (x: number, y: number) => void;
    setZoom: (zoom: number) => void;
    setPlayModeZoom: (zoom: number) => void;
    setPolygons: (polygons: Polygon[]) => void;

    registerTool: (tool: Tool) => void;
    activateTool: (toolId: string, variant?: string) => void;
    getActiveTool: <T extends Tool>(toolId?: string) => T | undefined;
    getTool: <T extends Tool>(toolId: string) => T | undefined;

    // Tools
    getToolState: <T extends ToolState>(toolId: string) => T | undefined;
    setToolState: <T extends ToolState>(
      toolId: string,
      state: Partial<T>,
    ) => void;

    // Widgets
    registerWidget: (widget: Widget) => void;
    activateWidget: (widgetId: string) => void;
    deactivateWidget: (widgetId: string) => void;

    // File system access
    setFileSession: (session?: FileSession) => void;
    setLevelFolder: (folder?: LevelFolder) => void;

    // View operations
    toggleAnimateSprites: () => void;
    toggleShowSprites: () => void;
    setLevelVisibility: (settings: Partial<LevelVisibilitySettings>) => void;
    setPlaySettings: (settings: {
      runEndBehavior?: PlayRunEndBehavior;
      keyBindings?: Partial<PlayKeyBindings>;
    }) => void;
    setVertexEdgeClickBehavior: (behavior: VertexEdgeClickBehavior) => void;
    toggleLevelVisibility: (key: keyof LevelVisibilitySettings) => void;
    resetLevelVisibility: () => void;
    setUIVisible: (visible: boolean) => void;
    toggleUIVisibility: () => void;
    startPlayMode: (seedKeys?: string[]) => void;
    stopPlayMode: () => void;
    togglePlayMode: () => void;
    replaceDocument: (document: EditorDocumentInput) => void;
    markDocumentSaved: (next?: {
      baselineLevel?: EditorDocumentSnapshot;
      origin?: EditorDocumentOrigin;
      displayName?: string;
      hasExternalHandle?: boolean;
      pendingRecovery?: boolean;
    }) => void;
    setDocumentSaveState: (
      saveState: EditorDocumentSaveState,
      lastError?: string,
    ) => void;
    triggerFitToView: () => void;
  };
};
