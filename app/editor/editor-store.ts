import { objectToolIds } from "./edit-mode/tools/default-tools";
import { defaultGridSettings, normalizeGridSettings } from "./grid";
import {
  defaultPictureSelectionSettings,
  normalizePictureSelectionSettings,
} from "./helpers/picture-selection";
import {
  DEFAULT_LEVEL_TITLE,
  normalizeLevelTitle,
} from "./helpers/level-title";
import { emptyTestStarts, testStartColors } from "./test-starts";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  createEditorHistory,
  type EditorHistory,
} from "./history/editor-history";
import type {
  EditorDocumentInput,
  EditorDocumentOrigin,
  EditorDocumentSaveState,
  EditorState,
} from "./editor-state";
import type { Tool, ToolState } from "./edit-mode/tools/tool-interface";
import { FileSession } from "~/editor/helpers/file-session";
import { LevelFolder } from "~/editor/helpers/level-folder";
import fastDeepEqual from "fast-deep-equal";
import type { EditorHistoryActionKind } from "./history/editor-history-actions";
import { trackEvent, trackFirstEdit } from "~/analytics";
import { defaultLevelVisibility } from "./level-visibility";
import {
  defaultPlaySettings,
  DEFAULT_PLAY_MODE_ZOOM,
} from "./play-mode/play-settings";
import { defaultAutoGrassOptions } from "./helpers/auto-grass";
import type { SelectToolState } from "./edit-mode/tools/select-tool";
import type {
  EditorPreferences,
  VertexEdgeClickBehavior,
} from "./editor-preference-types";

type CreateEditorStoreOptions = {
  initialToolId?: string;
  defaultLevelTitle?: string;
  historyLimit?: number;
  initialPreferences?: EditorPreferences;
};

export type PartialEditorState = Pick<
  EditorState,
  | "levelName"
  | "lgr"
  | "ground"
  | "sky"
  | "polygons"
  | "apples"
  | "killers"
  | "flowers"
  | "start"
  | "pictures"
  | "top10"
>;
export type EditorStore = UseBoundStore<StoreApi<EditorState>> & {
  history: EditorHistory;
};

export function getLevelSnapshot(
  state: Pick<
    EditorState,
    | "levelName"
    | "lgr"
    | "ground"
    | "sky"
    | "polygons"
    | "apples"
    | "killers"
    | "flowers"
    | "start"
    | "pictures"
    | "top10"
  >,
): PartialEditorState {
  return {
    levelName: state.levelName,
    lgr: state.lgr,
    ground: state.ground,
    sky: state.sky,
    polygons: state.polygons,
    apples: state.apples,
    killers: state.killers,
    flowers: state.flowers,
    start: state.start,
    pictures: state.pictures,
    top10: state.top10,
  };
}

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
    lgr: level.lgr || "default",
    ground: level.ground || "ground",
    sky: level.sky || "sky",
    polygons: level.polygons,
    apples: level.apples,
    killers: level.killers,
    flowers: level.flowers,
    start: level.start,
    pictures: level.pictures ?? [],
    top10: level.top10,
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
  defaultLevelTitle = DEFAULT_LEVEL_TITLE,
  historyLimit,
  initialPreferences,
}: CreateEditorStoreOptions = {}) {
  defaultLevelTitle =
    normalizeLevelTitle(
      initialPreferences?.defaultLevelTitle ?? defaultLevelTitle,
    ) || DEFAULT_LEVEL_TITLE;

  let internalStore!: StoreApi<EditorState>;
  const editorStore = create<EditorState>()((set, get, store) => {
    internalStore = store;
    return {
      // Initial state - level data will be injected via constructor
      testStarts: emptyTestStarts(),
      testStartRename: null,
      testStartMenu: null,
      levelName: defaultLevelTitle,
      lgr: "default",
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
            lgr: "default",
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

      referenceImages: [],

      // Editor state
      topologyInspection: null,
      activeToolId: initialToolId,
      openToolMenuId: null,
      mousePosition: { x: 0, y: 0 },
      mouseOnCanvas: false,

      // Camera state
      viewPortOffset: { x: 0, y: 0 },
      zoom: 1,
      playModeZoom: initialPreferences?.playModeZoom ?? DEFAULT_PLAY_MODE_ZOOM,

      defaultLevelTitle,
      checkTopologyOnSave: initialPreferences?.checkTopologyOnSave ?? false,

      grid: normalizeGridSettings(
        initialPreferences?.grid ?? defaultGridSettings,
      ),
      gridSnapBypassed: false,
      customShapes: initialPreferences?.customShapes ?? [],

      // View settings
      animateSprites: initialPreferences?.animateSprites ?? true,
      showSprites: true,
      levelVisibility:
        initialPreferences?.levelVisibility ?? defaultLevelVisibility,
      playSettings: initialPreferences?.playSettings ?? defaultPlaySettings,
      pictureSelection: initialPreferences?.pictureSelection
        ? normalizePictureSelectionSettings(initialPreferences.pictureSelection)
        : defaultPictureSelectionSettings,
      vertexEdgeClickBehavior:
        initialPreferences?.vertexEdgeClickBehavior ??
        ("default" as VertexEdgeClickBehavior),
      autoGrassOptions:
        initialPreferences?.autoGrassOptions ?? defaultAutoGrassOptions,
      isUIVisible: initialPreferences?.isUIVisible ?? true,
      isPlayMode: false,
      playModeSeedKeys: [],

      // Fit to view trigger
      fitToViewTrigger: 0,

      // Tool state
      toolsMap: new Map<string, Tool>(),
      toolState: {},

      // File system access
      fileSession: new FileSession(store as EditorStore),
      levelFolder: new LevelFolder(store as EditorStore),

      actions: {
        setCheckTopologyOnSave: (checkTopologyOnSave) =>
          set({ checkTopologyOnSave }),
        setCustomShapes: (customShapes) => set({ customShapes }),
        // Level data operations
        setDefaultLevelTitle: (title) =>
          set({ defaultLevelTitle: normalizeLevelTitle(title) }),
        setLevelName: (name) => set({ levelName: normalizeLevelTitle(name) }),
        setLgr: (lgr) => set({ lgr }),
        setGround: (ground) => set({ ground }),
        setSky: (sky) => set({ sky }),
        addTestStart: (position, ride, options) =>
          set((state) => {
            const session = state.testStarts;
            const number = session.nextNumber;
            const item = {
              id: crypto.randomUUID(),
              name: `Test start ${number}`,
              ride,
              position: { ...position },
              color: testStartColors[(number - 1) % testStartColors.length],
            };
            return {
              testStarts: {
                ...session,
                items: [...session.items, item],
                activeId: item.id,
                nextNumber: number + 1,
              },
              testStartMenu: null,
              ...(options?.select
                ? {
                    toolState: {
                      ...state.toolState,
                      select: {
                        ...(state.toolState.select as SelectToolState),
                        selectedVertices: [],
                        selectedObjects: [item.position],
                        selectedPictures: [],
                        isDragging: false,
                        isMarqueeSelecting: false,
                        transformMode: false,
                        skewMode: false,
                        hoveredObject: undefined,
                        hoveredPictureBounds: undefined,
                        contextMenuType: undefined,
                        contextMenuPosition: undefined,
                      },
                    },
                  }
                : {}),
            };
          }),
        moveTestStart: (id, position) =>
          set((state) => ({
            testStarts: {
              ...state.testStarts,
              items: state.testStarts.items.map((item) =>
                item.id === id ? { ...item, position, ride: undefined } : item,
              ),
            },
          })),
        renameTestStart: (id, name) => {
          const trimmedName = name.trim();
          if (!trimmedName) return;
          set((state) => ({
            testStarts: {
              ...state.testStarts,
              ...(id === null
                ? { levelName: trimmedName }
                : {
                    items: state.testStarts.items.map((item) =>
                      item.id === id ? { ...item, name: trimmedName } : item,
                    ),
                  }),
            },
          }));
        },
        activateTestStart: (id) =>
          set((state) => ({
            testStarts: {
              ...state.testStarts,
              activeId: state.testStarts.items.some((item) => item.id === id)
                ? id
                : null,
            },
            testStartMenu: null,
          })),
        deleteTestStart: (id) =>
          set((state) => ({
            testStarts: {
              ...state.testStarts,
              items: state.testStarts.items.filter((item) => item.id !== id),
              activeId:
                state.testStarts.activeId === id
                  ? null
                  : state.testStarts.activeId,
            },
            testStartMenu: null,
          })),
        promoteTestStart: (id) => {
          const state = get();
          const item = state.testStarts.items.find((item) => item.id === id);
          if (!item) return;
          const before = state.testStarts;
          const after = {
            ...before,
            activeId: null,
            levelName: item.name,
            items: before.items.map((candidate) =>
              candidate.id === id
                ? {
                    ...candidate,
                    position: { ...state.start },
                    name: before.levelName,
                    ride: undefined,
                  }
                : candidate,
            ),
          };
          set({
            start: { ...item.position },
            testStarts: after,
            testStartMenu: null,
          });
        },
        addReferenceImage: (image) =>
          set((state) => ({
            referenceImages: [...state.referenceImages, image],
          })),
        updateReferenceImage: (id, patch) =>
          set((state) => {
            const image = state.referenceImages.find(
              (image) => image.id === id,
            );
            if (!image) return state;
            const nextImage = { ...image, ...patch };
            const select = state.toolState.select as
              | SelectToolState
              | undefined;
            const selectedObjects = select?.selectedObjects.map((object) =>
              object === image.position ? nextImage.position : object,
            );
            return {
              referenceImages: state.referenceImages.map((candidate) =>
                candidate === image ? nextImage : candidate,
              ),
              ...(select && selectedObjects
                ? {
                    toolState: {
                      ...state.toolState,
                      select: {
                        ...select,
                        selectedObjects,
                        hoveredObject:
                          select.hoveredObject === image.position
                            ? nextImage.position
                            : select.hoveredObject,
                      },
                    },
                  }
                : {}),
            };
          }),
        removeReferenceImage: (id) =>
          set((state) => {
            return {
              referenceImages: state.referenceImages.filter(
                (image) => image.id !== id,
              ),
            };
          }),
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
        setTopologyInspection: (topologyInspection) =>
          set({ topologyInspection }),
        setPolygons: (polygons) => set({ polygons }),

        // Tools
        setToolMenuOpen: (open, menuId) => {
          const state = get();
          const tool = state.toolsMap.get(state.activeToolId);
          set({
            openToolMenuId:
              open && (menuId || tool?.meta.menuBehavior)
                ? (menuId ?? state.activeToolId)
                : null,
          });
        },
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
          set({
            activeToolId: toolId,
            openToolMenuId:
              state.openToolMenuId === "apple" && objectToolIds.includes(toolId)
                ? "apple"
                : null,
          });
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
              runEndBehavior:
                settings.runEndBehavior ?? state.playSettings.runEndBehavior,
              keyBindings: {
                ...state.playSettings.keyBindings,
                ...(settings.keyBindings ?? {}),
              },
            },
          })),

        setPictureSelection: (settings) =>
          set((state) => ({
            pictureSelection: normalizePictureSelectionSettings({
              ...state.pictureSelection,
              ...settings,
            }),
          })),
        setVertexEdgeClickBehavior: (vertexEdgeClickBehavior) =>
          set({ vertexEdgeClickBehavior }),

        setGrid: (settings) =>
          set((state) => ({
            grid: normalizeGridSettings({ ...state.grid, ...settings }),
          })),
        setGridSnapBypassed: (gridSnapBypassed) => {
          if (get().gridSnapBypassed !== gridSnapBypassed)
            set({ gridSnapBypassed });
        },

        setAutoGrassOptions: (options) =>
          set((state) => ({
            autoGrassOptions: { ...state.autoGrassOptions, ...options },
          })),

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
          (store as EditorStore).history.cancelActive();
          get().actions.getActiveTool()?.clear?.();
          const defaultLevelTitle =
            get().defaultLevelTitle || DEFAULT_LEVEL_TITLE;
          const normalizedLevel = normalizeLevelSnapshot(
            document.level,
            defaultLevelTitle,
          );
          set({
            referenceImages: [],
            ...normalizedLevel,
            testStarts: emptyTestStarts(),
            testStartRename: null,
            testStartMenu: null,
            topologyInspection: null,
            documentSession: createDocumentSession(
              { ...document, level: normalizedLevel },
              defaultLevelTitle,
            ),
            isPlayMode: false,
            playModeSeedKeys: [],
            mouseOnCanvas: false,
          });
          get().actions.setToolState("select", {
            selectedVertices: [],
            selectedObjects: [],
            selectedPictures: [],
          });
          (store as EditorStore).history.clear();
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
    };
  }) as EditorStore;
  const { history, record } = createEditorHistory(editorStore, historyLimit);
  editorStore.history = history;
  Object.assign(internalStore, { history: editorStore.history });

  // Domain actions are undoable by default. Compound edits join the active
  // transaction; UI/session plumbing never enters document history.
  const historyActions = {
    setLevelName: "level.rename",
    setLgr: "texture.change-lgr",
    setGround: "texture.change-ground",
    setSky: "texture.change-sky",
    addTestStart: "test-start.add",
    moveTestStart: "test-start.move",
    renameTestStart: "test-start.rename",
    activateTestStart: "test-start.activate",
    deleteTestStart: "test-start.delete",
    promoteTestStart: "test-start.promote",
    addReferenceImage: "reference-image.import",
    updateReferenceImage: "reference-image.edit",
    removeReferenceImage: "reference-image.delete",
    setStart: "start.move",
    addApple: "apple.add",
    updateApple: "apple.edit",
    removeApple: "apple.delete",
    addKiller: "killer.add",
    removeKiller: "killer.delete",
    addFlower: "flower.add",
    removeFlower: "flower.delete",
    addPicture: "picture.add",
    removePicture: "picture.delete",
    setApples: "apples.edit",
    setKillers: "killers.edit",
    setFlowers: "flowers.edit",
    setPictures: "pictures.edit",
    setPolygons: "polygons.edit",
  } satisfies Partial<
    Record<keyof EditorState["actions"], EditorHistoryActionKind>
  >;
  const actions = { ...editorStore.getState().actions };
  for (const key of Object.keys(
    historyActions,
  ) as (keyof typeof historyActions)[]) {
    const mutate = actions[key] as (...args: unknown[]) => unknown;
    Object.assign(actions, {
      [key]: (...args: unknown[]) =>
        record({ kind: historyActions[key] }, () => mutate(...args)),
    });
  }
  editorStore.setState({ actions });

  const syncDocumentSession = () => {
    const state = editorStore.getState();
    const dirty = !fastDeepEqual(
      getLevelSnapshot(state),
      state.documentSession.baselineLevel,
    );
    if (dirty) trackFirstEdit();
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
  editorStore.subscribe((state, previous) => {
    if (state.isPlayMode && !previous.isPlayMode) {
      trackEvent("playtest_started");
    }
  });
  syncDocumentSession();

  return editorStore;
}
