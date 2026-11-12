import { EOL_LEVEL_LIMITS } from "~/editor/helpers/level-limits";
import type { LgrAssets } from "~/components/lgr-assets";
import { standardSprites } from "~/components/standard-sprites";
import { tracePictureSilhouette } from "~/editor/helpers/picture-silhouette";
import { createFillMask, generateTextureFill } from "~/editor/helpers/texture-fill";
import { findSessionArtifact } from "~/editor/session-artifacts";
import { Tool } from "./tool-interface";
import type { EventContext } from "~/editor/helpers/event-handler";
import {
  findVertexNearPosition,
  findPolygonEdgeNearPosition,
  isVertexSelected,
  isObjectSelected,
} from "~/editor/helpers/selection-helpers";
import {
  OBJECT_DIAMETER,
  selectionThresholds,
  uiColors,
  uiStrokeWidths,
} from "~/editor/constants";
import type { Apple, Picture, Polygon, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";
import type { EditorStore } from "~/editor/editor-store";
import type { HistoryTransaction } from "~/editor/history/transaction-history";
import type { EditorHistoryActionKind } from "~/editor/history/editor-history-actions";
import { defaultTools } from "./default-tools";
import type { WorldRect } from "~/editor/render/world-geometry";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";
import { DEFAULT_OBJECT_RENDER_DISTANCE } from "~/editor/render/render-constants";
import { checkModifierKey } from "~/utils/misc";
import fastDeepEqual from "fast-deep-equal";
import { getKuskiSelectionCircles } from "~/editor/kuski-geometry";
import {
  SelectionClipboardController,
  getClipboardCenter,
  type SelectionClipboard,
  type PastedSelection,
} from "./selection-clipboard";
import { SelectionMutations } from "./selection-mutations";
import { SelectionHitTester } from "./selection-hit-testing";
import {
  findAreaSelection,
  type PictureDimensionsResolver,
} from "./area-selection";
import {
  TransformSession,
  type ArtifactTransform,
  type TransformFrame,
} from "./transform-session";
import {
  SelectionVisibility,
  type SelectSelectionKind,
} from "./selection-visibility";
export type { SelectSelectionKind } from "./selection-visibility";
import {
  createSelectionHandleOverlay,
  createSelectionOverlays,
} from "./selection-overlays";
import {
  isPolygonEdgeSelectable,
  isPolygonEdgeSelected,
} from "./polygon-selection";
import {
  arrangeSelectedPictures,
  type ArrangeSelectionDirection,
} from "./picture-arrangement";
export type { ArrangeSelectionDirection } from "./picture-arrangement";
import {
  calculateSelectionDrag,
  getSelectionDragOrigins,
  getVertexDragConstraintDirections,
} from "./selection-drag";

import {
  getResizeCursor,
  getRotationCursor,
  transformControls,
  getTransformBounds,
  getTransformCenter,
  getTransformHandles,
  getSkewHandles,
  rotateTransformPoint,
  type TransformFrameCorners,
  type TransformHandle,
} from "~/editor/helpers/selection-transform";

export type MirrorSelectionDirection = "horizontal" | "vertical";

const KEYBOARD_NUDGE_STEP = 0.1;
const KEYBOARD_NUDGE_MULTIPLIER = 10;
const keyboardNudgeDirections: Partial<Record<string, Position>> = {
  ArrowLeft: { x: -1, y: 0 } as Position,
  ArrowRight: { x: 1, y: 0 } as Position,
  ArrowUp: { x: 0, y: 1 } as Position,
  ArrowDown: { x: 0, y: -1 } as Position,
};

export type SelectToolState = {
  selectedVertices: Array<{ polygon: Polygon; vertex: Position }>;
  selectedObjects: Position[];
  selectedPictures: Position[];
  isDragging: boolean;
  variant?: "marquee" | "lasso";
  transformMode?: boolean;
  skewMode?: boolean;
  isMarqueeSelecting?: boolean;
  hoveredObject?: Position;
  hoveredPictureBounds?: {
    position: Position;
    width: number;
    height: number;
    distance: number;
  };
  contextMenuType?: "selection";
  contextMenuPosition?: Position;
  contextMenuWorldPosition?: Position;
};

type VertexSelection = { polygon: Polygon; vertex: Position };
type ContextMenuSelectionTarget =
  | { type: "object"; object: Position }
  | { type: "vertex"; polygon: Polygon; vertex: Position }
  | { type: "polygon"; polygon: Polygon }
  | { type: "picture"; picture: Position };
export class SelectTool extends Tool<SelectToolState> {
  readonly meta = defaultTools.select;
  private readonly selectionMutations: SelectionMutations;
  private readonly selectionHitTester: SelectionHitTester;
  private readonly clipboard = new SelectionClipboardController();
  private pictureDimensionsResolver: PictureDimensionsResolver = () => null;

  constructor(store: EditorStore) {
    super(store);
    this.selectionMutations = new SelectionMutations(() => {
      const { state, toolState, setToolState } = this.getState();
      return toolState
        ? { state, selection: toolState, updateSelection: setToolState }
        : null;
    });
    this.selectionHitTester = new SelectionHitTester(
      () => {
        const { state, toolState } = this.getState();
        return { state, selection: toolState };
      },
      () => this.isPolygonSelectable(),
      this.isSelectablePolygonEdge,
      (polygon, edgeIndex) => this.isPolygonEdgeSelected(polygon, edgeIndex),
    );
  }

  public setPictureDimensionsResolver(
    resolver: PictureDimensionsResolver,
  ): void {
    this.pictureDimensionsResolver = resolver;
  }

  private transformFrame: { frame: TransformFrame; points: Position[] } | null =
    null;
  private transformDrag: TransformSession | null = null;

  private transformOrigin: { width: number; height: number } | null = null;

  private isDragging = false;
  private dragStartPos = { x: 0, y: 0 };
  private dragOriginPositions: Position[] = [];
  private dragConstraintDirections: Position[] = [];
  private isMarqueeSelecting = false;
  private lassoPath: Position[] = [];
  private areaSelectionBefore: Pick<
    SelectToolState,
    "selectedVertices" | "selectedObjects" | "selectedPictures"
  > | null = null;
  private areaSelectionVariant: "marquee" | "lasso" = "marquee";

  onActivate(variant?: string): void {
    if (variant === "marquee" || variant === "lasso") {
      if (this.isMarqueeSelecting) this.cancelAreaSelection();
      this.getState().setToolState({ variant });
    }
  }

  private marqueeStartPos = { x: 0, y: 0 };
  private marqueeEndPos = { x: 0, y: 0 };
  private dragEdit: HistoryTransaction | null = null;
  private keyboardMoveEdit: HistoryTransaction | null = null;
  private keyboardMoveKeys = new Set<string>();
  private dragHasChanges = false;

  onDeactivate(): void {
    this.clear();
  }

  isInteracting(): boolean {
    return this.isDragging || this.isMarqueeSelecting;
  }

  cancelInteraction(): void {
    this.finishTransformDrag(false);
    this.endDragEdit(false);
    this.endKeyboardMove(false);
    if (this.isMarqueeSelecting) this.cancelAreaSelection();
    this.transformFrame = null;
    this.transformOrigin = null;
    this.isDragging = false;
    this.isMarqueeSelecting = false;
    this.lassoPath = [];
    this.areaSelectionBefore = null;
    this.dragOriginPositions = [];
    this.dragConstraintDirections = [];
    this.getState().setToolState({
      isDragging: false,
      isMarqueeSelecting: false,
    });
  }

  clear(): void {
    this.cancelInteraction();
    this.getState().setToolState({
      selectedVertices: [],
      selectedObjects: [],
      selectedPictures: [],
      transformMode: false,
      skewMode: false,
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
      contextMenuPosition: undefined,
    });
  }

  onRightClick(event: MouseEvent, context: EventContext) {
    if (this.isMarqueeSelecting) {
      this.finalizeMarqueeSelection();
      this.finishAreaSelection();
      return true;
    }
    this.pruneHiddenSelection();
    const { state, toolState, setToolState } = this.getState();
    const hoveredPicture = this.resolveHoveredPictureFromState(
      state,
      toolState?.hoveredPictureBounds,
    );

    if (this.hasSelection()) {
      if (
        this.selectionHitTester.isSelectionHit(context.worldPos, hoveredPicture)
      ) {
        this.openContextMenu(context);
        return true;
      }

      const target = this.resolveContextMenuSelectionTarget(
        context,
        hoveredPicture,
      );
      if (target) {
        if (checkModifierKey(event)) {
          this.addContextMenuSelectionTarget(target);
        } else {
          this.replaceSelectionWithContextMenuTarget(target);
        }
      }

      this.openContextMenu(context);
      return true;
    }

    const target = this.resolveContextMenuSelectionTarget(
      context,
      hoveredPicture,
    );
    if (target) {
      this.replaceSelectionWithContextMenuTarget(target);
      this.openContextMenu(context);
      return true;
    }

    if (this.clipboard.canPaste()) {
      this.openContextMenu(context);
      return true;
    }
    setToolState({
      contextMenuType: undefined,
      contextMenuPosition: undefined,
    });
    return false;
  }

  public closeContextMenu(): void {
    const { setToolState } = this.getState();
    setToolState({
      contextMenuType: undefined,
      contextMenuPosition: undefined,
    });
  }

  private openContextMenu(context: EventContext): void {
    const { setToolState } = this.getState();
    setToolState({
      contextMenuType: "selection",
      contextMenuPosition: { x: context.screenX, y: context.screenY },
      contextMenuWorldPosition: { ...context.worldPos },
    });
  }

  private resolveHoveredPictureFromState(
    state: EditorState,
    hoverState?: SelectToolState["hoveredPictureBounds"],
  ): Picture | null {
    if (!hoverState) return null;

    const match = state.pictures.find(
      (picture) =>
        picture.position.x === hoverState.position.x &&
        picture.position.y === hoverState.position.y &&
        picture.distance === hoverState.distance,
    );
    if (match) return match;

    const fallback = state.pictures.find(
      (picture) =>
        picture.position.x === hoverState.position.x &&
        picture.position.y === hoverState.position.y,
    );
    if (fallback) return fallback;

    return null;
  }

  private resolveContextMenuSelectionTarget(
    context: EventContext,
    hoveredPicture: Picture | null,
  ): ContextMenuSelectionTarget | null {
    const { state, toolState } = this.getState();
    const hoveredObject = toolState?.hoveredObject;

    if (
      hoveredObject &&
      (this.isObjectSelectable() ||
        Boolean(findSessionArtifact(state, hoveredObject))) &&
      this.isObjectPresent(hoveredObject)
    ) {
      return { type: "object", object: hoveredObject };
    }

    const object =
      this.isObjectSelectable() && !hoveredPicture
        ? this.selectionHitTester.findObject(context.worldPos)
        : null;
    if (object) {
      return { type: "object", object };
    }

    const vertex = this.isPolygonSelectable()
      ? findVertexNearPosition(
          context.worldPos,
          state.polygons,
          selectionThresholds.vertex / state.zoom,
        )
      : null;
    if (vertex) {
      return {
        type: "vertex",
        polygon: vertex.polygon,
        vertex: vertex.vertex,
      };
    }

    const polygon = this.isPolygonSelectable()
      ? findPolygonEdgeNearPosition(
          context.worldPos,
          state.polygons,
          selectionThresholds.polygonEdge / state.zoom,
          this.isSelectablePolygonEdge,
        )
      : null;
    if (polygon) {
      return { type: "polygon", polygon };
    }

    if (hoveredPicture && this.isPictureSelectable(hoveredPicture)) {
      return { type: "picture", picture: hoveredPicture.position };
    }

    return null;
  }

  private addContextMenuSelectionTarget(
    target: ContextMenuSelectionTarget,
  ): void {
    switch (target.type) {
      case "object":
        this.selectionMutations.addObject(target.object);
        return;
      case "vertex":
        this.selectionMutations.addVertex(target.polygon, target.vertex);
        return;
      case "polygon":
        this.selectionMutations.replacePolygon(target.polygon);
        return;
      case "picture":
        this.selectionMutations.addPicture(target.picture);
        return;
    }
  }

  private replaceSelectionWithContextMenuTarget(
    target: ContextMenuSelectionTarget,
  ): void {
    const { setToolState } = this.getState();

    switch (target.type) {
      case "object":
        setToolState({
          selectedVertices: [],
          selectedObjects: [target.object],
          selectedPictures: [],
        });
        return;
      case "vertex":
        setToolState({
          selectedVertices: [
            { polygon: target.polygon, vertex: target.vertex },
          ],
          selectedObjects: [],
          selectedPictures: [],
        });
        return;
      case "polygon":
        setToolState({
          selectedVertices: target.polygon.vertices.map((vertex) => ({
            polygon: target.polygon,
            vertex,
          })),
          selectedObjects: [],
          selectedPictures: [],
        });
        return;
      case "picture":
        setToolState({
          selectedVertices: [],
          selectedObjects: [],
          selectedPictures: [target.picture],
        });
        return;
    }
  }

  onPointerDown(event: PointerEvent, context: EventContext): boolean {
    this.pruneHiddenSelection();
    if (this.getState().toolState?.transformMode) {
      const target = this.getTransformTarget(context.worldPos);
      if (target) {
        this.startTransformDrag(target, context.worldPos);
        return true;
      }
      const { state, toolState } = this.getState();
      const picture = this.resolveHoveredPictureFromState(
        state,
        toolState?.hoveredPictureBounds,
      );
      if (
        !checkModifierKey(event) &&
        this.selectionHitTester.isSelectionHit(context.worldPos, picture)
      ) {
        this.startTransformDrag("move", context.worldPos);
        return true;
      }
      // Empty box space keeps normal selection behavior rather than capturing drags.
      this.getState().setToolState({ transformMode: false });
    }
    const { state, toolState } = this.getState();
    const hoveredObject = toolState?.hoveredObject;
    const hoveredPicture = this.resolveHoveredPictureFromState(
      state,
      toolState?.hoveredPictureBounds,
    );

    const modifier = checkModifierKey(event);
    const forceObjectSelection = event.altKey || event.shiftKey;
    const isSingleSelect = !modifier;

    if (
      isSingleSelect &&
      this.selectionHitTester.isSelectionHit(context.worldPos, hoveredPicture)
    ) {
      this.startDragging(context.worldPos);
      return true;
    }

    const clearIfNewSingleSelect = (isSelected: boolean | undefined) => {
      if (isSingleSelect && !isSelected) {
        this.clear();
      }
    };

    if (toolState?.selectedObjects.length) {
      const selectedObject = this.selectionHitTester.findSelectedObject(
        context.worldPos,
        toolState.selectedObjects,
        Math.max(selectionThresholds.object / state.zoom, OBJECT_DIAMETER / 2),
      );
      if (selectedObject) {
        if (modifier) {
          this.selectionMutations.toggleObject(selectedObject);
          return true;
        }
        this.selectionMutations.addObject(selectedObject);
        this.startDragging(context.worldPos);
        return true;
      }
    }

    if (hoveredObject) {
      const isSelected = isObjectSelected(
        hoveredObject,
        toolState?.selectedObjects ?? [],
      );
      clearIfNewSingleSelect(isSelected);
      if (modifier && isSelected) {
        this.selectionMutations.toggleObject(hoveredObject);
        return true;
      }
      this.selectionMutations.addObject(hoveredObject);
      this.startDragging(context.worldPos);
      return true;
    }

    if (forceObjectSelection && this.isObjectSelectable()) {
      const object = this.selectionHitTester.findObject(context.worldPos);
      if (object) {
        const isSelected = isObjectSelected(
          object,
          toolState?.selectedObjects ?? [],
        );
        clearIfNewSingleSelect(isSelected);
        if (modifier && isSelected) {
          this.selectionMutations.toggleObject(object);
          return true;
        }
        this.selectionMutations.addObject(object);
        this.startDragging(context.worldPos);
        return true;
      }
    }

    const object =
      this.isObjectSelectable() && !hoveredPicture
        ? this.selectionHitTester.findObject(context.worldPos)
        : null;
    if (object) {
      const isSelected = isObjectSelected(
        object,
        toolState?.selectedObjects ?? [],
      );
      clearIfNewSingleSelect(isSelected);
      if (modifier && isSelected) {
        this.selectionMutations.toggleObject(object);
        return true;
      }
      this.selectionMutations.addObject(object);
      this.startDragging(context.worldPos);
      return true;
    }

    const vertex = this.isPolygonSelectable()
      ? findVertexNearPosition(
          context.worldPos,
          state.polygons,
          selectionThresholds.vertex / state.zoom,
        )
      : null;
    if (vertex) {
      const isSelected = isVertexSelected(
        { polygon: vertex.polygon, vertex: vertex.vertex },
        toolState?.selectedVertices ?? [],
      );

      clearIfNewSingleSelect(isSelected);
      if (modifier && isSelected) {
        this.selectionMutations.toggleVertex(vertex.polygon, vertex.vertex);
        return true;
      }
      this.selectionMutations.addVertex(vertex.polygon, vertex.vertex);
      this.startDragging(context.worldPos);
      return true;
    }

    const polygonEdge = this.isPolygonSelectable()
      ? findPolygonEdgeNearPosition(
          context.worldPos,
          state.polygons,
          selectionThresholds.polygonEdge / state.zoom,
          this.isSelectablePolygonEdge,
        )
      : null;
    if (polygonEdge) {
      const polygonSelectionCount = toolState
        ? toolState.selectedVertices.filter(
            (sv: VertexSelection) => sv.polygon === polygonEdge,
          ).length
        : 0;
      const isSelected =
        polygonSelectionCount === polygonEdge.vertices.length &&
        polygonSelectionCount > 0;
      clearIfNewSingleSelect(isSelected);
      if (modifier && isSelected) {
        this.selectionMutations.togglePolygon(polygonEdge);
        return true;
      }
      this.selectionMutations.replacePolygon(polygonEdge);
      this.startDragging(context.worldPos);
      return true;
    }

    if (hoveredPicture) {
      const isSelected = toolState?.selectedPictures.includes(
        hoveredPicture.position,
      );
      clearIfNewSingleSelect(isSelected);
      if (modifier && isSelected) {
        this.selectionMutations.togglePicture(hoveredPicture.position);
        return true;
      }
      this.selectionMutations.addPicture(hoveredPicture.position);
      this.startDragging(context.worldPos);
      return true;
    }

    this.startMarqueeSelection(context.worldPos, modifier);
    return true;
  }

  onPointerMove(event: PointerEvent, context: EventContext): boolean {
    if (this.transformDrag) {
      this.handleTransformDrag(
        context.worldPos,
        checkModifierKey(event),
        event.altKey,
      );
      return true;
    }
    if (this.isDragging) {
      this.handleDragging(context.worldPos, event.shiftKey, event.altKey);
      return true;
    }

    if (this.isMarqueeSelecting) {
      this.marqueeEndPos = context.worldPos;
      this.appendLassoPoint(context.worldPos);
      return true;
    }

    return false;
  }

  onPointerUp(_event: PointerEvent, _context: EventContext): boolean {
    if (this.transformDrag) {
      const complete = _event.type !== "pointercancel";
      this.finishTransformDrag(
        complete,
        complete
          ? () =>
              this.handleTransformDrag(
                _context.worldPos,
                _event.shiftKey,
                _event.altKey,
              )
          : undefined,
      );
      return true;
    }
    if (this.isDragging) {
      const complete = _event.type !== "pointercancel";
      this.isDragging = false;
      this.getState().setToolState({ isDragging: false });
      this.endDragEdit(
        complete,
        complete
          ? () =>
              this.handleDragging(
                _context.worldPos,
                _event.shiftKey,
                _event.altKey,
              )
          : undefined,
      );
      return true;
    }

    if (this.isMarqueeSelecting) {
      if (_event.type === "pointercancel") this.cancelAreaSelection();
      else {
        this.marqueeEndPos = _context.worldPos;
        this.appendLassoPoint(_context.worldPos, true);
        this.finalizeMarqueeSelection();
        this.finishAreaSelection();
      }
      return true;
    }

    return false;
  }

  onKeyDown(event: KeyboardEvent, context: EventContext): boolean {
    this.pruneHiddenSelection();
    const modifier = checkModifierKey(event);
    if (event.key === "Escape" && this.isMarqueeSelecting) {
      this.cancelAreaSelection();
      event.preventDefault();
      return true;
    }

    if (this.isDragging && !this.transformDrag && event.key === "Escape") {
      this.isDragging = false;
      this.endDragEdit(false);
      event.preventDefault();
      return true;
    }
    if (this.transformDrag) {
      if (event.key === "Escape") this.finishTransformDrag(false);
      event.preventDefault();
      return true;
    }
    if (
      !modifier &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === "r"
    ) {
      if (!event.repeat && this.canTransformSelection()) this.toggleTransform();
      event.preventDefault();
      return true;
    }
    if (event.key === "Escape" && this.getState().toolState?.transformMode) {
      this.getState().setToolState({ transformMode: false });
      event.preventDefault();
      return true;
    }

    const nudgeDirection = keyboardNudgeDirections[event.key];
    if (
      nudgeDirection &&
      !this.isDragging &&
      !this.isMarqueeSelecting &&
      this.hasSelection()
    ) {
      this.keyboardMoveKeys.add(event.key);
      this.nudgeSelection(nudgeDirection, event.shiftKey, event.altKey);
      event.preventDefault();
      return true;
    }

    if (modifier && (event.key === "]" || event.key === "[")) {
      const arranged = this.arrangeSelectedPictures(
        event.key === "]"
          ? event.shiftKey
            ? "front"
            : "forward"
          : event.shiftKey
            ? "back"
            : "backward",
      );
      if (arranged) {
        event.preventDefault();
        return true;
      }
    }

    if (modifier && event.key.toLowerCase() === "d") {
      if (this.duplicateSelectionWithOffset()) {
        event.preventDefault();
        return true;
      }
    }

    if (modifier && event.key.toLowerCase() === "c") {
      if (this.copySelection()) {
        void this.copySelectionToSystemClipboard();
        event.preventDefault();
        return true;
      }
    }

    if (modifier && event.key.toLowerCase() === "v") {
      if (this.canPasteSelection()) {
        void this.pasteFromSystemClipboard(context.worldPos);
        event.preventDefault();
        return true;
      }
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      this.deleteSelection();
      return true;
    }
    if (event.key === "Escape") {
      const { toolState } = this.getState();
      if (toolState?.contextMenuType) {
        this.closeContextMenu();
        return true;
      }

      this.clear();
      return true;
    }
    return false;
  }

  onKeyUp(event: KeyboardEvent): boolean {
    if (!keyboardNudgeDirections[event.key]) return false;
    this.keyboardMoveKeys.delete(event.key);
    if (!this.keyboardMoveEdit) return false;
    if (!this.keyboardMoveKeys.size) this.endKeyboardMove(true);
    event.preventDefault();
    return true;
  }

  public canTransformSelection(): boolean {
    const bounds = getTransformBounds(this.getTransformPoints());
    return Boolean(
      bounds && (bounds.maxX > bounds.minX || bounds.maxY > bounds.minY),
    );
  }

  public canSkewOrMirrorSelection(): boolean {
    const { state, toolState } = this.getState();
    return Boolean(
      toolState &&
      (toolState.selectedVertices.length ||
        toolState.selectedPictures.length ||
        toolState.selectedObjects.some(
          (object) =>
            findSessionArtifact(state, object)?.kind !== "referenceImage",
        )),
    );
  }

  public toggleTransform(skew = false): void {
    if (this.isDragging || this.isMarqueeSelecting || this.transformDrag)
      return;
    this.pruneHiddenSelection();
    const { toolState, setToolState } = this.getState();
    this.transformFrame = null;
    this.transformOrigin = null;
    this.getTransformFrame();
    const enabled =
      !(toolState?.transformMode && Boolean(toolState.skewMode) === skew) &&
      this.canTransformSelection();
    setToolState({
      transformMode: enabled,
      skewMode: enabled && skew,
      contextMenuType: undefined,
      contextMenuPosition: undefined,
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
    });
  }

  public getTransformMeasurements() {
    const frame = this.getTransformFrame();
    if (!frame || !this.transformOrigin) return null;
    const width = frame.bounds.maxX - frame.bounds.minX;
    const height = frame.bounds.maxY - frame.bounds.minY;
    return {
      width,
      height,
      scaleX: this.transformOrigin.width
        ? (width / this.transformOrigin.width) * 100
        : 100,
      scaleY: this.transformOrigin.height
        ? (height / this.transformOrigin.height) * 100
        : 100,
      angle: (frame.angle * 180) / Math.PI,
    };
  }

  public mirrorSelection(direction: MirrorSelectionDirection): void {
    if (this.isDragging || this.isMarqueeSelecting) return;
    this.pruneHiddenSelection();
    const { toolState } = this.getState();
    if (!toolState) return;
    const vertices = toolState.selectedVertices.length;
    const objects = toolState.selectedObjects.length;
    const objectOffsets = toolState.selectedObjects.map((object) =>
      this.getKuskiWheelMidpointOffset(object),
    );
    const geometry = this.getTransformGeometry();
    const points = geometry.points.map((point, index) => {
      const objectIndex = index - vertices;
      const offset = objectOffsets[objectIndex];
      return offset ? { x: point.x + offset.x, y: point.y + offset.y } : point;
    });
    const bounds = getTransformBounds(points);
    if (!toolState || !bounds) return;

    const center = getTransformCenter(bounds);
    const positions = points.map((point) => ({
      x: direction === "horizontal" ? 2 * center.x - point.x : point.x,
      y: direction === "vertical" ? 2 * center.y - point.y : point.y,
    }));
    this.edit("selection.mirror", () => {
      if (vertices)
        this.selectionMutations.moveVertices(positions.slice(0, vertices));
      if (objects) {
        this.selectionMutations.moveObjects(
          positions.slice(vertices, vertices + objects).map((point, index) => ({
            x: point.x - objectOffsets[index].x,
            y: point.y - objectOffsets[index].y,
          })),
        );
      }
      if (toolState.selectedPictures.length) {
        const pictures = toolState.selectedPictures.length;
        this.selectionMutations.movePictures(
          positions
            .slice(vertices + objects, vertices + objects + pictures)
            .map((point, index) => {
              // Reflect visual centres while retaining each picture's anchor offset.
              const origin = toolState.selectedPictures[index];
              const pictureCenter = points[vertices + objects + index];
              return {
                x: point.x + origin.x - pictureCenter.x,
                y: point.y + origin.y - pictureCenter.y,
              };
            }),
        );
      }
      for (const artifact of geometry.artifacts) {
        artifact.apply(
          positions.slice(artifact.start, artifact.start + artifact.length),
        );
      }
    });
    this.transformFrame = null;
    this.closeContextMenu();
  }

  private getKuskiWheelMidpointOffset(object: Position): Position {
    const { state } = this.getState();
    const artifact = findSessionArtifact(state, object);
    const circles =
      object === state.start
        ? getKuskiSelectionCircles({ start: object })
        : artifact?.selectionCircles;
    const firstWheel = circles?.[0];
    const secondWheel = circles?.[1];
    if (!firstWheel || !secondWheel) return { x: 0, y: 0 };
    return {
      x: (firstWheel.x + secondWheel.x) / 2 - object.x,
      y: (firstWheel.y + secondWheel.y) / 2 - object.y,
    };
  }

  getCursor(context: EventContext): string | undefined {
    if (!this.getState().toolState?.transformMode) return undefined;
    const target =
      this.transformDrag?.handle ?? this.getTransformTarget(context.worldPos);
    if (target === "rotate") {
      const frame = this.getTransformFrame();
      if (!frame) return undefined;
      // Lock onto the starting corner throughout a drag.
      const targetFrame = this.transformDrag?.frame ?? frame;
      const targetPosition = this.transformDrag
        ? this.dragStartPos
        : context.worldPos;
      const local = rotateTransformPoint(
        targetPosition,
        getTransformCenter(targetFrame.bounds),
        -targetFrame.angle,
      );
      const { minX, minY, maxX, maxY } = targetFrame.bounds;
      const corners = [
        { x: -1, y: -1, position: { x: minX, y: minY } },
        { x: 1, y: -1, position: { x: maxX, y: minY } },
        { x: -1, y: 1, position: { x: minX, y: maxY } },
        { x: 1, y: 1, position: { x: maxX, y: maxY } },
      ];
      const distance = (corner: (typeof corners)[number]) =>
        Math.hypot(local.x - corner.position.x, local.y - corner.position.y);
      const corner = corners.reduce((nearest, candidate) =>
        distance(candidate) < distance(nearest) ? candidate : nearest,
      );
      // Face along the corner's outward bisector, independent of pointer position.
      return getRotationCursor(corner.x, corner.y, frame.angle);
    }
    if (target === "move") return "move";
    if (!target) return undefined;
    if (this.getState().toolState?.skewMode) return target.cursor;
    const angle = this.getTransformFrame()?.angle ?? 0;
    return getResizeCursor(target.x, target.y, angle);
  }

  private getTransformPoints(): Position[] {
    return this.getTransformGeometry().points;
  }

  private getTransformGeometry(): {
    points: Position[];
    artifacts: ArtifactTransform[];
  } {
    const { state, toolState } = this.getState();
    if (!toolState) return { points: [], artifacts: [] };
    const points = [
      ...toolState.selectedVertices.map(({ vertex }) => vertex),
      ...toolState.selectedObjects,
      ...toolState.selectedPictures.map((position) => {
        const picture = state.pictures.find(
          (entry) => entry.position === position,
        );
        const size = picture && this.pictureDimensionsResolver(picture);
        return size
          ? { x: position.x + size.width / 2, y: position.y + size.height / 2 }
          : position;
      }),
    ];
    const artifacts: ArtifactTransform[] = [];
    for (const object of toolState.selectedObjects) {
      const artifact = findSessionArtifact(state, object);
      if (!artifact?.transformPoints?.length || !artifact.transform) continue;
      const start = points.length;
      points.push(...artifact.transformPoints);
      artifacts.push({
        start,
        length: artifact.transformPoints.length,
        apply: artifact.transform,
        restore: artifact.restoreTransform,
      });
    }
    return { points, artifacts };
  }

  private getTransformFrame(): TransformFrame | null {
    if (this.transformDrag) return this.transformDrag.previewFrame;
    const points = this.getTransformPoints();
    if (
      this.transformFrame &&
      fastDeepEqual(this.transformFrame.points, points)
    ) {
      return this.transformFrame.frame;
    }
    const bounds = getTransformBounds(points);
    if (!bounds) return null;
    const frame = { bounds, angle: 0 };
    this.transformOrigin = {
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    };
    this.transformFrame = { frame, points: points.map(clonePosition) };
    return frame;
  }

  private getTransformTarget(
    position: Position,
  ): TransformHandle | "rotate" | null {
    const { state } = this.getState();
    const frame = this.getTransformFrame();
    if (!frame || !this.canTransformSelection()) return null;
    const skewMode = this.getState().toolState?.skewMode;
    const local = skewMode
      ? position
      : rotateTransformPoint(
          position,
          getTransformCenter(frame.bounds),
          -frame.angle,
        );
    const resizeRadius = transformControls.resizeHitRadius / state.zoom;
    const resizeHandle = this.getFrameHandles(frame)
      .map((handle) => ({
        handle,
        distance: Math.hypot(
          local.x - handle.position.x,
          local.y - handle.position.y,
        ),
      }))
      .filter(({ distance }) => distance <= resizeRadius)
      .sort((a, b) => a.distance - b.distance)[0]?.handle;
    if (resizeHandle) return resizeHandle;
    if (skewMode) return null;

    // Rotation lives just outside each corner; direct handle hits always resize.
    const { minX, minY, maxX, maxY } = frame.bounds;
    const outside =
      local.x < minX || local.x > maxX || local.y < minY || local.y > maxY;
    if (!outside) return null;
    const rotationRadius = transformControls.rotationHitRadius / state.zoom;
    for (const x of [minX, maxX]) {
      for (const y of [minY, maxY]) {
        const distance = Math.hypot(local.x - x, local.y - y);
        if (distance > resizeRadius && distance <= rotationRadius)
          return "rotate";
      }
    }
    return null;
  }

  private getFrameCorners(frame: TransformFrame): TransformFrameCorners {
    if (frame.corners) return frame.corners;
    const { minX, minY, maxX, maxY } = frame.bounds;
    const center = getTransformCenter(frame.bounds);
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ].map((point) =>
      rotateTransformPoint(point, center, frame.angle),
    ) as TransformFrameCorners;
  }

  private getFrameHandles(frame: TransformFrame): TransformHandle[] {
    return this.getState().toolState?.skewMode
      ? getSkewHandles(this.getFrameCorners(frame))
      : getTransformHandles(frame.bounds);
  }

  private startTransformDrag(
    handle: TransformHandle | "rotate" | "move",
    worldPos: Position,
  ): void {
    const { toolState } = this.getState();
    const geometry = this.getTransformGeometry();
    const points = geometry.points.map(clonePosition);
    const frame = this.getTransformFrame();
    if (!frame || !toolState) return;
    this.startDragging(
      worldPos,
      handle === "rotate"
        ? "selection.rotate"
        : handle === "move"
          ? "selection.move"
          : toolState.skewMode
            ? "selection.skew"
            : "selection.resize",
    );
    this.transformDrag = new TransformSession({
      frame,
      handle,
      points,
      artifacts: geometry.artifacts,
      selection: toolState,
    });
  }

  private handleTransformDrag(
    worldPos: Position,
    constrainTransform: boolean,
    bypassGrid?: boolean,
  ): void {
    const drag = this.transformDrag;
    if (!drag) return;
    if (drag.handle === "move") {
      const delta = {
        x: worldPos.x - this.dragStartPos.x,
        y: worldPos.y - this.dragStartPos.y,
      };
      if (delta.x === 0 && delta.y === 0 && !this.dragHasChanges) return;
    }
    drag.update(worldPos, {
      startPosition: this.dragStartPos,
      constrain: constrainTransform,
      snapTranslation: (anchor, delta) =>
        this.snapTranslation(anchor, delta, bypassGrid),
    });
    this.applyTransformDrag();
  }

  private applyTransformDrag(): void {
    const drag = this.transformDrag;
    if (!drag) return;
    const positions = drag.getPositions();
    this.dragHasChanges = positions.some(
      (point, index) =>
        Math.hypot(
          point.x - drag.points[index].x,
          point.y - drag.points[index].y,
        ) > 1e-9,
    );
    const vertices = drag.selection.selectedVertices.length;
    const objects = drag.selection.selectedObjects.length;
    if (vertices)
      this.selectionMutations.moveVertices(positions.slice(0, vertices));
    if (objects)
      this.selectionMutations.moveObjects(
        positions.slice(vertices, vertices + objects),
      );
    const pictures = drag.selection.selectedPictures.length;
    if (pictures) {
      this.selectionMutations.movePictures(
        positions
          .slice(vertices + objects, vertices + objects + pictures)
          .map((point, index) => {
            // Picture anchors stay offset from their transformed visual centres.
            const origin = this.dragOriginPositions[vertices + objects + index];
            const center = drag.points[vertices + objects + index];
            return {
              x: point.x + origin.x - center.x,
              y: point.y + origin.y - center.y,
            };
          }),
      );
    }
    for (const artifact of drag.artifacts) {
      artifact.apply(
        positions.slice(artifact.start, artifact.start + artifact.length),
      );
    }
  }

  private finishTransformDrag(
    complete: boolean,
    finalUpdate?: () => void,
  ): void {
    const drag = this.transformDrag;
    if (!drag) return;
    try {
      this.endDragEdit(complete, finalUpdate);
      if (complete) {
        this.transformFrame = {
          frame: drag.previewFrame,
          points: this.getTransformPoints().map(clonePosition),
        };
      }
    } finally {
      this.transformDrag = null;
      this.isDragging = false;
      this.getState().setToolState({ isDragging: false });
    }
  }

  private getTransformOverlays(): WorldRenderOverlayItem[] {
    const { state, toolState } = this.getState();
    if (!toolState?.transformMode || !this.canTransformSelection()) return [];
    const frame = this.getTransformFrame();
    if (!frame) return [];
    const bounds = frame.bounds;
    const center = getTransformCenter(bounds);
    const skewMode = toolState.skewMode;
    const map = (point: Position) =>
      rotateTransformPoint(point, center, frame.angle);
    const framePoints = skewMode
      ? this.getFrameCorners(frame)
      : [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY },
        ].map(map);
    const color = uiColors.boundsSelected;
    const width = uiStrokeWidths.boundsSelectedScreen / state.zoom;
    const hovered =
      this.transformDrag?.handle ??
      (state.mouseOnCanvas
        ? this.getTransformTarget(state.mousePosition)
        : null);
    return [
      {
        type: "polyline",
        points: framePoints,
        closed: true,
        color,
        width,
        layer: "top",
      },
      ...this.getFrameHandles(frame).map((handle) =>
        createSelectionHandleOverlay(
          skewMode ? handle.position : map(handle.position),
          (typeof hovered === "object" &&
          hovered?.x === handle.x &&
          hovered?.y === handle.y
            ? transformControls.hoveredHandleRadius
            : transformControls.handleRadius) / state.zoom,
          width,
        ),
      ),
    ];
  }

  public hasSelection(): boolean {
    const { toolState } = this.getState();
    if (!toolState) return false;

    return (
      toolState.selectedVertices.length > 0 ||
      toolState.selectedObjects.length > 0 ||
      toolState.selectedPictures.length > 0
    );
  }

  public canDeleteSelection(): boolean {
    const { state, toolState } = this.getState();
    return Boolean(
      toolState &&
      (toolState.selectedVertices.length ||
        toolState.selectedPictures.length ||
        toolState.selectedObjects.some((object) => {
          const artifact = findSessionArtifact(state, object);
          return artifact ? Boolean(artifact.remove) : object !== state.start;
        })),
    );
  }

  public deleteCurrentSelection(): boolean {
    if (!this.hasSelection()) return false;
    this.deleteSelection();
    return true;
  }

  public canDuplicateSelection(): boolean {
    const { state, toolState } = this.getState();
    return Boolean(toolState && this.clipboard.canCopy(state, toolState));
  }

  public copyCurrentSelection(): boolean {
    if (!this.copySelection()) return false;
    void this.copySelectionToSystemClipboard();
    return true;
  }

  /** Only a single ordinary LGR picture may be traced into terrain. */
  public getSelectedPictureForConversion(): Picture | null {
    const { state, toolState } = this.getState();
    if (
      !toolState ||
      toolState.selectedPictures.length !== 1 ||
      toolState.selectedVertices.length !== 0 ||
      toolState.selectedObjects.length !== 0
    ) return null;
    const picture = state.pictures.find(
      (item) => item.position === toolState.selectedPictures[0],
    );
    return picture?.name && !picture.texture ? picture : null;
  }

  /** Commit a traced polygon silhouette, optionally filling its outer contours.
   * All expensive tracing and mask placement happens before the history mutation.
   */
  public convertSelectedPicture(
    assets: LgrAssets,
    texture?: { texture: string; distance: number; clip: Picture["clip"] },
  ): string | null {
    this.pruneHiddenSelection();
    const source = this.getSelectedPictureForConversion();
    if (!source) return "Select one regular picture to convert.";
    if (!assets.isReady()) return "The active LGR is still loading.";
    const traced = tracePictureSilhouette(source, assets);
    if (traced.error) return traced.error;
    const polygons = traced.contours.map(({ polygon }) => polygon);
    const pictures: Picture[] = [];
    if (texture) {
      if (!assets.getSprite(texture.texture)) {
        return "This texture is missing from the active LGR.";
      }
      const masks = standardSprites.textureMasks.flatMap((mask) => {
        const sprite = assets.getSpritePixels(mask);
        const fillMask = sprite && createFillMask(mask, sprite);
        return fillMask ? [fillMask] : [];
      });
      for (const contour of traced.contours) {
        if (contour.isHole) continue;
        const fill = generateTextureFill(contour.polygon, masks);
        if (fill.error) return fill.error;
        pictures.push(
          ...fill.placements.map((placement) => ({
            name: "",
            ...texture,
            mask: placement.mask,
            position: placement.position,
          })),
        );
      }
      if (pictures.length > 5000)
        return "This silhouette requires too many texture elements.";
    }

    const { state, setToolState } = this.getState();
    const prospectiveVertices = state.polygons.reduce(
      (sum, item) => sum + item.vertices.length, 0,
    ) + polygons.reduce((sum, item) => sum + item.vertices.length, 0);
    if (
      state.polygons.length + polygons.length > EOL_LEVEL_LIMITS.polygons ||
      prospectiveVertices > EOL_LEVEL_LIMITS.vertices ||
      state.pictures.length - 1 + pictures.length > EOL_LEVEL_LIMITS.pictures
    ) return "Conversion exceeds Elma level limits.";
    if (!state.pictures.includes(source)) return "The picture selection changed.";
    this.edit("picture.convert", () => {
      state.actions.setPolygons([...state.polygons, ...polygons]);
      state.actions.setPictures([
        ...state.pictures.filter((picture) => picture !== source),
        ...pictures,
      ]);
    });
    this.transformFrame = null;
    setToolState({
      selectedVertices: polygons.flatMap((polygon) =>
        polygon.vertices.map((vertex) => ({ polygon, vertex })),
      ),
      selectedObjects: [],
      selectedPictures: [],
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
      transformMode: false,
    });
    return null;
  }

  /** Replacement uses selected vertices and element anchors; the start is protected. */
  public getReplacementCount(): number {
    return this.getReplacementTargets().length;
  }

  private getReplacementTargets(): Position[] {
    const { state, toolState } = this.getState();
    if (!toolState) return [];
    return [
      ...new Set([
        ...toolState.selectedVertices
          .filter(
            ({ polygon, vertex }) =>
              state.polygons.includes(polygon) &&
              polygon.vertices.includes(vertex),
          )
          .map(({ vertex }) => vertex),
        ...toolState.selectedObjects.filter(
          (position) =>
            position !== state.start && this.isObjectPresent(position),
        ),
        ...toolState.selectedPictures.filter((position) =>
          state.pictures.some((picture) => picture.position === position),
        ),
      ]),
    ];
  }

  public replaceSelectionWithObject(
    kind: "apples" | "killers" | "flowers",
    apple: Omit<Apple, "position">,
  ): string | null {
    const origin = { x: 0, y: 0 };
    return this.replaceSelectionWithContent({
      polygons: [],
      apples: kind === "apples" ? [{ ...apple, position: origin }] : [],
      killers: kind === "killers" ? [origin] : [],
      flowers: kind === "flowers" ? [origin] : [],
      pictures: [],
    });
  }

  public replaceSelectionWithPicture(
    picture: Omit<Picture, "position">,
  ): string | null {
    return this.replaceSelectionWithContent({
      polygons: [],
      apples: [],
      killers: [],
      flowers: [],
      pictures: [{ ...picture, position: { x: 0, y: 0 } }],
    });
  }

  public async replaceSelectionWithCopiedContent(
    signal?: AbortSignal,
  ): Promise<string | null> {
    const { state, toolState } = this.getState();
    if (!toolState) return "Select vertices or elements to replace.";
    const sessionId = state.documentSession.clipboardSessionId;
    const documentSnapshot = {
      polygons: state.polygons,
      apples: state.apples,
      killers: state.killers,
      flowers: state.flowers,
      pictures: state.pictures,
    };
    // Reading a copy does not consume the source or change normal paste offsets.
    const content = await this.clipboard.readForReplacement();
    const current = this.getState();
    if (signal?.aborted) return "Replacement cancelled.";
    if (
      current.state.documentSession.clipboardSessionId !== sessionId ||
      current.state.activeToolId !== this.meta.id ||
      !fastDeepEqual(toolState, current.toolState) ||
      current.state.polygons !== documentSnapshot.polygons ||
      current.state.apples !== documentSnapshot.apples ||
      current.state.killers !== documentSnapshot.killers ||
      current.state.flowers !== documentSnapshot.flowers ||
      current.state.pictures !== documentSnapshot.pictures
    ) {
      return "The selection or level changed. Try again.";
    }
    if (!content) return "Copy level elements in Bear first.";
    return this.replaceSelectionWithContent(content);
  }

  private replaceSelectionWithContent(
    content: SelectionClipboard,
  ): string | null {
    this.pruneHiddenSelection();
    const { state, toolState, setToolState } = this.getState();
    const targets = this.getReplacementTargets();
    if (!toolState || targets.length === 0)
      return "Select vertices or elements to replace.";
    const center = getClipboardCenter(content);
    if (!center) return "Copy level elements in Bear first.";
    const pointCount =
      content.polygons.reduce(
        (total, polygon) => total + polygon.vertices.length,
        0,
      ) +
      content.apples.length +
      content.killers.length +
      content.flowers.length +
      content.pictures.length;
    if (pointCount * targets.length > 20000)
      return "Replacement is too large. Select fewer elements or copy a smaller group.";
    const added: SelectionClipboard = {
      polygons: [],
      apples: [],
      killers: [],
      flowers: [],
      pictures: [],
    };
    const atTarget = (point: Position, target: Position): Position => ({
      x: point.x - center.x + target.x,
      y: point.y - center.y + target.y,
    });
    for (const target of targets) {
      added.polygons.push(
        ...content.polygons.map((polygon) => ({
          ...polygon,
          vertices: polygon.vertices.map((point) => atTarget(point, target)),
        })),
      );
      added.apples.push(
        ...content.apples.map((apple) => ({
          ...apple,
          position: atTarget(apple.position, target),
        })),
      );
      added.killers.push(
        ...content.killers.map((point) => atTarget(point, target)),
      );
      added.flowers.push(
        ...content.flowers.map((point) => atTarget(point, target)),
      );
      added.pictures.push(
        ...content.pictures.map((picture) => ({
          ...picture,
          position: atTarget(picture.position, target),
        })),
      );
    }
    if (
      [
        ...added.polygons.flatMap((p) => p.vertices),
        ...added.apples.map((a) => a.position),
        ...added.killers,
        ...added.flowers,
        ...added.pictures.map((p) => p.position),
      ].some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
    ) {
      return "Replacement contains invalid coordinates.";
    }
    const vertices = new Map<Polygon, Set<Position>>();
    for (const { polygon, vertex } of toolState.selectedVertices) {
      const selected = vertices.get(polygon) ?? new Set<Position>();
      selected.add(vertex);
      vertices.set(polygon, selected);
    }
    const objects = new Set(toolState.selectedObjects);
    const pictures = new Set(toolState.selectedPictures);
    // Build the complete result before touching the document. Partial polygons follow Delete rules.
    const remainingPolygons = state.polygons.flatMap((polygon) => {
      const removed = vertices.get(polygon);
      if (!removed) return [polygon];
      const remaining = polygon.vertices.filter(
        (vertex) => !removed.has(vertex),
      );
      return remaining.length >= (polygon.grass ? 2 : 3)
        ? [{ ...polygon, vertices: remaining }]
        : [];
    });
    if (
      remainingPolygons.length + added.polygons.length > EOL_LEVEL_LIMITS.polygons ||
      remainingPolygons.some((p) => p.vertices.length > EOL_LEVEL_LIMITS.verticesPerPolygon) ||
      [...remainingPolygons, ...added.polygons].reduce(
        (sum, polygon) => sum + polygon.vertices.length, 0,
      ) > EOL_LEVEL_LIMITS.vertices ||
      state.apples.length + state.killers.length + state.flowers.length +
        added.apples.length + added.killers.length + added.flowers.length -
        [...objects].filter((point) =>
          state.apples.some((a) => a.position === point) ||
          state.killers.includes(point) ||
          state.flowers.includes(point)
        ).length + 1 > EOL_LEVEL_LIMITS.objects ||
      state.pictures.length - [...pictures].filter((point) =>
        state.pictures.some((p) => p.position === point)
      ).length + added.pictures.length > EOL_LEVEL_LIMITS.pictures
    ) return "Replacement exceeds Elma level limits.";

    this.edit("selection.replace", () => {
      state.actions.setPolygons([...remainingPolygons, ...added.polygons]);
      state.actions.setApples([
        ...state.apples.filter((apple) => !objects.has(apple.position)),
        ...added.apples,
      ]);
      state.actions.setKillers([
        ...state.killers.filter((point) => !objects.has(point)),
        ...added.killers,
      ]);
      state.actions.setFlowers([
        ...state.flowers.filter((point) => !objects.has(point)),
        ...added.flowers,
      ]);
      state.actions.setPictures([
        ...state.pictures.filter((picture) => !pictures.has(picture.position)),
        ...added.pictures,
      ]);
    });
    this.transformFrame = null;
    setToolState({
      selectedVertices: added.polygons.flatMap((polygon) =>
        polygon.vertices.map((vertex) => ({ polygon, vertex })),
      ),
      selectedObjects: [
        ...added.apples.map((apple) => apple.position),
        ...added.killers,
        ...added.flowers,
        ...(objects.has(state.start) ? [state.start] : []),
      ],
      selectedPictures: added.pictures.map((picture) => picture.position),
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
      transformMode: false,
    });
    return null;
  }

  public canArrangeSelection(): boolean {
    const { toolState } = this.getState();
    return Boolean(toolState && toolState.selectedPictures.length > 0);
  }

  public arrangeSelectedPictures(
    direction: ArrangeSelectionDirection,
  ): boolean {
    const { state, toolState } = this.getState();
    if (!toolState || toolState.selectedPictures.length === 0) return false;

    const nextPictures = arrangeSelectedPictures(
      state.pictures,
      toolState.selectedPictures,
      direction,
      this.hasObjects() ? [DEFAULT_OBJECT_RENDER_DISTANCE] : [],
    );
    if (!nextPictures) return false;

    this.edit("selection.arrange-pictures", () => {
      state.actions.setPictures(nextPictures);
    });
    this.closeContextMenu();
    return true;
  }

  public canPasteSelection(): boolean {
    return this.clipboard.canPaste();
  }

  public duplicateSelectionWithOffset(): boolean {
    const { state, toolState } = this.getState();
    if (!toolState) return false;
    const pasted = this.clipboard.duplicate(state, toolState);
    return pasted ? this.commitPaste(pasted) : false;
  }

  public selectOnlySelectionKind(kind: SelectSelectionKind): boolean {
    return this.selectSelectionKinds(new Set([kind]));
  }

  public selectSelectionKinds(
    kinds: ReadonlySet<SelectSelectionKind>,
    sourceSelection?: Pick<
      SelectToolState,
      "selectedVertices" | "selectedObjects" | "selectedPictures"
    >,
    options: { closeContextMenu?: boolean } = {},
  ): boolean {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState) return false;
    const selection = new SelectionVisibility(state).filterKinds(
      kinds,
      sourceSelection ?? toolState,
    );
    if (!selection) return false;

    setToolState({
      ...selection,
      contextMenuType:
        options.closeContextMenu === false
          ? toolState.contextMenuType
          : undefined,
      contextMenuPosition:
        options.closeContextMenu === false
          ? toolState.contextMenuPosition
          : undefined,
    });

    return true;
  }

  public selectAllVisible(
    pictureFilter: (picture: Picture) => boolean = () => true,
  ): boolean {
    const { state, setToolState } = this.getState();
    const selection = new SelectionVisibility(state).selectAll(pictureFilter);

    this.isDragging = false;
    this.isMarqueeSelecting = false;
    this.dragOriginPositions = [];
    this.endDragEdit(false);

    setToolState({
      ...selection,
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
    });

    return (
      selection.selectedVertices.length > 0 ||
      selection.selectedObjects.length > 0 ||
      selection.selectedPictures.length > 0
    );
  }

  getWorldOverlays({
    viewportRect,
  }: {
    viewportRect: WorldRect;
  }): WorldRenderOverlayItem[] {
    this.pruneHiddenSelection();
    const { state, toolState } = this.getState();
    if (!toolState) return [];
    const overlays = createSelectionOverlays({
      state,
      selection: toolState,
      viewportRect,
      isDragging: this.isDragging,
      areaSelection: this.isMarqueeSelecting
        ? {
            variant: this.areaSelectionVariant,
            start: this.marqueeStartPos,
            end: this.marqueeEndPos,
            lassoPath: this.lassoPath,
          }
        : null,
    });
    return [
      ...overlays.selection,
      ...this.getTransformOverlays(),
      ...overlays.area,
    ];
  }
  private isSelectablePolygonEdge = (polygon: Polygon, edgeIndex: number) => {
    const { toolState } = this.getState();
    return Boolean(
      toolState &&
      isPolygonEdgeSelectable(polygon, edgeIndex, toolState.selectedVertices),
    );
  };

  private startDragging(
    worldPos: Position,
    kind: EditorHistoryActionKind = "selection.move",
  ): void {
    const { toolState } = this.getState();
    if (!toolState) return;

    this.isDragging = true;
    this.getState().setToolState({ isDragging: true });
    this.dragStartPos = worldPos;
    this.dragHasChanges = false;
    this.beginDragEdit(kind);

    // Store original positions of selected items for delta calculations
    this.dragOriginPositions = getSelectionDragOrigins(toolState);
    this.dragConstraintDirections = getVertexDragConstraintDirections(
      toolState.selectedVertices,
    );
  }

  private startMarqueeSelection(worldPos: Position, modifier: boolean): void {
    const { toolState } = this.getState();
    const before = {
      selectedVertices: [...(toolState?.selectedVertices ?? [])],
      selectedObjects: [...(toolState?.selectedObjects ?? [])],
      selectedPictures: [...(toolState?.selectedPictures ?? [])],
    };
    if (!modifier) this.clear();
    this.areaSelectionBefore = before;
    this.areaSelectionVariant = toolState?.variant ?? "marquee";
    this.lassoPath = [worldPos];
    this.getState().setToolState({
      isMarqueeSelecting: true,
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
    });
    this.isMarqueeSelecting = true;
    this.marqueeStartPos = worldPos;
    this.marqueeEndPos = worldPos;
  }

  private appendLassoPoint(position: Position, force = false): void {
    if (this.areaSelectionVariant !== "lasso") return;
    const last = this.lassoPath.at(-1);
    if (
      !force &&
      last &&
      Math.hypot(position.x - last.x, position.y - last.y) *
        this.getState().state.zoom <
        2
    )
      return;
    if (this.lassoPath.length >= 4096)
      this.lassoPath = this.lassoPath.filter((_, i) => i % 2 === 0);
    this.lassoPath.push(position);
  }

  private finishAreaSelection(): void {
    this.isMarqueeSelecting = false;
    this.lassoPath = [];
    this.areaSelectionBefore = null;
    this.getState().setToolState({ isMarqueeSelecting: false });
  }

  private cancelAreaSelection(): void {
    if (this.areaSelectionBefore)
      this.getState().setToolState(this.areaSelectionBefore);
    this.finishAreaSelection();
  }

  private handleDragging(
    worldPos: Position,
    shouldConstrain: boolean,
    bypassGrid?: boolean,
  ): void {
    const { toolState } = this.getState();
    if (!toolState) return;
    const rawDelta = {
      x: worldPos.x - this.dragStartPos.x,
      y: worldPos.y - this.dragStartPos.y,
    };
    if (rawDelta.x === 0 && rawDelta.y === 0 && !this.dragHasChanges) return;
    const positions = calculateSelectionDrag({
      selection: toolState,
      origins: this.dragOriginPositions,
      start: this.dragStartPos,
      current: worldPos,
      constraintDirections: this.dragConstraintDirections,
      constrain: shouldConstrain,
      snap: (anchor, delta) => this.snapTranslation(anchor, delta, bypassGrid),
    });
    const changed = [
      ...positions.vertices,
      ...positions.objects,
      ...positions.pictures,
    ].some(
      (position, index) =>
        position.x !== this.dragOriginPositions[index].x ||
        position.y !== this.dragOriginPositions[index].y,
    );
    if (!changed && !this.dragHasChanges) return;
    this.dragHasChanges = true;
    if (positions.vertices.length)
      this.selectionMutations.moveVertices(positions.vertices);
    if (positions.objects.length)
      this.selectionMutations.moveObjects(positions.objects);
    if (positions.pictures.length)
      this.selectionMutations.movePictures(positions.pictures);
  }

  private nudgeSelection(
    direction: Position,
    largeStep: boolean,
    bypassGrid: boolean,
  ): void {
    const { state, toolState } = this.getState();
    if (!toolState) return;
    const step =
      (state.grid.snap && !bypassGrid ? state.grid.size : KEYBOARD_NUDGE_STEP) *
      (largeStep ? KEYBOARD_NUDGE_MULTIPLIER : 1);
    const origins = getSelectionDragOrigins(toolState);
    const rawDelta = {
      x: direction.x * step,
      y: direction.y * step,
    } as Position;
    const delta = origins[0]
      ? this.snapTranslation(origins[0], rawDelta, bypassGrid)
      : rawDelta;
    const positions = origins.map(
      (origin) =>
        ({ x: origin.x + delta.x, y: origin.y + delta.y }) as Position,
    );
    const vertices = toolState.selectedVertices.length;
    const objects = toolState.selectedObjects.length;

    this.keyboardMoveEdit ??= this.beginEdit("selection.move");
    this.keyboardMoveEdit.update(() => {
      if (vertices)
        this.selectionMutations.moveVertices(positions.slice(0, vertices));
      if (objects)
        this.selectionMutations.moveObjects(
          positions.slice(vertices, vertices + objects),
        );
      if (toolState.selectedPictures.length)
        this.selectionMutations.movePictures(
          positions.slice(vertices + objects),
        );
    });
  }

  private finalizeMarqueeSelection(): void {
    const lasso = this.areaSelectionVariant === "lasso";
    if (lasso && this.lassoPath.length < 3) return;
    const { state } = this.getState();
    const selection = findAreaSelection({
      state,
      start: this.marqueeStartPos,
      end: this.marqueeEndPos,
      lassoPath: lasso ? this.lassoPath : null,
      pictureDimensions: this.pictureDimensionsResolver,
      polygonsSelectable: this.isPolygonSelectable(),
      objectsSelectable: this.isObjectSelectable(),
      pictureSelectable: (picture) => this.isPictureSelectable(picture),
    });
    for (const { polygon, vertex } of selection.selectedVertices)
      this.selectionMutations.addVertex(polygon, vertex);
    for (const object of selection.selectedObjects)
      this.selectionMutations.addObject(object);
    for (const picture of selection.selectedPictures)
      this.selectionMutations.addPicture(picture);
  }

  private isPolygonSelectable(): boolean {
    return new SelectionVisibility(this.getState().state).polygonsSelectable();
  }

  private isObjectSelectable(): boolean {
    return new SelectionVisibility(this.getState().state).objectsSelectable();
  }

  private isPictureSelectable(picture: {
    texture?: string;
    mask?: string;
  }): boolean {
    return new SelectionVisibility(this.getState().state).pictureSelectable(
      picture,
    );
  }

  private isObjectPresent(object: Position): boolean {
    return new SelectionVisibility(this.getState().state).objectPresent(object);
  }

  private hasObjects(): boolean {
    return new SelectionVisibility(this.getState().state).hasLevelObjects();
  }

  private isPolygonEdgeSelected(
    polygon: Polygon,
    edgeIndex: number,
    selectedVertices?: ReadonlySet<Position>,
  ): boolean {
    const { toolState } = this.getState();
    return Boolean(
      toolState &&
      isPolygonEdgeSelected(
        polygon,
        edgeIndex,
        selectedVertices ?? toolState.selectedVertices,
      ),
    );
  }

  private pruneHiddenSelection(): void {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState) return;
    const selection = new SelectionVisibility(state).reconcile(toolState);
    if (selection) setToolState(selection);
  }

  private beginDragEdit(kind: EditorHistoryActionKind) {
    if (this.dragEdit?.active) return;
    this.dragEdit = this.beginEdit(kind);
  }

  private endDragEdit(complete: boolean, finalUpdate?: () => void) {
    const edit = this.dragEdit;
    try {
      if (complete) edit?.complete(finalUpdate);
      else edit?.cancel();
    } finally {
      this.dragEdit = null;
      this.dragHasChanges = false;
    }
  }

  private endKeyboardMove(complete: boolean) {
    const edit = this.keyboardMoveEdit;
    try {
      if (complete) edit?.complete();
      else edit?.cancel();
    } finally {
      this.keyboardMoveEdit = null;
      this.keyboardMoveKeys.clear();
    }
  }

  private copySelection(): boolean {
    const { state, toolState } = this.getState();
    return Boolean(toolState && this.clipboard.copy(state, toolState));
  }

  private async copySelectionToSystemClipboard(): Promise<void> {
    const { state } = this.getState();
    await this.clipboard.copyToSystemClipboard(
      state.documentSession.clipboardSessionId,
    );
  }

  public async pasteFromSystemClipboard(anchor: Position): Promise<boolean> {
    const { state } = this.getState();
    const pasted = await this.clipboard.readForPaste(
      anchor,
      state.documentSession.clipboardSessionId,
    );
    if (
      pasted &&
      this.store.getState().documentSession.clipboardSessionId ===
        state.documentSession.clipboardSessionId
    )
      return this.commitPaste(pasted);
    return false;
  }

  private commitPaste(pasted: PastedSelection): boolean {
    const { state, setToolState } = this.getState();
    this.edit("selection.paste", () => {
      if (pasted.polygons.length > 0) {
        state.actions.setPolygons([...state.polygons, ...pasted.polygons]);
      }
      if (pasted.apples.length > 0) {
        state.actions.setApples([...state.apples, ...pasted.apples]);
      }
      if (pasted.killers.length > 0) {
        state.actions.setKillers([...state.killers, ...pasted.killers]);
      }
      if (pasted.flowers.length > 0) {
        state.actions.setFlowers([...state.flowers, ...pasted.flowers]);
      }
      if (pasted.pictures.length > 0) {
        state.actions.setPictures([...state.pictures, ...pasted.pictures]);
      }
      setToolState({
        selectedVertices: pasted.selectedVertices,
        selectedObjects: pasted.selectedObjects,
        selectedPictures: pasted.selectedPictures,
        hoveredObject: undefined,
        hoveredPictureBounds: undefined,
        contextMenuType: undefined,
      });
    });

    return true;
  }

  private deleteSelection(): void {
    this.edit("selection.delete", () => {
      this.selectionMutations.deleteSelection();
      this.clear();
    });
  }
}

function clonePosition(position: Position): Position {
  return { x: position.x, y: position.y };
}
