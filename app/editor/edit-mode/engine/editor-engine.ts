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
import { OBJECT_DIAMETER, uiSelectionHandle } from "~/editor/constants";
import type { Tool } from "~/editor/edit-mode/tools/tool-interface";
import type { Widget } from "~/editor/edit-mode/widgets/widget-interface";
import { createEditorStore, type EditorStore } from "~/editor/editor-store";
import type { DefaultLevelPreset } from "~/editor/helpers/level-parser";
import { isPointInKuskiSelectionBounds } from "~/editor/kuski-geometry";
import { LgrAssets } from "~/components/lgr-assets";
import {
  screenToWorld,
  worldToScreen,
} from "~/editor/helpers/coordinate-helpers";
import { type Picture, type Position } from "~/editor/elma-types";
import { getDefaultLevel } from "~/editor/helpers/level-parser";
import { checkModifierKey } from "~/utils/misc";
import {
  SelectTool,
  type SelectToolState,
} from "~/editor/edit-mode/tools/select-tool";
import type { VertexToolState } from "~/editor/edit-mode/tools/vertex-tool";
import type { EditorDocumentInput } from "~/editor/editor-state";
import { buildEditorWorldScene } from "~/editor/edit-mode/scene/editor-scene-builder";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";
import { getPictureWorldDimensions } from "~/editor/render/picture-metrics";
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

type EditorEngineOptions = {
  initialDocument?: EditorDocumentInput;
  initialToolId?: string;
  defaultLevelPreset?: DefaultLevelPreset;
  readOnly?: boolean;
  tools?: Array<new (store: EditorStore) => Tool>;
  widgets?: Array<new (store: EditorStore) => Widget>;
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
  private pressedKeys = new Set<string>();
  private handleWindowBlur = () => {
    this.pressedKeys.clear();
  };

  constructor(
    canvas: HTMLCanvasElement,
    {
      initialDocument,
      initialToolId = "select",
      defaultLevelPreset = "default",
      readOnly = false,
      tools = [],
      widgets = [],
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
    const resolvedInitialDocument = initialDocument ?? {
      level: getDefaultLevel(defaultLevelPreset),
      origin: { kind: "default", label: "Untitled", canOverwrite: false },
      displayName: "Untitled",
      hasExternalHandle: false,
    };

    tools.forEach((tool) => state.actions.registerTool(new tool(this.store)));
    if (tools.length > 0) {
      state.actions.activateTool(initialToolId);
    }

    widgets.forEach((widget) =>
      state.actions.registerWidget(new widget(this.store)),
    );

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
    const activeTool = state.actions.getActiveTool();
    this.updateSelectHoverState(state, context.worldPos);

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

  private handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      this.trySetPointerCapture(event.pointerId);
      this.touchPointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      const pinch = this.getTouchPinchState();
      if (pinch) {
        this.endActiveTouchToolInteraction();
        this.pinchDistance = pinch.distance;
        this.pinchCenter = pinch.center;
        return;
      }

      this.resetPinchState();
      this.activeTouchToolPointerId = event.pointerId;
      this.dispatchToolPointerEvent("down", event);
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

      const pinch = this.getTouchPinchState();
      if (pinch) {
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
    if (event.pointerType === "touch") {
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
    }

    this.isPanning = false;
    this.tryReleasePointerCapture(event.pointerId);
    this.updateCanvasCursor();
  };

  private handlePointerLeave = () => {
    const state = this.store.getState();
    state.actions.setMouseOnCanvas(false);
    this.clearSelectHoverState(state);
    this.updateCanvasCursor();
  };

  private handleRightClick = (event: MouseEvent) => {
    event.preventDefault();
    const state = this.store.getState();
    const context = getEventContext(
      event,
      this.canvas,
      state.viewPortOffset,
      state.zoom,
    );
    this.updateSelectHoverState(state, context.worldPos);

    const activeTool = this.store.getState().actions.getActiveTool();
    if (activeTool?.onRightClick) {
      const consumed = activeTool.onRightClick(event, context);
      if (consumed) return;
    }
  };

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

  private handleKeyDown = (event: KeyboardEvent) => {
    this.pressedKeys.add(event.code);
    if (isUserTyping()) return;

    const state = this.store.getState();

    if (state.isPlayMode) {
      if (event.key === "Escape") {
        state.actions.stopPlayMode();
        event.preventDefault();
      }
      return;
    }

    const keyboardContext = this.getKeyboardEventContext(state);

    // Let active tool handle the key first
    const activeTool = state.actions.getActiveTool();
    if (activeTool?.onKeyDown) {
      const consumed = activeTool.onKeyDown(event, keyboardContext);
      if (consumed) return;
    }

    const key = event.key.toUpperCase();
    const modifier = checkModifierKey(event);

    if (modifier && key === "A") {
      if (state.activeToolId !== "select") {
        state.actions.activateTool("select");
      }
      this.selectAllVisible();
      event.preventDefault();
      return;
    }

    for (const tool of state.toolsMap.values()) {
      if (tool.meta.shortcut.toUpperCase() === key) {
        state.actions.activateTool(tool.meta.id);
        return;
      }

      for (const [variantKey, variantMeta] of Object.entries(
        tool.meta.variants || {},
      )) {
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

    // Handle other shortcuts
    const shortcuts: Record<string, () => void> = {
      Enter: () =>
        state.actions.startPlayMode(
          Array.from(this.pressedKeys).filter((code) => code !== "Enter"),
        ),
      Escape: () => state.actions.activateTool("select"),
      "+": () => this.zoomInOut(this.zoomStep),
      "=": () => this.zoomInOut(this.zoomStep),
      "-": () => this.zoomInOut(-this.zoomStep),
      _: () => this.zoomInOut(-this.zoomStep),
      "1": () => this.fitToView(),
    };
    shortcuts[event.key]?.();
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    this.pressedKeys.delete(event.code);
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

  private render() {
    const state = this.store.getState();
    const viewportRect = getViewportWorldRectFromOffset({
      width: this.canvas.width,
      height: this.canvas.height,
      offsetX: state.viewPortOffset.x,
      offsetY: state.viewPortOffset.y,
      zoom: state.zoom,
    });
    const scene = buildEditorWorldScene({
      state,
      viewportSize: {
        width: this.canvas.width,
        height: this.canvas.height,
      },
      viewportRect,
      resolvePictureDimensions: (picture) =>
        getPictureWorldDimensions(picture, this.lgrAssets),
    });
    const activeTool = state.actions.getActiveTool();
    const overlays = [
      ...this.getEditorOverlays(state, viewportRect),
      ...(activeTool?.getWorldOverlays?.({ viewportRect }) ?? []),
    ];
    scene.overlays = [
      ...overlays.filter((overlay) => overlay.layer !== "top"),
      ...overlays.filter((overlay) => overlay.layer === "top"),
    ];
    this.worldRenderer.render(scene);
  }

  private updateSelectHoverState(state: EditorState, worldPos: Position) {
    const activeTool = state.actions.getActiveTool();
    if (activeTool?.meta.id !== "select") {
      this.clearSelectHoverState(state);
      return;
    }

    const nextHover = this.resolveSelectHoverTarget(state, worldPos);
    const currentHover = state.actions.getToolState<SelectToolState>("select");
    const currentPictureBounds = currentHover?.hoveredPictureBounds;
    const nextPictureBounds = nextHover.hoveredPictureBounds;

    const isSameHover =
      currentHover?.hoveredObject === nextHover.hoveredObject &&
      currentPictureBounds?.position === nextPictureBounds?.position &&
      currentPictureBounds?.width === nextPictureBounds?.width &&
      currentPictureBounds?.height === nextPictureBounds?.height;
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
  ): Pick<SelectToolState, "hoveredObject" | "hoveredPictureBounds"> {
    const viewportRect = getViewportWorldRectFromOffset({
      width: this.canvas.width,
      height: this.canvas.height,
      offsetX: state.viewPortOffset.x,
      offsetY: state.viewPortOffset.y,
      zoom: state.zoom,
    });

    // Objects take precedence over pictures/textures when overlapping.
    if (this.isObjectSelectable(state)) {
      if (
        isPointVisible(state.start, viewportRect) &&
        isPointInKuskiSelectionBounds({
          point: worldPos,
          start: state.start,
        })
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

    for (let index = state.pictures.length - 1; index >= 0; index--) {
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
      const isHovered =
        worldPos.x >= picture.position.x &&
        worldPos.x <= picture.position.x + width &&
        worldPos.y >= picture.position.y &&
        worldPos.y <= picture.position.y + height;
      if (!isHovered) continue;

      return {
        hoveredObject: undefined,
        hoveredPictureBounds: {
          position: picture.position,
          width,
          height,
        },
      };
    }

    return {
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
    };
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

      overlays.push({
        type: "rect",
        position: picture.position,
        width: dimensions.width,
        height: dimensions.height,
        strokeColor: "#5ec8ff",
        lineWidth: 2 / state.zoom,
      });
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
            fillColor: "#ffffff",
            strokeColor: "#1b3b5c",
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
