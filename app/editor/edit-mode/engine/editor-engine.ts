import { activeTestStart } from "~/editor/test-starts";
import { goToTestStart } from "~/editor/helpers/test-start-navigation";
import {
  getSessionArtifacts,
  findSessionArtifact,
} from "~/editor/session-artifacts";
import { calculateBoundingBox } from "~/editor/helpers/level-helpers";
import {
  ImageExport,
  type ImageExportOptions,
} from "~/editor/helpers/image-export";
import { getTopologyOverlays } from "../scene/topology-overlays";
import { DEFAULT_LEVEL_TITLE } from "~/editor/helpers/level-title";
import { type EditorState } from "~/editor/editor-state";
import {
  getEventContext,
  isUserTyping,
  type EventContext,
} from "~/editor/helpers/event-handler";
import {
  updateCamera,
  updateZoom,
  fitToView,
} from "~/editor/helpers/camera-helpers";
import {
  OBJECT_DIAMETER,
  uiColors,
  uiSelectionHandle,
  uiStrokeWidths,
  selectionThresholds,
} from "~/editor/constants";
import type {
  Tool,
  PlacementPropertiesMenuState,
} from "~/editor/edit-mode/tools/tool-interface";
import { createEditorStore, type EditorStore } from "~/editor/editor-store";
import type { DefaultLevelPreset } from "~/editor/helpers/level-parser";
import { LgrAssets } from "~/components/lgr-assets";
import {
  screenToWorld,
  worldToScreen,
} from "~/editor/helpers/coordinate-helpers";
import { Clip, type Picture, type Position } from "~/editor/elma-types";
import { getDefaultLevel } from "~/editor/helpers/level-parser";
import { checkModifierKey } from "~/utils/misc";
import {
  SelectTool,
  type SelectToolState,
} from "~/editor/edit-mode/tools/select-tool";
import {
  VertexTool,
  type VertexToolState,
  type VertexToolVariant,
} from "~/editor/edit-mode/tools/vertex-tool";
import { defaultTools } from "~/editor/edit-mode/tools/default-tools";
import type { EditorDocumentInput } from "~/editor/editor-state";
import { buildEditorWorldScene } from "~/editor/edit-mode/scene/editor-scene-builder";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";
import {
  getPictureWorldDimensions,
  getPictureWorldOutlineSegments,
  isWorldPointInPictureVisiblePixel,
} from "~/editor/render/picture-metrics";
import {
  createWorldSceneRenderer,
  type WorldSceneRendererBackend,
  type WorldSceneRenderer,
} from "~/editor/render/world-scene-renderer";
import {
  isPictureVisible,
  isPointVisible,
} from "~/editor/render/world-derived-data-cache";
import { getViewportWorldRectFromOffset } from "~/editor/render/world-geometry";
import {
  findObjectNearPosition,
  findPolygonEdgeNearPosition,
  findVertexNearPosition,
  isStartObjectHit,
} from "~/editor/helpers/selection-helpers";
import { isWorldPointInGroundRegion } from "~/editor/helpers/polygon-helpers";
import type { Polygon } from "~/editor/elma-types";
import { DEFAULT_OBJECT_RENDER_DISTANCE } from "~/editor/render/render-constants";

type EditorEngineOptions = {
  initialDocument?: EditorDocumentInput;
  initialToolId?: string;
  defaultLevelPreset?: DefaultLevelPreset;
  readOnly?: boolean;
  tools?: Array<new (store: EditorStore) => Tool>;
  minZoom?: number;
  maxZoom?: number;
  panSpeed?: number;
  zoomStep?: number;
  touchpadStep?: number;
  wheelStep?: number;
  pinchPower?: number;
  store?: EditorStore;
  lgrAssets?: LgrAssets;
  rendererBackend?: WorldSceneRendererBackend;
};

const KEYBOARD_PAN_STEP = 200;
const KEYBOARD_ZOOM_STEP_DIVISOR = 100;
const WHEEL_PAN_MULTIPLIER = 0.5;
const TOUCH_CONTEXT_MENU_DELAY_MS = 500;
const TOUCH_CONTEXT_MENU_MOVE_TOLERANCE_PX = 8;

type CachedLongestGrassEdge = {
  vertices: Polygon["vertices"];
  edgeIndex: number;
};

const longestGrassEdgeCache = new WeakMap<Polygon, CachedLongestGrassEdge>();

function getLongestGrassEdgeIndex(polygon: Polygon): number {
  const cached = longestGrassEdgeCache.get(polygon);
  if (cached && cached.vertices === polygon.vertices) {
    return cached.edgeIndex;
  }

  const n = polygon.vertices.length;
  if (n < 2) {
    return -1;
  }

  let longestEdgeIndex = -1;
  let longestEdgeLengthSquared = -1;
  for (let i = 0; i < n; i += 1) {
    const from = polygon.vertices[i];
    const to = polygon.vertices[(i + 1) % n];
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    if (lengthSquared > longestEdgeLengthSquared) {
      longestEdgeLengthSquared = lengthSquared;
      longestEdgeIndex = i;
    }
  }

  longestGrassEdgeCache.set(polygon, {
    vertices: polygon.vertices,
    edgeIndex: longestEdgeIndex,
  });
  return longestEdgeIndex;
}

export class EditorEngine {
  private canvas: HTMLCanvasElement;
  private worldRenderer: WorldSceneRenderer;
  private animationId: number | null = null;
  private needsRender = true;
  private debugMode = false;
  private store: EditorStore;
  private lgrAssets: LgrAssets;
  private currentCursor: string | null = null;
  private unsubscribeStore?: () => void;

  // Camera system
  private minZoom;
  private maxZoom;
  private panSpeed;
  private zoomStep;
  private touchpadStep;
  private wheelStep;
  private pinchPower;

  // Navigation state
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private pinchDistance: number | null = null;
  private pinchCenter: { x: number; y: number } | null = null;
  private activeTouchToolPointerId: number | null = null;
  private touchPointers = new Map<number, { x: number; y: number }>();
  private touchContextMenuTimer: number | null = null;
  private touchContextMenuPointerId: number | null = null;
  private touchContextMenuStart: { x: number; y: number } | null = null;
  private modifierPressed = false;
  private pressedKeys = new Set<string>();
  private handleWindowBlur = () => {
    this.store.getState().actions.setGridSnapBypassed(false);
    this.pressedKeys.clear();
    this.updateModifierPressed(false);
    this.cancelTouchContextMenuTimer();
  };

  constructor(
    canvas: HTMLCanvasElement,
    {
      initialDocument,
      initialToolId = "select",
      defaultLevelPreset = "default",
      readOnly = false,
      tools = [],
      minZoom = 0.2,
      maxZoom = 10000,
      panSpeed = 1.0,
      zoomStep = 20,
      touchpadStep = 100,
      wheelStep = 420,
      pinchPower = 1,
      store,
      lgrAssets,
      rendererBackend = "webgl",
    }: EditorEngineOptions = {},
  ) {
    this.lgrAssets = lgrAssets || new LgrAssets();
    const worldRenderer = createWorldSceneRenderer({
      canvas,
      lgrAssets: this.lgrAssets,
      backend: rendererBackend,
    });

    this.canvas = canvas;
    this.worldRenderer = worldRenderer;

    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.panSpeed = panSpeed;
    this.zoomStep = zoomStep;
    this.touchpadStep = touchpadStep;
    this.wheelStep = wheelStep;
    this.pinchPower = pinchPower;

    if (!this.lgrAssets.isReady()) {
      void this.lgrAssets.load().then(() => {
        this.requestRender();
      });
    }

    this.store = store || createEditorStore();
    const state = this.store.getState();
    const title = state.defaultLevelTitle || DEFAULT_LEVEL_TITLE;
    const resolvedInitialDocument = initialDocument ?? {
      level: getDefaultLevel(defaultLevelPreset, undefined, title),
      origin: { kind: "default", label: title, canOverwrite: false },
      displayName: title,
      hasExternalHandle: false,
    };

    tools.forEach((ToolConstructor) => {
      const tool = new ToolConstructor(this.store);
      if (tool instanceof SelectTool) {
        tool.setPictureDimensionsResolver((picture) =>
          getPictureWorldDimensions(picture, this.lgrAssets),
        );
      }
      state.actions.registerTool(tool);
    });
    if (tools.length > 0) {
      state.actions.activateTool(initialToolId);
    }

    if (!readOnly) {
      this.setupEventListeners();
    }
    this.setupStoreListeners();

    // Initialize with level data
    state.actions.replaceDocument(resolvedInitialDocument);
    this.startRenderLoop();
    this.fitToView();
    this.updateCanvasCursor();
  }

  // Expose store for React integration
  getStore(): EditorStore {
    return this.store;
  }

  private setupEventListeners() {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown, {
      passive: false,
    });
    this.canvas.addEventListener("pointermove", this.handlePointerMove, {
      passive: false,
    });
    this.canvas.addEventListener("pointerup", this.handlePointerUp, {
      passive: false,
    });
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel, {
      passive: false,
    });
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("contextmenu", this.handleRightClick);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("resize", this.handleResize);
  }

  private startPanning(clientX: number, clientY: number) {
    this.isPanning = true;
    this.lastPanX = clientX;
    this.lastPanY = clientY;
  }

  private trySetPointerCapture(pointerId: number) {
    if (this.canvas.hasPointerCapture(pointerId)) return;
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // Pointer may already be released by the browser.
    }
  }

  private tryReleasePointerCapture(pointerId: number) {
    if (!this.canvas.hasPointerCapture(pointerId)) return;
    try {
      this.canvas.releasePointerCapture(pointerId);
    } catch {
      // Ignore release races.
    }
  }

  private dispatchToolPointerEvent(
    phase: "down" | "move" | "up",
    event: PointerEvent,
  ) {
    const state = this.store.getState();
    const context = getEventContext(
      event as unknown as MouseEvent,
      this.canvas,
      state.viewPortOffset,
      state.zoom,
    );
    this.store.getState().actions.setGridSnapBypassed(event.altKey);
    this.updateModifierPressed(checkModifierKey(event));
    const forceObjectSelection = event.shiftKey || event.altKey;
    const activeTool = state.actions.getActiveTool();
    this.updateSelectHoverState(state, context.worldPos, forceObjectSelection);

    if (phase === "down") {
      activeTool?.onPointerDown?.(event, context);
      state.actions.setMousePosition(context.worldPos);
      state.actions.setMouseOnCanvas(true);
      this.updateCanvasCursor(context);
      return;
    }

    if (phase === "move") {
      activeTool?.onPointerMove?.(event, context);
      state.actions.setMousePosition(context.worldPos);
      state.actions.setMouseOnCanvas(true);
      this.updateCanvasCursor(context);
      return;
    }

    activeTool?.onPointerUp?.(event, context);
    this.updateCanvasCursor(context);
  }

  private setCanvasCursor(cursor: string) {
    if (this.currentCursor === cursor) return;
    this.currentCursor = cursor;
    this.canvas.style.cursor = cursor;
  }

  private getMouseEventContext(state: EditorState): EventContext {
    const screenPos = worldToScreen(
      state.mousePosition,
      state.viewPortOffset,
      state.zoom,
    );
    return {
      worldPos: state.mousePosition,
      screenX: screenPos.x,
      screenY: screenPos.y,
    };
  }

  private updateCanvasCursor(context?: EventContext): void {
    const state = this.store.getState();
    if (!state.mouseOnCanvas) {
      this.setCanvasCursor("");
      return;
    }

    const activeTool = state.actions.getActiveTool();
    if (!activeTool) {
      this.setCanvasCursor("");
      return;
    }

    const resolvedContext = context ?? this.getMouseEventContext(state);
    const cursor = activeTool.getCursor?.(resolvedContext)?.trim();
    this.setCanvasCursor(cursor || "");
  }

  private getTouchPinchState() {
    if (this.touchPointers.size < 2) return null;

    const [first, second] = Array.from(this.touchPointers.values());
    const pointA = this.getCanvasPoint(first.x, first.y);
    const pointB = this.getCanvasPoint(second.x, second.y);

    return {
      center: {
        x: (pointA.x + pointB.x) / 2,
        y: (pointA.y + pointB.y) / 2,
      },
      distance: Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y),
    };
  }

  private createSyntheticTouchPointerEvent(
    pointerId: number,
    clientX: number,
    clientY: number,
  ): PointerEvent {
    return {
      pointerId,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX,
      clientY,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
    } as PointerEvent;
  }

  private endActiveTouchToolInteraction() {
    if (this.activeTouchToolPointerId === null) return;

    const state = this.store.getState();
    if (
      state.activeToolId === "vertex" &&
      state.actions.getToolState<VertexToolState>("vertex")?.variant ===
        "cutConnect"
    ) {
      // A second finger begins a camera gesture, rather than applying a stroke.
      state.actions.getActiveTool()?.clear?.();
      this.activeTouchToolPointerId = null;
      return;
    }

    const pointerPos = this.touchPointers.get(this.activeTouchToolPointerId);
    if (pointerPos) {
      const syntheticEvent = this.createSyntheticTouchPointerEvent(
        this.activeTouchToolPointerId,
        pointerPos.x,
        pointerPos.y,
      );
      this.dispatchToolPointerEvent("up", syntheticEvent);
    }

    this.activeTouchToolPointerId = null;
  }

  private cancelTouchContextMenuTimer() {
    if (this.touchContextMenuTimer !== null) {
      window.clearTimeout(this.touchContextMenuTimer);
    }
    this.touchContextMenuTimer = null;
    this.touchContextMenuPointerId = null;
    this.touchContextMenuStart = null;
  }

  private scheduleTouchContextMenu(event: PointerEvent) {
    this.cancelTouchContextMenuTimer();

    this.touchContextMenuPointerId = event.pointerId;
    this.touchContextMenuStart = { x: event.clientX, y: event.clientY };
    this.touchContextMenuTimer = window.setTimeout(() => {
      if (this.touchContextMenuPointerId !== event.pointerId) return;
      if (!this.touchPointers.has(event.pointerId)) return;

      this.endActiveTouchToolInteraction();
      this.cancelTouchContextMenuTimer();

      const contextMenuEvent = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      });
      this.openActiveToolContextMenu(contextMenuEvent);
    }, TOUCH_CONTEXT_MENU_DELAY_MS);
  }

  private cancelTouchContextMenuIfMoved(event: PointerEvent) {
    if (
      this.touchContextMenuPointerId !== event.pointerId ||
      !this.touchContextMenuStart
    ) {
      return;
    }

    const deltaX = event.clientX - this.touchContextMenuStart.x;
    const deltaY = event.clientY - this.touchContextMenuStart.y;
    if (Math.hypot(deltaX, deltaY) > TOUCH_CONTEXT_MENU_MOVE_TOLERANCE_PX) {
      this.cancelTouchContextMenuTimer();
    }
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.store.setState({ testStartMenu: null, openToolMenuId: null });
    if (event.pointerType === "touch") {
      event.preventDefault();
      this.trySetPointerCapture(event.pointerId);
      this.touchPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      const pinch = this.getTouchPinchState();
      if (pinch) {
        this.cancelTouchContextMenuTimer();
        this.endActiveTouchToolInteraction();
        this.pinchDistance = pinch.distance;
        this.pinchCenter = pinch.center;
        return;
      }

      this.resetPinchState();
      this.activeTouchToolPointerId = event.pointerId;
      this.dispatchToolPointerEvent("down", event);
      this.scheduleTouchContextMenu(event);
      return;
    }

    if (event.button === 1) {
      event.preventDefault();
      this.trySetPointerCapture(event.pointerId);
      this.store.getState().actions.setMouseOnCanvas(true);
      this.startPanning(event.clientX, event.clientY);
      this.updateCanvasCursor();
      return;
    }

    if (event.button === 0) {
      this.trySetPointerCapture(event.pointerId);
      this.dispatchToolPointerEvent("down", event);
    }
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      if (!this.touchPointers.has(event.pointerId)) return;

      event.preventDefault();
      this.touchPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      this.cancelTouchContextMenuIfMoved(event);

      const pinch = this.getTouchPinchState();
      if (pinch) {
        this.cancelTouchContextMenuTimer();
        this.endActiveTouchToolInteraction();
        const previousCenter = this.pinchCenter;
        const previousDistance = this.pinchDistance;

        if (previousCenter) {
          const state = this.store.getState();
          updateCamera({
            deltaX: pinch.center.x - previousCenter.x,
            deltaY: pinch.center.y - previousCenter.y,
            currentOffset: state.viewPortOffset,
            setCamera: state.actions.setCamera,
            panSpeed: this.panSpeed,
          });
        }

        if (previousDistance && previousDistance > 0) {
          const state = this.store.getState();
          const rawZoomFactor = pinch.distance / previousDistance;
          const zoomFactor = Math.pow(rawZoomFactor, this.pinchPower);
          this.zoomAtAnchor(state.zoom * zoomFactor, pinch.center);
        }

        this.pinchDistance = pinch.distance;
        this.pinchCenter = pinch.center;
        return;
      }

      this.resetPinchState();
      if (this.activeTouchToolPointerId === event.pointerId) {
        this.dispatchToolPointerEvent("move", event);
      }
      return;
    }

    const state = this.store.getState();
    if (this.isPanning) {
      const deltaX = event.clientX - this.lastPanX;
      const deltaY = event.clientY - this.lastPanY;
      updateCamera({
        deltaX,
        deltaY,
        currentOffset: state.viewPortOffset,
        setCamera: state.actions.setCamera,
        panSpeed: this.panSpeed,
      });
      this.lastPanX = event.clientX;
      this.lastPanY = event.clientY;
      this.updateCanvasCursor();
      return;
    }

    this.dispatchToolPointerEvent("move", event);
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      this.cancelTouchContextMenuTimer();
      this.touchPointers.delete(event.pointerId);

      if (this.activeTouchToolPointerId === event.pointerId) {
        this.dispatchToolPointerEvent("up", event);
        this.activeTouchToolPointerId = null;
      }

      if (this.touchPointers.size < 2) {
        this.resetPinchState();
      }
      if (this.touchPointers.size === 0) {
        this.store.getState().actions.setMouseOnCanvas(false);
        this.updateCanvasCursor();
      }

      this.tryReleasePointerCapture(event.pointerId);
      return;
    }

    if (event.button === 1) {
      this.isPanning = false;
      this.tryReleasePointerCapture(event.pointerId);
      this.updateCanvasCursor();
      return;
    }

    if (event.button === 0) {
      this.dispatchToolPointerEvent("up", event);
      this.tryReleasePointerCapture(event.pointerId);
    }
  };

  private handlePointerCancel = (event: PointerEvent) => {
    const activeTool = this.store.getState().actions.getActiveTool();
    if (
      activeTool instanceof VertexTool &&
      this.store.getState().actions.getToolState<VertexToolState>("vertex")
        ?.variant === "cutConnect"
    ) {
      activeTool.clear();
    }
    if (event.pointerType === "touch") {
      this.cancelTouchContextMenuTimer();
      this.touchPointers.delete(event.pointerId);

      if (this.activeTouchToolPointerId === event.pointerId) {
        this.dispatchToolPointerEvent("up", event);
        this.activeTouchToolPointerId = null;
      }

      if (this.touchPointers.size < 2) {
        this.resetPinchState();
      }
      if (this.touchPointers.size === 0) {
        this.store.getState().actions.setMouseOnCanvas(false);
        this.updateCanvasCursor();
      }
    } else if (
      this.store.getState().actions.getActiveTool() instanceof SelectTool ||
      this.store.getState().actions.getActiveTool() instanceof VertexTool
    ) {
      this.dispatchToolPointerEvent("up", event);
    }

    this.isPanning = false;
    this.tryReleasePointerCapture(event.pointerId);
    this.updateCanvasCursor();
  };

  private handlePointerLeave = () => {
    this.cancelTouchContextMenuTimer();
    const state = this.store.getState();
    state.actions.setMouseOnCanvas(false);
    this.clearSelectHoverState(state);
    this.updateCanvasCursor();
  };

  private handleRightClick = (event: MouseEvent) => {
    event.preventDefault();
    this.openActiveToolContextMenu(event);
  };

  private openActiveToolContextMenu(event: MouseEvent) {
    const state = this.store.getState();
    const context = getEventContext(
      event,
      this.canvas,
      state.viewPortOffset,
      state.zoom,
    );
    const openTestStartMenu = (id?: string | null, selectionMenu = false) => {
      if (!selectionMenu)
        state.actions.getTool<SelectTool>("select")?.closeContextMenu();
      this.store.setState({
        testStartMenu: {
          x: event.clientX,
          y: event.clientY,
          position: context.worldPos,
          selectionMenu,
          ...(id !== undefined ? { id } : {}),
        },
      });
    };
    this.updateSelectHoverState(state, context.worldPos);
    const hoveredObject = this.store
      .getState()
      .actions.getToolState<SelectToolState>("select")?.hoveredObject;
    const test = state.testStarts.items.find(
      (item) => item.position === hoveredObject,
    );
    const levelHit = hoveredObject === state.start;

    const activeTool = this.store.getState().actions.getActiveTool();
    if (activeTool?.onRightClick) {
      const consumed = activeTool.onRightClick(event, context);
      if (consumed) {
        if (state.activeToolId === "select")
          openTestStartMenu(test?.id ?? (levelHit ? null : undefined), true);
        return;
      }
    }
    // Let selection resolve objects, pictures, and terrain before treating the
    // canvas as empty space for a new test start.
    if (state.activeToolId === "select")
      openTestStartMenu(levelHit ? null : undefined);
  }

  private getCanvasPoint(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private getCurrentMouseScreenPoint(state: EditorState) {
    return worldToScreen(state.mousePosition, state.viewPortOffset, state.zoom);
  }

  private getKeyboardEventContext(state: EditorState): EventContext {
    const screenPoint = {
      x: this.canvas.width / 2,
      y: this.canvas.height / 2,
    };
    const worldPos = screenToWorld(
      screenPoint,
      state.viewPortOffset,
      state.zoom,
    );

    return {
      worldPos,
      screenX: screenPoint.x,
      screenY: screenPoint.y,
    };
  }

  private syncMousePositionFromScreenPoint(screenPoint: Position) {
    const state = this.store.getState();
    const worldPos = screenToWorld(
      screenPoint,
      state.viewPortOffset,
      state.zoom,
    );

    state.actions.setMousePosition(worldPos);
    state.actions.setMouseOnCanvas(true);
    this.updateSelectHoverState(state, worldPos);
    this.updateCanvasCursor({
      worldPos,
      screenX: screenPoint.x,
      screenY: screenPoint.y,
    });
  }

  private zoomAtAnchor(newZoom: number, anchor: { x: number; y: number }) {
    const state = this.store.getState();
    updateZoom({
      newZoom,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      currentZoom: state.zoom,
      setZoom: state.actions.setZoom,
      anchor,
      currentOffset: state.viewPortOffset,
      setCamera: state.actions.setCamera,
    });
  }

  private resetPinchState() {
    this.pinchDistance = null;
    this.pinchCenter = null;
  }

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const state = this.store.getState();
    const screenPoint = this.getCanvasPoint(event.clientX, event.clientY);
    const { x: mouseX, y: mouseY } = screenPoint;

    const modifier = checkModifierKey(event);
    const isLikelyPinchWheel =
      event.ctrlKey && event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
    if (modifier || isLikelyPinchWheel) {
      const zoomStepValue = isLikelyPinchWheel
        ? this.touchpadStep
        : this.wheelStep;
      const zoomFactor = Math.pow(2, -event.deltaY / zoomStepValue);
      this.zoomAtAnchor(state.zoom * zoomFactor, { x: mouseX, y: mouseY });
      this.syncMousePositionFromScreenPoint(screenPoint);
      return;
    }

    // Pixel-mode wheel deltas are typically trackpad two-finger gestures.
    // Let those pan freely in both axes without requiring Shift.
    const isTouchpadScroll = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL;
    if (isTouchpadScroll) {
      updateCamera({
        deltaX: -event.deltaX * WHEEL_PAN_MULTIPLIER,
        deltaY: -event.deltaY * WHEEL_PAN_MULTIPLIER,
        currentOffset: state.viewPortOffset,
        setCamera: state.actions.setCamera,
        panSpeed: this.panSpeed,
      });
      this.syncMousePositionFromScreenPoint(screenPoint);
      return;
    }

    if (event.shiftKey) {
      const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
      const panAmount = -delta * WHEEL_PAN_MULTIPLIER;
      updateCamera({
        deltaX: panAmount,
        deltaY: 0,
        currentOffset: state.viewPortOffset,
        setCamera: state.actions.setCamera,
        panSpeed: this.panSpeed,
      });
      this.syncMousePositionFromScreenPoint(screenPoint);
      return;
    }

    const panAmount = -event.deltaY * WHEEL_PAN_MULTIPLIER;
    updateCamera({
      deltaX: 0,
      deltaY: panAmount,
      currentOffset: state.viewPortOffset,
      setCamera: state.actions.setCamera,
      panSpeed: this.panSpeed,
    });
    this.syncMousePositionFromScreenPoint(screenPoint);
  };

  private updateModifierPressed(pressed: boolean) {
    if (this.modifierPressed === pressed) return;
    this.modifierPressed = pressed;
    this.requestRender();
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    this.store.getState().actions.setGridSnapBypassed(event.altKey);
    this.updateModifierPressed(checkModifierKey(event));
    this.pressedKeys.add(event.code);
    const state = this.store.getState();
    const placementState =
      state.actions.getToolState<PlacementPropertiesMenuState>(
        state.activeToolId,
      );
    if (event.key === "Escape" && placementState?.propertiesMenu) {
      state.actions.setToolState(state.activeToolId, {
        propertiesMenu: undefined,
      });
      event.preventDefault();
      return;
    }
    if (isUserTyping()) return;

    if (state.isPlayMode) {
      if (event.key === "Escape") {
        state.actions.stopPlayMode();
        event.preventDefault();
      }
      return;
    }

    const keyboardContext = this.getKeyboardEventContext(state);
    const key = event.key.toUpperCase();
    const modifier = checkModifierKey(event);

    if (
      key === "G" &&
      event.shiftKey &&
      modifier &&
      !event.altKey &&
      !event.isComposing
    ) {
      if (!event.repeat) this.autoGrassAll(state);
      event.preventDefault();
      return;
    }

    const vertexVariantShortcuts: Partial<Record<string, VertexToolVariant>> =
      event.shiftKey
        ? { P: "pipe", F: "frame", G: "autoGrass", S: "smooth" }
        : { B: "brush", D: "draw", X: "cutConnect" };
    const variant = vertexVariantShortcuts[key];
    if (
      variant &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.isComposing
    ) {
      const vertexState = state.actions.getToolState<VertexToolState>(
        defaultTools.vertex.id,
      );
      if (
        !event.repeat &&
        (state.activeToolId !== defaultTools.vertex.id ||
          vertexState?.variant !== variant)
      ) {
        state.actions.activateTool(defaultTools.vertex.id, variant);
      }
      event.preventDefault();
      return;
    }

    // Panel navigation takes priority over drawing and play-mode shortcuts.
    if (state.openToolMenuId && (key === "ENTER" || key === "ESCAPE")) {
      state.actions.setToolMenuOpen(false);
      event.preventDefault();
      return;
    }
    if (event.repeat && key === "ENTER") return;

    if (
      key === "ENTER" &&
      event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.isComposing
    ) {
      const screenPoint = this.getCurrentMouseScreenPoint(state);
      goToTestStart(this.store, activeTestStart(state).position, this.canvas);
      this.syncMousePositionFromScreenPoint(screenPoint);
      event.preventDefault();
      return;
    }

    const currentTool = state.actions.getActiveTool();
    if (
      currentTool?.meta.menuBehavior === "options" &&
      currentTool.meta.shortcut.toUpperCase() === key &&
      !modifier &&
      !event.altKey &&
      !event.shiftKey
    ) {
      if (!event.repeat) {
        state.actions.setToolMenuOpen(
          state.openToolMenuId !== state.activeToolId,
        );
      }
      event.preventDefault();
      return;
    }

    // Let active tool handle the key first
    const activeTool = state.actions.getActiveTool();
    if (activeTool?.onKeyDown) {
      const consumed = activeTool.onKeyDown(event, keyboardContext);
      if (consumed) {
        this.refreshSelectionHoverForModifierKeys(state, event);
        return;
      }
    }

    this.refreshSelectionHoverForModifierKeys(state, event);

    if (modifier && key === "A") {
      if (state.activeToolId !== "select") {
        state.actions.activateTool("select");
      }
      this.selectAllVisible();
      event.preventDefault();
      return;
    }

    for (const tool of state.toolsMap.values()) {
      if (
        tool.meta.shortcut.toUpperCase() === key &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        if (!event.repeat) {
          state.actions.activateTool(
            tool.meta.id,
            tool.meta.menuBehavior === "toolGroup" ? "normal" : undefined,
          );
          if (tool.meta.menuBehavior === "options") {
            state.actions.setToolMenuOpen(true);
          }
        }
        event.preventDefault();
        return;
      }

      for (const [variantKey, variantMeta] of Object.entries(
        tool.meta.variants || {},
      )) {
        // These variants are handled above with explicit modifier checks.
        if (
          ["cutConnect", "brush", "draw", "autoGrass", "smooth"].includes(
            variantKey,
          )
        )
          continue;
        if (variantMeta.shortcut.toUpperCase() === key) {
          // If tool is already active, let onKeyDown handle it (toggle)
          if (state.activeToolId === tool.meta.id) {
            return; // Falls through to tool's onKeyDown
          }
          state.actions.activateTool(tool.meta.id, variantKey);
          return;
        }
      }
    }

    if (modifier) {
      if (event.key === "y" || (event.key === "z" && event.shiftKey)) {
        this.redo();
        event.preventDefault();
        return;
      }
      if (event.key === "z") {
        this.undo();
        event.preventDefault();
        return;
      }
      if (event.key === "d" && event.shiftKey) {
        this.toggleDebugMode();
        event.preventDefault();
        return;
      }
    }

    // Handle arrow keys
    const panAmount = KEYBOARD_PAN_STEP;
    const arrowDeltas: Record<string, { deltaX: number; deltaY: number }> = {
      ArrowLeft: { deltaX: panAmount, deltaY: 0 },
      ArrowRight: { deltaX: -panAmount, deltaY: 0 },
      ArrowUp: { deltaX: 0, deltaY: panAmount },
      ArrowDown: { deltaX: 0, deltaY: -panAmount },
    };

    if (event.key in arrowDeltas) {
      const screenPoint = this.getCurrentMouseScreenPoint(state);
      updateCamera({
        ...arrowDeltas[event.key],
        currentOffset: state.viewPortOffset,
        setCamera: state.actions.setCamera,
        panSpeed: this.panSpeed,
      });
      this.syncMousePositionFromScreenPoint(screenPoint);
      return;
    }

    if (event.key === "0" && checkModifierKey(event)) {
      this.fitToView();
      return;
    }

    // Handle other shortcuts
    const shortcuts: Record<string, () => void> = {
      Enter: () => {
        if (
          state.activeToolId === "select" &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          !event.isComposing
        ) {
          const selection =
            state.actions.getToolState<SelectToolState>("select");
          if (
            selection &&
            !selection.selectedVertices.length &&
            !selection.selectedPictures.length &&
            !selection.isDragging &&
            !selection.isMarqueeSelecting &&
            !selection.transformMode
          ) {
            const selectedTestStart = state.testStarts.items.find(
              (item) =>
                selection.selectedObjects.length === 1 &&
                item.position === selection.selectedObjects[0],
            );
            if (selectedTestStart) {
              state.actions.activateTestStart(selectedTestStart.id);
            } else if (
              selection.selectedObjects.length === 1 &&
              selection.selectedObjects[0] === state.start
            ) {
              state.actions.activateTestStart(null);
            }
          }
        }
        state.actions.startPlayMode(
          Array.from(this.pressedKeys).filter((code) => code !== "Enter"),
        );
      },
      Escape: () => state.actions.activateTool("select"),
      "+": () => this.zoomInOut(this.zoomStep),
      "=": () => this.zoomInOut(this.zoomStep),
      "-": () => this.zoomInOut(-this.zoomStep),
      _: () => this.zoomInOut(-this.zoomStep),
    };
    shortcuts[event.key]?.();
  };

  private autoGrassAll(state: EditorState): boolean {
    return (
      state.actions
        .getTool<VertexTool>(defaultTools.vertex.id)
        ?.autoGrassAll() ?? false
    );
  }

  private handleKeyUp = (event: KeyboardEvent) => {
    this.store.getState().actions.setGridSnapBypassed(event.altKey);
    this.updateModifierPressed(checkModifierKey(event));
    this.pressedKeys.delete(event.code);
    const state = this.store.getState();
    this.refreshSelectionHoverForModifierKeys(state, event);
  };

  private zoomInOut(step: number) {
    const state = this.store.getState();
    const anchor = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    const stepSize = Math.max(0, Math.abs(step));
    const stepFactor = 1 + stepSize / KEYBOARD_ZOOM_STEP_DIVISOR;
    const zoomFactor = step >= 0 ? stepFactor : 1 / stepFactor;

    this.zoomAtAnchor(state.zoom * zoomFactor, anchor);
  }

  public zoomIn(step = this.zoomStep) {
    this.zoomInOut(step);
  }

  public zoomOut(step = this.zoomStep) {
    this.zoomInOut(-step);
  }

  public undo() {
    this.discardPendingVertexEditBeforeHistory();
    this.store.temporal.getState().undo();
  }

  public redo() {
    this.discardPendingVertexEditBeforeHistory();
    this.store.temporal.getState().redo();
  }

  private selectAllVisible(): boolean {
    const state = this.store.getState();
    const selectTool = state.actions.getTool<SelectTool>("select");
    if (!selectTool) return false;

    return selectTool.selectAllVisible((picture) =>
      Boolean(this.getPictureWorldDimensions(picture)),
    );
  }

  private handleResize = () => {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.resize(Math.floor(rect.width), Math.floor(rect.height));
    }
  };

  public fitToView() {
    const state = this.store.getState();
    fitToView({
      canvas: this.canvas,
      polygons: state.polygons,
      apples: state.apples,
      killers: state.killers,
      flowers: state.flowers,
      start: state.start,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      setCamera: state.actions.setCamera,
      setZoom: state.actions.setZoom,
    });
  }

  private discardPendingVertexEditBeforeHistory() {
    const state = this.store.getState();
    if (state.activeToolId !== "vertex") return;

    const toolState = state.actions.getToolState<VertexToolState>("vertex");
    if (toolState?.variant === "cutConnect") {
      state.actions.getActiveTool()?.clear?.();
      return;
    }
    if (
      !toolState?.editingPolygon ||
      toolState.drawingPolygon.vertices.length === 0
    ) {
      return;
    }

    const activeTool = state.actions.getActiveTool();
    activeTool?.clear?.();
  }

  private startRenderLoop() {
    this.requestRender();
  }

  private requestRender() {
    this.needsRender = true;
    if (this.animationId !== null) return;

    this.animationId = requestAnimationFrame(() => {
      this.animationId = null;
      this.flushRender();
    });
  }

  public setLgrAssets(lgrAssets: LgrAssets) {
    this.lgrAssets = lgrAssets;
    this.worldRenderer.setLgrAssets(lgrAssets);
    this.requestRender();
  }

  public createImageExport(): ImageExport {
    const state = this.store.getState();
    const scenes = new Map<string, ReturnType<typeof this.buildScene>>();
    for (const area of ["view", "level"] as const) {
      let cameraState = state;
      let viewportSize = {
        width: this.canvas.width,
        height: this.canvas.height,
      };
      if (area === "level") {
        let zoom = state.zoom;
        let offset = state.viewPortOffset;
        const pictureBounds = state.pictures.flatMap((picture) => {
          const size = getPictureWorldDimensions(picture, this.lgrAssets);
          return size
            ? [
                picture.position,
                {
                  x: picture.position.x + size.width,
                  y: picture.position.y + size.height,
                },
              ]
            : [picture.position];
        });
        fitToView({
          canvas: this.canvas,
          polygons: state.polygons,
          apples: state.apples,
          killers: [...state.killers, ...pictureBounds],
          flowers: state.flowers,
          start: state.start,
          minZoom: this.minZoom,
          maxZoom: this.maxZoom,
          setCamera: (x, y) => {
            offset = { x, y };
          },
          setZoom: (value) => {
            zoom = value;
          },
        });
        const bounds = calculateBoundingBox({
          polygons: state.polygons,
          apples: state.apples,
          killers: [...state.killers, ...pictureBounds],
          flowers: state.flowers,
          start: state.start,
        });
        // Frame the level itself instead of retaining the editor window's aspect ratio.
        const padding = 2;
        viewportSize = {
          width: Math.max(
            1,
            Math.ceil((bounds.maxX - bounds.minX + padding * 2) * zoom),
          ),
          height: Math.max(
            1,
            Math.ceil((bounds.maxY - bounds.minY + padding * 2) * zoom),
          ),
        };
        offset = {
          x: -(bounds.minX - padding) * zoom,
          y: -(bounds.minY - padding) * zoom,
        };
        cameraState = { ...state, zoom, viewPortOffset: offset };
      }
      for (const appearance of ["shown", "game"] as const) {
        const game = appearance === "game";
        const exportState = game
          ? {
              ...cameraState,
              levelVisibility: {
                ...cameraState.levelVisibility,
                useGroundSkyTextures: true,
                useGrassTextures: true,
                zoomTextures: true,
                showObjects: true,
                showPictures: true,
                showTextures: true,
                showPolygons: true,
                showGroundBounds: false,
                showGrassBounds: false,
                showObjectBounds: false,
                showPictureBounds: false,
                showTextureBounds: false,
              },
            }
          : cameraState;
        scenes.set(
          `${area}-${appearance}`,
          this.buildScene(exportState, !game, viewportSize),
        );
      }
    }
    return new ImageExport(
      this.lgrAssets,
      (options: ImageExportOptions) =>
        scenes.get(`${options.area}-${options.appearance}`)!,
    );
  }

  private flushRender() {
    const shouldAnimate = this.shouldAnimate();
    if (!this.needsRender && !shouldAnimate) {
      return;
    }

    this.needsRender = false;
    this.render();

    if (this.needsRender || this.shouldAnimate()) {
      this.requestRender();
    }
  }

  private shouldAnimate() {
    const state = this.store.getState();
    if (this.debugMode) return true;
    if (!state.animateSprites) return false;
    if (!state.levelVisibility.showObjectAnimations) return false;
    return state.levelVisibility.showObjects;
  }

  private setupStoreListeners() {
    // Subscribe directly to fitToViewTrigger changes
    const state = this.store.getState();
    let lastFitToViewTrigger = state.fitToViewTrigger;
    let lastCurrentTool = state.activeToolId;

    this.unsubscribeStore = this.store.subscribe((state) => {
      const currentTrigger = state.fitToViewTrigger;
      if (currentTrigger !== lastFitToViewTrigger) {
        lastFitToViewTrigger = currentTrigger;
        this.fitToView();
      }

      // Subscribe to tool changes
      const currentTool = state.activeToolId;
      if (currentTool !== lastCurrentTool) {
        lastCurrentTool = currentTool;
        this.updateCanvasCursor();
        if (currentTool !== "select") {
          this.clearSelectHoverState(state);
        } else if (state.mouseOnCanvas) {
          this.updateSelectHoverState(state, state.mousePosition);
        }
      }

      this.requestRender();
    });
  }

  private buildScene(
    state = this.store.getState(),
    includeEditor = true,
    viewportSize = { width: this.canvas.width, height: this.canvas.height },
  ) {
    const viewportRect = getViewportWorldRectFromOffset({
      width: viewportSize.width,
      height: viewportSize.height,
      offsetX: state.viewPortOffset.x,
      offsetY: state.viewPortOffset.y,
      zoom: state.zoom,
    });
    const scene = buildEditorWorldScene({
      state,
      includeDrafts: includeEditor,
      viewportSize,
      viewportRect,
      resolvePictureDimensions: (picture) =>
        getPictureWorldDimensions(picture, this.lgrAssets),
    });
    const activeTool = state.actions.getActiveTool();
    const overlays = includeEditor
      ? [
          ...this.getEditorOverlays(state, viewportRect),
          ...getTopologyOverlays(state, this.lgrAssets),
          ...(activeTool?.getWorldOverlays?.({
            viewportRect,
            modifierPressed: this.modifierPressed,
          }) ?? []),
        ]
      : [];
    scene.overlays = [
      ...overlays.filter((overlay) => overlay.layer !== "top"),
      ...overlays.filter((overlay) => overlay.layer === "top"),
    ];
    return scene;
  }

  private render() {
    this.worldRenderer.render(this.buildScene());
  }

  private refreshSelectionHoverForModifierKeys(
    state: EditorState,
    event: KeyboardEvent,
  ) {
    if (
      state.activeToolId !== "select" ||
      !state.mouseOnCanvas ||
      !this.isSelectionModifierKey(event.code)
    ) {
      return;
    }

    this.updateSelectHoverState(
      state,
      state.mousePosition,
      event.shiftKey || event.altKey,
    );
  }

  private isSelectionModifierKey(code: string): boolean {
    return (
      code === "ShiftLeft" ||
      code === "ShiftRight" ||
      code === "AltLeft" ||
      code === "AltRight" ||
      code === "AltGraph"
    );
  }

  private updateSelectHoverState(
    state: EditorState,
    worldPos: Position,
    forceObjectSelection = false,
  ) {
    const activeTool = state.actions.getActiveTool();
    if (activeTool?.meta.id !== "select") {
      this.clearSelectHoverState(state);
      return;
    }

    const selectState = state.actions.getToolState<SelectToolState>("select");
    if (selectState?.isDragging) {
      return;
    }

    const nextHover = this.resolveSelectHoverTarget(
      state,
      worldPos,
      forceObjectSelection,
    );
    const currentHover = selectState;
    const currentPictureBounds = currentHover?.hoveredPictureBounds;
    const nextPictureBounds = nextHover.hoveredPictureBounds;

    const isSameHover =
      currentHover?.hoveredObject === nextHover.hoveredObject &&
      currentPictureBounds?.position === nextPictureBounds?.position &&
      currentPictureBounds?.width === nextPictureBounds?.width &&
      currentPictureBounds?.height === nextPictureBounds?.height &&
      currentPictureBounds?.distance === nextPictureBounds?.distance;
    if (isSameHover) return;

    state.actions.setToolState<SelectToolState>("select", nextHover);
  }

  private clearSelectHoverState(state: EditorState) {
    const selectState = state.actions.getToolState<SelectToolState>("select");
    if (!selectState?.hoveredObject && !selectState?.hoveredPictureBounds) {
      return;
    }

    state.actions.setToolState<SelectToolState>("select", {
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
    });
  }

  private resolveSelectHoverTarget(
    state: EditorState,
    worldPos: Position,
    forceObjectSelection = false,
  ): Pick<SelectToolState, "hoveredObject" | "hoveredPictureBounds"> {
    const viewportRect = getViewportWorldRectFromOffset({
      width: this.canvas.width,
      height: this.canvas.height,
      offsetX: state.viewPortOffset.x,
      offsetY: state.viewPortOffset.y,
      zoom: state.zoom,
    });

    // Selection priority:
    // 1) Active selected objects (for bikes/players we intentionally use bounds-only).
    // 2) Objects behind/under visible pictures/textures unless forced.
    // 3) Picture/texture bounds.
    const pictureCandidates: Array<{
      picture: Picture;
      width: number;
      height: number;
      isVisible: boolean;
      fallbackToBounds: boolean;
    }> = [];

    for (let index = 0; index < state.pictures.length; index++) {
      const picture = state.pictures[index]!;
      if (!this.isPictureSelectable(state, picture)) continue;
      if (
        !isPictureVisible(picture, viewportRect, (candidate) =>
          getPictureWorldDimensions(candidate, this.lgrAssets),
        )
      ) {
        continue;
      }
      const pictureDimensions = this.getPictureWorldDimensions(picture);
      if (!pictureDimensions) continue;

      const { width, height } = pictureDimensions;
      const isInPictureBounds =
        worldPos.x >= picture.position.x &&
        worldPos.x <= picture.position.x + width &&
        worldPos.y >= picture.position.y &&
        worldPos.y <= picture.position.y + height;
      if (!isInPictureBounds) continue;
      const isTexture = Boolean(picture.texture && picture.mask);

      const isVisibleOnTopLayer = this.isPictureCandidateSelectable(
        state,
        picture,
        worldPos,
      );
      pictureCandidates.push({
        picture,
        width,
        height,
        isVisible: isVisibleOnTopLayer,
        fallbackToBounds: isTexture,
      });
    }

    pictureCandidates.sort((a, b) => a.picture.distance - b.picture.distance);

    const frontmostVisiblePicture = pictureCandidates.find(
      (entry) => entry.isVisible,
    );
    const frontmostTextureFallbackPicture = pictureCandidates.find(
      (entry) => entry.fallbackToBounds,
    );
    const isObjectSelectionBlockedByPicture =
      frontmostVisiblePicture !== undefined &&
      frontmostVisiblePicture.picture.distance < DEFAULT_OBJECT_RENDER_DISTANCE;

    const toolState = state.actions.getToolState<SelectToolState>("select");
    if (toolState?.selectedObjects.length && this.isObjectSelectable(state)) {
      const selectedObject = this.findObjectNearSelectedPosition(
        worldPos,
        toolState.selectedObjects,
        Math.max(selectionThresholds.object / state.zoom, OBJECT_DIAMETER / 2),
        {
          // For already-selected objects, prefer visual bounds over full image hit-area
          // so textures/pictures can win on non-bounds overlap regions.
          allowStartImageSelection: false,
        },
      );
      if (selectedObject) {
        return {
          hoveredObject: selectedObject,
          hoveredPictureBounds: undefined,
        };
      }
    }

    if (
      this.isObjectSelectable(state) &&
      (forceObjectSelection || !isObjectSelectionBlockedByPicture)
    ) {
      const useImageStartSelection =
        state.levelVisibility.showObjects &&
        this.isStartObjectImageSelectionReady();
      const artifact = [...getSessionArtifacts(state)]
        .reverse()
        .find((item) => item.hitTest(worldPos, useImageStartSelection));
      if (artifact)
        return {
          hoveredObject: artifact.position,
          hoveredPictureBounds: undefined,
        };
      if (
        isPointVisible(state.start, viewportRect) &&
        isStartObjectHit(
          worldPos,
          state.start,
          useImageStartSelection ? "boundsWithImage" : "boundsOnly",
          useImageStartSelection,
        )
      ) {
        return {
          hoveredObject: state.start,
          hoveredPictureBounds: undefined,
        };
      }

      const objectGroups = [
        state.flowers,
        state.apples.map((apple) => apple.position),
        state.killers,
      ];
      for (const objects of objectGroups) {
        for (let index = objects.length - 1; index >= 0; index--) {
          const object = objects[index]!;
          if (!isPointVisible(object, viewportRect)) continue;
          const isHovered =
            Math.hypot(worldPos.x - object.x, worldPos.y - object.y) <=
            OBJECT_DIAMETER / 2;
          if (!isHovered) continue;
          return {
            hoveredObject: object,
            hoveredPictureBounds: undefined,
          };
        }
      }
    }

    if (this.isPolygonSelectable(state)) {
      const hoveredVertex = findVertexNearPosition(
        worldPos,
        state.polygons,
        selectionThresholds.vertex / state.zoom,
      );
      if (hoveredVertex) {
        return {
          hoveredObject: undefined,
          hoveredPictureBounds: undefined,
        };
      }

      const hoveredEdge = findPolygonEdgeNearPosition(
        worldPos,
        state.polygons,
        selectionThresholds.polygonEdge / state.zoom,
        (polygon, edgeIndex) =>
          this.isSelectablePolygonEdge(state, polygon, edgeIndex),
      );
      if (hoveredEdge) {
        return {
          hoveredObject: undefined,
          hoveredPictureBounds: undefined,
        };
      }
    }

    const hoveredPicture =
      frontmostVisiblePicture ?? frontmostTextureFallbackPicture ?? null;
    if (hoveredPicture) {
      return {
        hoveredObject: undefined,
        hoveredPictureBounds: {
          position: hoveredPicture.picture.position,
          width: hoveredPicture.width,
          height: hoveredPicture.height,
          distance: hoveredPicture.picture.distance,
        },
      };
    }

    return {
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
    };
  }

  private findObjectNearSelectedPosition(
    position: Position,
    objects: Position[],
    threshold: number,
    options?: {
      allowStartImageSelection?: boolean;
    },
  ) {
    const state = this.store.getState();
    const useImageStartSelection =
      options?.allowStartImageSelection === true &&
      state.levelVisibility.showObjects &&
      this.isStartObjectImageSelectionReady();
    const startSelectionMode = options?.allowStartImageSelection
      ? "boundsWithImage"
      : "boundsOnly";

    for (const object of objects) {
      const artifact = findSessionArtifact(state, object);
      if (artifact) {
        if (artifact.hitTest(position, useImageStartSelection)) return object;
        continue;
      }
      if (object === state.start) {
        const isHovered = isStartObjectHit(
          position,
          state.start,
          startSelectionMode,
          useImageStartSelection,
        );
        if (isHovered) return object;
        continue;
      }

      if (findObjectNearPosition(position, [object], threshold)) return object;
    }

    return null;
  }

  private isStartObjectImageSelectionReady(): boolean {
    const requiredSprites = [
      "q1wheel",
      "q1susp1",
      "q1susp2",
      "q1bike",
      "q1body",
      "q1head",
      "q1thigh",
      "q1leg",
      "q1up_arm",
      "q1forarm",
    ];
    return requiredSprites.every((spriteName) =>
      Boolean(this.lgrAssets.getSprite(spriteName)),
    );
  }

  private isSelectablePolygonEdge(
    state: EditorState,
    polygon: Polygon,
    edgeIndex: number,
  ) {
    const toolState = state.actions.getToolState<SelectToolState>("select");
    const polygonSelectionCount =
      toolState?.selectedVertices.filter((sv) => sv.polygon === polygon)
        .length ?? 0;
    const isPolygonFullySelected =
      polygonSelectionCount === polygon.vertices.length &&
      polygonSelectionCount > 0;
    if (isPolygonFullySelected) return true;
    if (!polygon.grass) return true;

    const longestEdgeIndex = getLongestGrassEdgeIndex(polygon);
    if (longestEdgeIndex === -1) return false;
    return edgeIndex !== longestEdgeIndex;
  }

  private isPicturePixelClippedByRegion(
    state: EditorState,
    picture: Picture,
    point: Position,
  ): boolean {
    if (picture.clip === Clip.Unclipped) return true;
    const isInGround = isWorldPointInGroundRegion(point, state.polygons);
    return picture.clip === Clip.Ground ? isInGround : !isInGround;
  }

  private isPictureCandidateSelectable(
    state: EditorState,
    picture: Picture,
    worldPos: Position,
  ): boolean {
    const isWithinRegion = this.isPicturePixelClippedByRegion(
      state,
      picture,
      worldPos,
    );
    if (!isWithinRegion) return false;
    return isWorldPointInPictureVisiblePixel(worldPos, picture, this.lgrAssets);
  }

  private isObjectSelectable(state: EditorState) {
    const { showObjects, showObjectBounds } = state.levelVisibility;
    return showObjects || showObjectBounds;
  }

  private isPolygonSelectable(state: EditorState) {
    const {
      showPolygons,
      showGroundBounds,
      showGrassBounds,
      showPolygonHandles,
    } = state.levelVisibility;
    return (
      showPolygons || showGroundBounds || showGrassBounds || showPolygonHandles
    );
  }

  private isPictureSelectable(state: EditorState, picture: Picture) {
    const { showPictureBounds, showTextureBounds, showPictures, showTextures } =
      state.levelVisibility;
    const hasTexture = Boolean(picture.texture && picture.mask);
    return hasTexture
      ? showTextures || showTextureBounds
      : showPictures || showPictureBounds;
  }

  private getPictureWorldDimensions(picture: Picture) {
    return getPictureWorldDimensions(picture, this.lgrAssets);
  }

  private getEditorOverlays(
    state: EditorState,
    viewportRect: ReturnType<typeof getViewportWorldRectFromOffset>,
  ): WorldRenderOverlayItem[] {
    const overlays: WorldRenderOverlayItem[] = [];
    const selectState = state.actions.getToolState<SelectToolState>("select");
    if (state.activeToolId !== "select") return overlays;

    const hoveredPicture = selectState?.isMarqueeSelecting
      ? undefined
      : selectState?.hoveredPictureBounds;
    const hoveredPictureIsSelected =
      hoveredPicture &&
      selectState?.selectedPictures.includes(hoveredPicture.position);

    if (hoveredPicture && !hoveredPictureIsSelected && state.mouseOnCanvas) {
      const picture =
        state.pictures.find(
          (entry) =>
            entry.position.x === hoveredPicture.position.x &&
            entry.position.y === hoveredPicture.position.y &&
            entry.distance === hoveredPicture.distance,
        ) ??
        state.pictures.find(
          (entry) =>
            entry.position.x === hoveredPicture.position.x &&
            entry.position.y === hoveredPicture.position.y,
        );
      if (picture) {
        const hoveredDimensions = this.getPictureWorldDimensions(picture);
        if (hoveredDimensions) {
          const rect = {
            minX: hoveredPicture.position.x,
            minY: hoveredPicture.position.y,
            maxX: hoveredPicture.position.x + hoveredDimensions.width,
            maxY: hoveredPicture.position.y + hoveredDimensions.height,
          };
          if (
            !(
              rect.maxX < viewportRect.minX ||
              rect.minX > viewportRect.maxX ||
              rect.maxY < viewportRect.minY ||
              rect.minY > viewportRect.maxY
            )
          ) {
            const outlineSegments = getPictureWorldOutlineSegments(
              picture,
              this.lgrAssets,
            );
            if (outlineSegments && outlineSegments.length > 0) {
              overlays.push(
                ...outlineSegments.map((segment) => ({
                  type: "polyline" as const,
                  points: segment,
                  color: uiColors.boundsHover,
                  width: uiStrokeWidths.boundsHoverScreen / state.zoom,
                })),
              );
            }
          }
        }
      }
    }

    for (const position of selectState?.selectedPictures ?? []) {
      const picture = state.pictures.find(
        (entry) =>
          entry.position.x === position.x && entry.position.y === position.y,
      );
      if (!picture) continue;

      const dimensions = this.getPictureWorldDimensions(picture);
      if (!dimensions) continue;
      const rect = {
        minX: picture.position.x,
        minY: picture.position.y,
        maxX: picture.position.x + dimensions.width,
        maxY: picture.position.y + dimensions.height,
      };
      if (
        rect.maxX < viewportRect.minX ||
        rect.minX > viewportRect.maxX ||
        rect.maxY < viewportRect.minY ||
        rect.minY > viewportRect.maxY
      ) {
        continue;
      }

      const outlineSegments = getPictureWorldOutlineSegments(
        picture,
        this.lgrAssets,
      );
      if (outlineSegments && outlineSegments.length > 0) {
        overlays.push(
          ...outlineSegments.map((segment) => ({
            type: "polyline" as const,
            points: segment,
            color: uiColors.boundsSelected,
            width: uiStrokeWidths.boundsSelectedScreen / state.zoom,
          })),
        );
      }
    }

    if (
      !state.levelVisibility.showPolygonHandles ||
      state.polygons.length === 0
    ) {
      return overlays;
    }

    const size = uiSelectionHandle.halfWidthPx / state.zoom;
    const side = size * 2;
    const lineWidth = uiSelectionHandle.strokeWidthPx / state.zoom;

    overlays.push(
      ...state.polygons.flatMap((polygon) =>
        polygon.vertices
          .filter(
            (vertex) =>
              vertex.x >= viewportRect.minX &&
              vertex.x <= viewportRect.maxX &&
              vertex.y >= viewportRect.minY &&
              vertex.y <= viewportRect.maxY,
          )
          .map((vertex) => ({
            type: "rect" as const,
            position: {
              x: vertex.x - size,
              y: vertex.y - size,
            },
            width: side,
            height: side,
            cornerRadius:
              (uiSelectionHandle.cornerRadiusPx /
                uiSelectionHandle.halfWidthPx) *
              size,
            fillColor: uiColors.selectionHandleFill,
            strokeColor: uiColors.selectionHandleStroke,
            lineWidth,
            layer: "top" as const,
          })),
      ),
    );

    return overlays;
  }

  public destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.cancelTouchContextMenuTimer();

    this.unsubscribeStore?.();

    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("contextmenu", this.handleRightClick);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    window.removeEventListener("resize", this.handleResize);
    this.worldRenderer.destroy();
  }

  public resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.worldRenderer.resize({ width, height });
    this.requestRender();
  }

  public toggleDebugMode() {
    this.debugMode = !this.debugMode;
  }
}
