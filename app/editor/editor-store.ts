import { create, type StoreApi, type UseBoundStore } from "zustand";
import { temporal, type TemporalState } from "zundo";
import type {
  EditorDocumentInput,
  EditorDocumentOrigin,
  EditorDocumentSaveState,
  EditorState,
} from "./editor-state";
import type { Widget } from "./edit-mode/widgets/widget-interface";
import type { Tool, ToolState } from "./edit-mode/tools/tool-interface";
import { FileSession } from "~/editor/helpers/file-session";
import { LevelFolder } from "~/editor/helpers/level-folder";
import fastDeepEqual from "fast-deep-equal";
import throttle from "just-throttle";
import { defaultLevelVisibility } from "./level-visibility";
import {
  defaultPlaySettings,
  DEFAULT_PLAY_MODE_ZOOM,
} from "./play-mode/play-settings";
import type { Position } from "./elma-types";
import type { SelectToolState } from "./edit-mode/tools/select-tool";
import type { VertexEdgeClickBehavior } from "./edit-mode/default-level-preset";

type CreateEditorStoreOptions = {
  initialToolId?: string;
  defaultLevelTitle?: string;
  historyUpdateThrottle?: number;
};

export type PartialEditorState = Pick<
  EditorState,
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
export type TemporalEditorState = TemporalState<PartialEditorState>;
export type EditorStore = UseBoundStore<StoreApi<EditorState>> & {
  temporal: StoreApi<TemporalEditorState>;
};

export function getLevelSnapshot(
  state: Pick<
    EditorState,
    | "levelName"
    | "ground"
    | "sky"
    | "polygons"
    | "apples"
    | "killers"
    | "flowers"
    | "start"
    | "pictures"
  >,
): PartialEditorState {
  return {
    levelName: state.levelName,
    ground: state.ground,
    sky: state.sky,
    polygons: state.polygons,
    apples: state.apples,
    killers: state.killers,
    flowers: state.flowers,
    start: state.start,
    pictures: state.pictures,
  };
}

type PositionSnapshot = { x: number; y: number };
type ObjectSelectionSnapshot = PositionSnapshot & {
  kind?: "start" | "apple" | "killer" | "flower";
  index?: number;
};
type SelectionMemento = {
  selectedVertices: PositionSnapshot[];
  selectedObjects: ObjectSelectionSnapshot[];
  selectedPictures: PositionSnapshot[];
};

const DEFAULT_DOCUMENT_ORIGIN: EditorDocumentOrigin = {
  kind: "default",
  label: "Untitled",
  canOverwrite: false,
};

let nextClipboardSessionId = 1;

function createClipboardSessionId(): string {
  return `clipboard-session-${nextClipboardSessionId++}`;
}

function normalizeLevelSnapshot(
  level: PartialEditorState,
  defaultLevelTitle: string,
): PartialEditorState {
  return {
    levelName: level.levelName || defaultLevelTitle,
    ground: level.ground || "ground",
    sky: level.sky || "sky",
    polygons: level.polygons,
    apples: level.apples,
    killers: level.killers,
    flowers: level.flowers,
    start: level.start,
    pictures: level.pictures ?? [],
  };
}

function createDocumentSession(
  document: EditorDocumentInput,
  defaultLevelTitle: string,
) {
  const baselineLevel = normalizeLevelSnapshot(
    document.level,
    defaultLevelTitle,
  );
  return {
    clipboardSessionId: createClipboardSessionId(),
    baselineLevel,
    origin: document.origin,
    displayName:
      document.displayName || baselineLevel.levelName || defaultLevelTitle,
    hasExternalHandle: document.hasExternalHandle ?? false,
    pendingRecovery: document.pendingRecovery,
    dirty: false,
    saveState: "clean" as EditorDocumentSaveState,
    lastSavedAt: undefined,
    lastError: undefined,
  };
}

export function createEditorStore({
  initialToolId = "select",
  defaultLevelTitle = "Untitled",
  historyUpdateThrottle = 50,
}: CreateEditorStoreOptions = {}) {
  const emptySelectionMemento = (): SelectionMemento => ({
    selectedVertices: [],
    selectedObjects: [],
    selectedPictures: [],
  });

  const captureSelectionMemento = (state: EditorState): SelectionMemento => {
    const selection = state.actions.getToolState<SelectToolState>("select");
    const captureObjectSnapshot = (
      object: Position,
    ): ObjectSelectionSnapshot => {
      if (state.start === object) {
        return { x: object.x, y: object.y, kind: "start", index: 0 };
      }

      const appleIndex = state.apples.findIndex(
        (apple) => apple.position === object,
      );
      if (appleIndex !== -1) {
        return { x: object.x, y: object.y, kind: "apple", index: appleIndex };
      }

      const killerIndex = state.killers.findIndex(
        (killer) => killer === object,
      );
      if (killerIndex !== -1) {
        return { x: object.x, y: object.y, kind: "killer", index: killerIndex };
      }

      const flowerIndex = state.flowers.findIndex(
        (flower) => flower === object,
      );
      if (flowerIndex !== -1) {
        return { x: object.x, y: object.y, kind: "flower", index: flowerIndex };
      }

      return { x: object.x, y: object.y };
    };

    return {
      selectedVertices: (selection?.selectedVertices ?? []).map(
        ({ vertex }) => ({
          x: vertex.x,
          y: vertex.y,
        }),
      ),
      selectedObjects: (selection?.selectedObjects ?? []).map(
        captureObjectSnapshot,
      ),
      selectedPictures: (selection?.selectedPictures ?? []).map((picture) => ({
        x: picture.x,
        y: picture.y,
      })),
    };
  };

  const positionKey = ({ x, y }: PositionSnapshot) => `${x}:${y}`;

  const applySelectionMemento = (
    store: EditorStore,
    selectionMemento: SelectionMemento,
  ) => {
    const state = store.getState();
    const vertexBuckets = new Map<
      string,
      Array<{ polygon: EditorState["polygons"][number]; vertex: Position }>
    >();
    state.polygons.forEach((polygon) => {
      polygon.vertices.forEach((vertex) => {
        const key = positionKey(vertex);
        const bucket = vertexBuckets.get(key) ?? [];
        bucket.push({ polygon, vertex });
        vertexBuckets.set(key, bucket);
      });
    });

    const objectBuckets = new Map<string, Position[]>();
    const allObjects = [
      state.start,
      ...state.apples.map((apple) => apple.position),
      ...state.killers,
      ...state.flowers,
    ];
    allObjects.forEach((object) => {
      const key = positionKey(object);
      const bucket = objectBuckets.get(key) ?? [];
      bucket.push(object);
      objectBuckets.set(key, bucket);
    });
    const consumedObjects = new Set<Position>();
    const consumeObjectBucket = (key: string): Position | null => {
      const bucket = objectBuckets.get(key);
      if (!bucket || bucket.length === 0) return null;
      while (bucket.length > 0) {
        const candidate = bucket.shift() ?? null;
        if (!candidate || consumedObjects.has(candidate)) continue;
        consumedObjects.add(candidate);
        if (bucket.length === 0) {
          objectBuckets.delete(key);
        }
        return candidate;
      }
      objectBuckets.delete(key);
      return null;
    };
    const consumeObjectSnapshot = (
      snapshot: ObjectSelectionSnapshot,
    ): Position | null => {
      let candidate: Position | null = null;

      if (snapshot.kind === "start") {
        candidate = snapshot.index === 0 ? state.start : null;
      } else if (snapshot.kind === "apple") {
        candidate =
          typeof snapshot.index === "number"
            ? (state.apples[snapshot.index]?.position ?? null)
            : null;
      } else if (snapshot.kind === "killer") {
        candidate =
          typeof snapshot.index === "number"
            ? (state.killers[snapshot.index] ?? null)
            : null;
      } else if (snapshot.kind === "flower") {
        candidate =
          typeof snapshot.index === "number"
            ? (state.flowers[snapshot.index] ?? null)
            : null;
      }

      if (candidate && !consumedObjects.has(candidate)) {
        consumedObjects.add(candidate);
        return candidate;
      }

      return consumeObjectBucket(positionKey(snapshot));
    };

    const pictureBuckets = new Map<string, Position[]>();
    state.pictures.forEach((picture) => {
      const key = positionKey(picture.position);
      const bucket = pictureBuckets.get(key) ?? [];
      bucket.push(picture.position);
      pictureBuckets.set(key, bucket);
    });

    const consumeBucket = <T>(
      buckets: Map<string, T[]>,
      key: string,
    ): T | null => {
      const bucket = buckets.get(key);
      if (!bucket || bucket.length === 0) return null;
      const item = bucket.shift() ?? null;
      if (bucket.length === 0) {
        buckets.delete(key);
      }
      return item;
    };

    const selectedVertices = selectionMemento.selectedVertices
      .map((vertexSnapshot) =>
        consumeBucket(vertexBuckets, positionKey(vertexSnapshot)),
      )
      .filter(
        (
          selection,
        ): selection is {
          polygon: EditorState["polygons"][number];
          vertex: Position;
        } => Boolean(selection),
      );

    const selectedObjects = selectionMemento.selectedObjects
      .map(consumeObjectSnapshot)
      .filter((object): object is Position => Boolean(object));

    const selectedPictures = selectionMemento.selectedPictures
      .map((pictureSnapshot) =>
        consumeBucket(pictureBuckets, positionKey(pictureSnapshot)),
      )
      .filter((picture): picture is Position => Boolean(picture));

    state.actions.setToolState<SelectToolState>("select", {
      selectedVertices,
      selectedObjects,
      selectedPictures,
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
    });
  };

  const editorStore = create<EditorState>()(
    temporal(
      (set, get, store) => ({
        // Initial state - level data will be injected via constructor
        levelName: defaultLevelTitle,
        ground: "ground",
        sky: "sky",
        polygons: [],
        apples: [],
        killers: [],
        flowers: [],
        start: { x: 0, y: 0 },
        pictures: [],
        documentSession: createDocumentSession(
          {
            level: {
              levelName: defaultLevelTitle,
              ground: "ground",
              sky: "sky",
              polygons: [],
              apples: [],
              killers: [],
              flowers: [],
              start: { x: 0, y: 0 },
              pictures: [],
            },
            origin: DEFAULT_DOCUMENT_ORIGIN,
            displayName: defaultLevelTitle,
            hasExternalHandle: false,
          },
          defaultLevelTitle,
        ),

        // Editor state
        activeToolId: initialToolId,
        mousePosition: { x: 0, y: 0 },
        mouseOnCanvas: false,

        // Camera state
        viewPortOffset: { x: 0, y: 0 },
        zoom: 1,
        playModeZoom: DEFAULT_PLAY_MODE_ZOOM,

        // View settings
        animateSprites: true,
        showSprites: true,
        levelVisibility: defaultLevelVisibility,
        playSettings: defaultPlaySettings,
        vertexEdgeClickBehavior: "internal" as VertexEdgeClickBehavior,
        isUIVisible: true,
        isPlayMode: false,
        playModeSeedKeys: [],

        // Fit to view trigger
        fitToViewTrigger: 0,

        // Tool state
        toolsMap: new Map<string, Tool>(),
        toolState: {},

        // Widgets
        widgetsMap: new Map<string, Widget>(),

        // File system access
        fileSession: new FileSession(store as EditorStore),
        levelFolder: new LevelFolder(store as EditorStore),

        actions: {
          // Level data operations
          setLevelName: (name) => set({ levelName: name }),
          setGround: (ground) => set({ ground }),
          setSky: (sky) => set({ sky }),
          setStart: (position) => set({ start: position }),
          addApple: (apple) => set({ apples: [...get().apples, apple] }),
          updateApple: (values) =>
            set({
              apples: get().apples.map((apple) =>
                apple.position.x === values?.position?.x &&
                apple.position.y === values?.position?.y
                  ? { ...apple, ...values }
                  : apple,
              ),
            }),
          removeApple: (apple) =>
            set({
              apples: get().apples.filter(
                (a) =>
                  a.position.x !== apple.position.x ||
                  a.position.y !== apple.position.y,
              ),
            }),
          addKiller: (killer) => set({ killers: [...get().killers, killer] }),
          removeKiller: (killer) =>
            set({
              killers: get().killers.filter(
                (k) => k.x !== killer.x || k.y !== killer.y,
              ),
            }),
          addFlower: (flower) => set({ flowers: [...get().flowers, flower] }),
          removeFlower: (flower) =>
            set({
              flowers: get().flowers.filter(
                (f) => f.x !== flower.x || f.y !== flower.y,
              ),
            }),
          addPicture: (picture) =>
            set({ pictures: [...(get().pictures || []), picture] }),
          removePicture: (picture) =>
            set({
              pictures: (get().pictures || []).filter(
                (p) =>
                  p.position.x !== picture.position.x ||
                  p.position.y !== picture.position.y,
              ),
            }),
          setApples: (apples) => set({ apples }),
          setKillers: (killers) => set({ killers }),
          setFlowers: (flowers) => set({ flowers }),
          setPictures: (pictures) => set({ pictures }),

          setMousePosition: (position) => set({ mousePosition: position }),
          setMouseOnCanvas: (onCanvas) => set({ mouseOnCanvas: onCanvas }),
          setCamera: (x, y) => set({ viewPortOffset: { x, y } }),
          setZoom: (zoom) => set({ zoom }),
          setPlayModeZoom: (playModeZoom) => set({ playModeZoom }),
          setPolygons: (polygons) => set({ polygons }),

          // Tools
          registerTool: (tool) =>
            set((prev) => {
              const toolsMap = new Map(prev.toolsMap);
              toolsMap.set(tool.meta.id, tool);
              return { toolsMap };
            }),
          activateTool: (toolId: string, variant?: string) => {
            // Validate that toolId is registered
            const state = get();
            if (!state.toolsMap.has(toolId)) {
              console.warn(
                `Tool '${toolId}' is not registered. Available tools: ${Array.from(state.toolsMap.keys()).join(", ")}`,
              );
              return;
            }

            // Get current active tool from store and deactivate it
            const currentToolId = state.activeToolId;
            const currentTool = state.toolsMap.get(currentToolId);
            if (currentTool && currentTool.onDeactivate) {
              currentTool.onDeactivate();
            }

            // Update store with new tool
            set({ activeToolId: toolId });
            const tool = state.toolsMap.get(toolId);
            tool?.onActivate?.(variant);
          },
          getTool: <T extends Tool>(toolId: string) =>
            get().toolsMap.get(toolId) as T | undefined,
          getActiveTool: <T extends Tool>(toolId?: string) => {
            const activeTool = get().toolsMap.get(get().activeToolId) as
              | T
              | undefined;
            if (!toolId) return activeTool;
            return activeTool?.meta.id === toolId ? activeTool : undefined;
          },

          getToolState: <T extends ToolState>(toolId: string) =>
            get().toolState[toolId] as T | undefined,
          setToolState: <T extends ToolState>(
            toolId: string,
            state: Partial<T>,
          ) =>
            set((prev) => ({
              toolState: {
                ...prev.toolState,
                [toolId]: { ...(prev.toolState[toolId] as T), ...state },
              },
            })),

          // Widgets
          registerWidget: (widget: Widget) =>
            set((prev) => {
              const widgetsMap = new Map(prev.widgetsMap);
              widgetsMap.set(widget.id, widget);
              return { widgetsMap };
            }),
          activateWidget: (widgetId: string) => {
            const state = get();
            const widget = state.widgetsMap.get(widgetId);
            if (!widget) {
              console.warn(
                `Widget '${widgetId}' is not registered. Available widgets: ${Array.from(state.widgetsMap.keys()).join(", ")}`,
              );
              return;
            }
            widget.onActivate?.();
          },
          deactivateWidget: (widgetId: string) => {
            const state = get();
            const widget = state.widgetsMap.get(widgetId);
            if (!widget) {
              console.warn(
                `Widget '${widgetId}' is not registered. Available widgets: ${Array.from(state.widgetsMap.keys()).join(", ")}`,
              );
              return;
            }
            widget.onDeactivate?.();
          },

          // File system access
          setFileSession: (session) => set({ fileSession: session }),
          setLevelFolder: (folder) => set({ levelFolder: folder }),

          // View operations
          toggleAnimateSprites: () =>
            set((state) => ({ animateSprites: !state.animateSprites })),

          toggleShowSprites: () =>
            set((state) => ({ showSprites: !state.showSprites })),

          setLevelVisibility: (settings) =>
            set((state) => ({
              levelVisibility: { ...state.levelVisibility, ...settings },
            })),

          setPlaySettings: (settings) =>
            set((state) => ({
              playSettings: {
                ...state.playSettings,
                keyBindings: {
                  ...state.playSettings.keyBindings,
                  ...(settings.keyBindings ?? {}),
                },
              },
            })),

          setVertexEdgeClickBehavior: (vertexEdgeClickBehavior) =>
            set({ vertexEdgeClickBehavior }),

          toggleLevelVisibility: (key) =>
            set((state) => ({
              levelVisibility: {
                ...state.levelVisibility,
                [key]: !state.levelVisibility[key],
              },
            })),

          resetLevelVisibility: () =>
            set({ levelVisibility: defaultLevelVisibility }),

          setUIVisible: (isUIVisible) => set({ isUIVisible }),

          toggleUIVisibility: () =>
            set((state) => ({ isUIVisible: !state.isUIVisible })),

          startPlayMode: (seedKeys = []) =>
            set({ isPlayMode: true, playModeSeedKeys: seedKeys }),

          stopPlayMode: () => set({ isPlayMode: false, playModeSeedKeys: [] }),

          togglePlayMode: () =>
            set((state) => ({ isPlayMode: !state.isPlayMode })),

          replaceDocument: (document) => {
            const normalizedLevel = normalizeLevelSnapshot(
              document.level,
              defaultLevelTitle,
            );
            set({
              ...normalizedLevel,
              documentSession: createDocumentSession(
                { ...document, level: normalizedLevel },
                defaultLevelTitle,
              ),
              levelVisibility: defaultLevelVisibility,
              isPlayMode: false,
              playModeSeedKeys: [],
              mouseOnCanvas: false,
            });
            const temporal = (store as EditorStore).temporal.getState();
            temporal.clear();
          },

          markDocumentSaved: (next = {}) =>
            set((state) => ({
              documentSession: {
                ...state.documentSession,
                baselineLevel: next.baselineLevel ?? getLevelSnapshot(state),
                origin: next.origin ?? state.documentSession.origin,
                displayName:
                  next.displayName ?? state.documentSession.displayName,
                hasExternalHandle:
                  next.hasExternalHandle ??
                  state.documentSession.hasExternalHandle,
                pendingRecovery:
                  next.pendingRecovery ?? state.documentSession.pendingRecovery,
                dirty: false,
                saveState: "clean",
                lastSavedAt: Date.now(),
                lastError: undefined,
              },
            })),

          setDocumentSaveState: (saveState, lastError) =>
            set((state) => ({
              documentSession: {
                ...state.documentSession,
                saveState,
                lastError:
                  saveState === "error"
                    ? (lastError ?? "Save failed.")
                    : undefined,
              },
            })),

          triggerFitToView: () =>
            set((state) => ({
              fitToViewTrigger: state.fitToViewTrigger + 1,
            })),
        },
      }),
      {
        equality: fastDeepEqual,
        handleSet: (handleSet) => throttle(handleSet, historyUpdateThrottle),
        partialize: (state) => ({
          levelName: state.levelName,
          ground: state.ground,
          sky: state.sky,
          polygons: state.polygons,
          apples: state.apples,
          killers: state.killers,
          flowers: state.flowers,
          start: state.start,
          pictures: state.pictures,
        }),
      },
    ),
  );

  let selectionPast: SelectionMemento[] = [];
  let selectionFuture: SelectionMemento[] = [];
  let currentSelection = emptySelectionMemento();

  const temporalStore = editorStore.temporal;
  const temporalState = temporalStore.getState();
  const originalUndo = temporalState.undo;
  const originalRedo = temporalState.redo;
  const originalClear = temporalState.clear;

  temporalState.setOnSave(() => {
    selectionPast.push(currentSelection);
    selectionFuture = [];
    currentSelection = captureSelectionMemento(editorStore.getState());

    const maxPastCount = temporalStore.getState().pastStates.length;
    if (selectionPast.length > maxPastCount) {
      selectionPast = selectionPast.slice(selectionPast.length - maxPastCount);
    }
  });

  temporalStore.setState({
    undo: (steps = 1) => {
      const available = temporalStore.getState().pastStates.length;
      if (available === 0) return;
      const appliedSteps = Math.max(1, Math.min(steps, available));
      const selectionsToApply = selectionPast.splice(
        -appliedSteps,
        appliedSteps,
      );
      const nextSelection = selectionsToApply.shift();
      selectionFuture = selectionFuture.concat(
        currentSelection,
        selectionsToApply.reverse(),
      );

      originalUndo(appliedSteps);
      currentSelection = nextSelection ?? emptySelectionMemento();
      applySelectionMemento(editorStore, currentSelection);
    },
    redo: (steps = 1) => {
      const available = temporalStore.getState().futureStates.length;
      if (available === 0) return;
      const appliedSteps = Math.max(1, Math.min(steps, available));
      const selectionsToApply = selectionFuture.splice(
        -appliedSteps,
        appliedSteps,
      );
      const nextSelection = selectionsToApply.shift();
      selectionPast = selectionPast.concat(
        currentSelection,
        selectionsToApply.reverse(),
      );

      originalRedo(appliedSteps);
      currentSelection = nextSelection ?? emptySelectionMemento();
      applySelectionMemento(editorStore, currentSelection);
    },
    clear: () => {
      originalClear();
      selectionPast = [];
      selectionFuture = [];
      currentSelection = captureSelectionMemento(editorStore.getState());
    },
  });

  currentSelection = captureSelectionMemento(editorStore.getState());

  const syncDocumentSession = () => {
    const state = editorStore.getState();
    const dirty = !fastDeepEqual(
      getLevelSnapshot(state),
      state.documentSession.baselineLevel,
    );
    const currentSaveState = state.documentSession.saveState;
    const nextSaveState =
      currentSaveState === "saving" || currentSaveState === "error"
        ? currentSaveState
        : dirty
          ? "dirty"
          : "clean";

    if (
      state.documentSession.dirty === dirty &&
      state.documentSession.saveState === nextSaveState
    ) {
      return;
    }

    editorStore.setState({
      documentSession: {
        ...state.documentSession,
        dirty,
        saveState: nextSaveState,
      },
    });
  };

  editorStore.subscribe(syncDocumentSession);
  syncDocumentSession();

  return editorStore;
}
