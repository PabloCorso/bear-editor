import { Tool } from "./tool-interface";
import type { EventContext } from "~/editor/helpers/event-handler";
import {
  findVertexNearPosition,
  findObjectNearPosition,
  findPolygonEdgeNearPosition,
  isVertexSelected,
  isObjectSelected,
  getAllObjects,
  isPointInRect,
  getSelectionBounds,
  isStartObjectHit,
  type StartSelectionMode,
} from "~/editor/helpers/selection-helpers";
import {
  colors,
  OBJECT_DIAMETER,
  selectionRenderLimits,
  selectionThresholds,
  uiColors,
  uiSelectionHandle,
  uiStrokeWidths,
} from "~/editor/constants";
import type { Apple, Picture, Polygon, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";
import type { EditorStore, PartialEditorState } from "~/editor/editor-store";
import { defaultTools } from "./default-tools";
import type { WorldRect } from "~/editor/render/world-geometry";
import {
  isPointVisible,
  isPolygonVisible,
} from "~/editor/render/world-derived-data-cache";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";
import { checkModifierKey } from "~/utils/misc";
import fastDeepEqual from "fast-deep-equal";
import { getKuskiSelectionCircles } from "~/editor/kuski-geometry";
import { getObjectBoundsRadius } from "~/editor/render/object-assets";

const DUPLICATE_OFFSET_STEP = 1;

export type SelectToolState = {
  selectedVertices: Array<{ polygon: Polygon; vertex: Position }>;
  selectedObjects: Position[];
  selectedPictures: Position[];
  isDragging: boolean;
  isMarqueeSelecting?: boolean;
  hoveredObject?: Position;
  hoveredPictureBounds?: {
    position: Position;
    width: number;
    height: number;
    distance: number;
  };
  contextMenuType?: "apple" | "killer" | "flower" | "picture" | "vertex";
  contextMenuPosition?: Position;
};

type VertexSelection = { polygon: Polygon; vertex: Position };
type ObjectSelection = Position;
type SelectionClipboard = {
  polygons: Polygon[];
  apples: Apple[];
  killers: Position[];
  flowers: Position[];
  pictures: Picture[];
};

type SerializedSelectionClipboard = {
  type: "elma-selection";
  version: 1;
  sourceClipboardSessionId: string;
  payload: SelectionClipboard;
};

const SELECTION_CLIPBOARD_TYPE = "elma-selection";
const SELECTION_CLIPBOARD_VERSION = 1;

export class SelectTool extends Tool<SelectToolState> {
  readonly meta = defaultTools.select;
  private clipboard: SelectionClipboard | null = null;
  private clipboardPasteCount = 0;

  constructor(store: EditorStore) {
    super(store);
  }

  private isDragging = false;
  private dragStartPos = { x: 0, y: 0 };
  private dragOriginPositions: Position[] = [];
  private dragConstraintDirections: Position[] = [];
  private isMarqueeSelecting = false;
  private marqueeStartPos = { x: 0, y: 0 };
  private marqueeEndPos = { x: 0, y: 0 };
  private dragHistoryStart: PartialEditorState | null = null;
  private dragHasChanges = false;
  private isHistoryPaused = false;

  onDeactivate(): void {
    this.clear();
  }

  clear(): void {
    const { setToolState } = this.getState();
    setToolState({
      selectedVertices: [],
      selectedObjects: [],
      selectedPictures: [],
      isDragging: false,
      isMarqueeSelecting: false,
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
      contextMenuPosition: undefined,
    });
    this.isDragging = false;
    this.isMarqueeSelecting = false;
    this.dragOriginPositions = [];
    this.dragConstraintDirections = [];
    this.endDragHistoryBatch(false);
  }

  onRightClick(event: MouseEvent, context: EventContext) {
    const { state, toolState, setToolState } = this.getState();
    const forceObjectSelection = event.altKey || event.shiftKey;
    this.pruneHiddenSelection();

    const hoveredPicture = this.resolveHoveredPictureFromState(
      state,
      toolState?.hoveredPictureBounds,
    );
    const object =
      this.isObjectSelectable() && (forceObjectSelection || !hoveredPicture)
        ? this.findObjectNearPosition(context.worldPos)
        : null;
    const isApple = object
      ? state.apples.some((a) => a.position === object)
      : false;
    if (object && isApple) {
      this.clear();
      this.selectObject(object);
      setToolState({
        contextMenuType: "apple",
        contextMenuPosition: { x: context.screenX, y: context.screenY },
      });
      return true;
    }

    if (hoveredPicture) {
      this.clear();
      this.selectPicture(hoveredPicture.position);
      setToolState({
        contextMenuType: "picture",
        contextMenuPosition: { x: context.screenX, y: context.screenY },
      });
      return true;
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
      this.clear();
      this.selectPolygon(polygon);
      setToolState({
        contextMenuType: "vertex",
        contextMenuPosition: { x: context.screenX, y: context.screenY },
      });
      return true;
    }

    return false;
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

  onPointerDown(event: PointerEvent, context: EventContext): boolean {
    this.pruneHiddenSelection();
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
      this.isExistingSelectionHit(context.worldPos, hoveredPicture)
    ) {
      this.startDragging(context.worldPos);
      return true;
    }

    const clearIfNewSingleSelect = (isSelected: boolean | undefined) => {
      if (isSingleSelect && !isSelected) {
        this.clear();
      }
    };

    if (toolState?.selectedObjects.length && this.isObjectSelectable()) {
      const selectedObject = this.findSelectedObjectNearPosition(
        context.worldPos,
        toolState.selectedObjects,
        Math.max(selectionThresholds.object / state.zoom, OBJECT_DIAMETER / 2),
        {
          // For already-selected objects, prefer the visual bounds hit-test over
          // full sprite image so overlapping pictures/textures can still win.
          useStartImageSelection: false,
        },
      );
      if (selectedObject) {
        this.selectObject(selectedObject);
        this.startDragging(context.worldPos);
        return true;
      }

      clearIfNewSingleSelect(false);
    }

    if (hoveredObject) {
      const isSelected = isObjectSelected(
        hoveredObject,
        toolState?.selectedObjects ?? [],
      );
      clearIfNewSingleSelect(isSelected);
      this.selectObject(hoveredObject);
      this.startDragging(context.worldPos);
      return true;
    }

    if (forceObjectSelection && this.isObjectSelectable()) {
      const object = this.findObjectNearPosition(context.worldPos);
      if (object) {
        const isSelected = isObjectSelected(
          object,
          toolState?.selectedObjects ?? [],
        );
        clearIfNewSingleSelect(isSelected);
        this.selectObject(object);
        this.startDragging(context.worldPos);
        return true;
      }
    }

    const object =
      this.isObjectSelectable() && !hoveredPicture
        ? this.findObjectNearPosition(context.worldPos)
        : null;
    if (object) {
      const isSelected = isObjectSelected(
        object,
        toolState?.selectedObjects ?? [],
      );
      clearIfNewSingleSelect(isSelected);
      this.selectObject(object);
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
      this.selectVertex(vertex.polygon, vertex.vertex);
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
      this.selectPolygon(polygonEdge);
      this.startDragging(context.worldPos);
      return true;
    }

    if (hoveredPicture) {
      const isSelected = toolState?.selectedPictures.includes(
        hoveredPicture.position,
      );
      clearIfNewSingleSelect(isSelected);
      this.selectPicture(hoveredPicture.position);
      this.startDragging(context.worldPos);
      return true;
    }

    this.startMarqueeSelection(context.worldPos, modifier);
    return true;
  }

  onPointerMove(event: PointerEvent, context: EventContext): boolean {
    if (this.isDragging) {
      this.handleDragging(context.worldPos, event.shiftKey);
      return true;
    }

    if (this.isMarqueeSelecting) {
      this.marqueeEndPos = context.worldPos;
      return true;
    }

    return false;
  }

  onPointerUp(_event: PointerEvent, _context: EventContext): boolean {
    if (this.isDragging) {
      this.isDragging = false;
      this.getState().setToolState({ isDragging: false });
      this.endDragHistoryBatch(true);
      return true;
    }

    if (this.isMarqueeSelecting) {
      this.finalizeMarqueeSelection();
      this.isMarqueeSelecting = false;
      this.getState().setToolState({ isMarqueeSelecting: false });
      return true;
    }

    return false;
  }

  onKeyDown(event: KeyboardEvent, context: EventContext): boolean {
    this.pruneHiddenSelection();
    const modifier = checkModifierKey(event);

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
      this.clear();
      return true;
    }
    return false;
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

  public deleteCurrentSelection(): boolean {
    if (!this.hasSelection()) return false;
    this.deleteSelection();
    return true;
  }

  public canDuplicateSelection(): boolean {
    return Boolean(this.buildClipboardFromSelection());
  }

  public canPasteSelection(): boolean {
    return this.clipboard !== null || this.canAccessSystemClipboard();
  }

  public duplicateSelectionWithOffset(): boolean {
    if (!this.copySelection()) return false;
    return this.pasteClipboardWithMargin();
  }

  public selectAllVisible(
    pictureFilter: (picture: Picture) => boolean = () => true,
  ): boolean {
    const { state, setToolState } = this.getState();

    const selectedVertices = this.isPolygonSelectable()
      ? state.polygons.flatMap((polygon) =>
          polygon.vertices.map((vertex) => ({ polygon, vertex })),
        )
      : [];
    const selectedObjects = this.isObjectSelectable()
      ? getAllObjects(
          state.apples.map((apple) => apple.position),
          state.killers,
          state.flowers,
          state.start,
        ).map(({ obj }) => obj)
      : [];
    const selectedPictures = state.pictures
      .filter(
        (picture) =>
          this.isPictureSelectable(picture) && pictureFilter(picture),
      )
      .map((picture) => picture.position);

    this.isDragging = false;
    this.isMarqueeSelecting = false;
    this.dragOriginPositions = [];
    this.endDragHistoryBatch(false);

    setToolState({
      selectedVertices,
      selectedObjects,
      selectedPictures,
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
    });

    return (
      selectedVertices.length > 0 ||
      selectedObjects.length > 0 ||
      selectedPictures.length > 0
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

    const overlays: WorldRenderOverlayItem[] = [];
    const handleSize = uiSelectionHandle.halfWidthPx / state.zoom;
    const hoverLineWidth = uiStrokeWidths.boundsHoverScreen / state.zoom;
    const selectedLineWidth = uiStrokeWidths.boundsSelectedScreen / state.zoom;
    const handleStrokeWidth = uiSelectionHandle.strokeWidthPx / state.zoom;

    if (!this.isDragging && !this.isMarqueeSelecting && state.mouseOnCanvas) {
      const { hoveredObject } = toolState;
      if (
        hoveredObject &&
        !toolState?.selectedObjects.includes(hoveredObject)
      ) {
        if (hoveredObject === state.start) {
          const circles = getKuskiSelectionCircles({ start: state.start });
          overlays.push(
            ...circles.map((circle) => ({
              type: "circle" as const,
              center: { x: circle.x, y: circle.y },
              radius: circle.radius,
              strokeColor: uiColors.boundsHover,
              lineWidth: hoverLineWidth,
            })),
          );
        } else if (isPointVisible(hoveredObject, viewportRect)) {
          overlays.push({
            type: "circle",
            center: hoveredObject,
            radius: OBJECT_DIAMETER / 2,
            strokeColor: uiColors.boundsHover,
            lineWidth: hoverLineWidth,
          });
        }
      }

      if (!this.isDragging && this.isPolygonSelectable()) {
        const hoveredObject = toolState.hoveredObject;

        if (!hoveredObject) {
          const hoveredVertex = findVertexNearPosition(
            state.mousePosition,
            state.polygons,
            selectionThresholds.vertex / state.zoom,
          );
          if (hoveredVertex) {
            if (isPointVisible(hoveredVertex.vertex, viewportRect)) {
              overlays.push(
                createSelectionHandleOverlay(
                  hoveredVertex.vertex,
                  handleSize,
                  handleStrokeWidth,
                ),
              );
            }
          }

          const hoveredPolygon = findPolygonEdgeNearPosition(
            state.mousePosition,
            state.polygons,
            selectionThresholds.polygonEdge / state.zoom,
            this.isSelectablePolygonEdge,
          );
          if (!hoveredVertex && hoveredPolygon) {
            const hoveredPolygonBoundsColor = uiColors.boundsHover;
            const polygonSelectionCount = toolState.selectedVertices.filter(
              (sv) => sv.polygon === hoveredPolygon,
            ).length;
            const isHoveredPolygonSelected =
              polygonSelectionCount === hoveredPolygon.vertices.length &&
              polygonSelectionCount > 0;
            if (
              !isHoveredPolygonSelected &&
              isPolygonVisible(hoveredPolygon, viewportRect)
            ) {
              overlays.push({
                type: "polyline",
                points: hoveredPolygon.vertices,
                closed: true,
                color: hoveredPolygonBoundsColor,
                width: hoverLineWidth,
              });
            }
          }
        }
      }
    }

    const selectedPolygons = Array.from(
      new Set(toolState.selectedVertices.map(({ polygon }) => polygon)),
    );
    overlays.push(
      ...selectedPolygons
        .filter(
          (polygon) =>
            polygon.vertices.length >= 2 &&
            isPolygonVisible(polygon, viewportRect),
        )
        .map((polygon) => {
          const selectedPolygonBoundsColor = polygon.grass
            ? colors.grass
            : uiColors.boundsSelected;
          return {
            type: "polyline" as const,
            points: polygon.vertices,
            closed: true,
            color: selectedPolygonBoundsColor,
            width: selectedLineWidth,
          };
        }),
    );

    overlays.push(
      ...toolState.selectedObjects.flatMap((position) => {
        if (position === state.start) {
          return getKuskiSelectionCircles({ start: state.start })
            .filter((circle) =>
              rectIntersectsViewport(
                {
                  minX: circle.x - circle.radius,
                  minY: circle.y - circle.radius,
                  maxX: circle.x + circle.radius,
                  maxY: circle.y + circle.radius,
                },
                viewportRect,
              ),
            )
            .map((circle) => ({
              type: "circle" as const,
              center: { x: circle.x, y: circle.y },
              radius: circle.radius,
              strokeColor: uiColors.boundsSelected,
              lineWidth: selectedLineWidth,
            }));
        }

        if (!isPointVisible(position, viewportRect)) return [];
        return [
          {
            type: "circle" as const,
            center: position,
            radius: getObjectBoundsRadius(),
            strokeColor: uiColors.boundsSelected,
            lineWidth: selectedLineWidth,
          },
        ];
      }),
    );

    const selectedHandlePositions = toolState.selectedVertices
      .map(({ vertex }) => vertex)
      .filter((position) => isPointVisible(position, viewportRect));
    const selectedObjectHandlePositions = toolState.selectedObjects.filter(
      (position) => isPointVisible(position, viewportRect),
    );
    const allSelected = [
      ...selectedHandlePositions,
      ...selectedObjectHandlePositions,
    ];
    if (
      allSelected.length <= selectionRenderLimits.maxIndividualHandles &&
      allSelected.length > 0
    ) {
      overlays.push(
        ...allSelected.map((position) =>
          createSelectionHandleOverlay(position, handleSize, handleStrokeWidth),
        ),
      );
    } else {
      if (allSelected.length > 0) {
        const selectedHandleStride = Math.max(
          1,
          Math.ceil(
            allSelected.length / selectionRenderLimits.maxIndividualHandles,
          ),
        );
        overlays.push(
          ...allSelected
            .filter((_, index) => index % selectedHandleStride === 0)
            .map((position) =>
              createSelectionHandleOverlay(
                position,
                handleSize,
                handleStrokeWidth,
              ),
            ),
        );
      }
    }

    if (this.isMarqueeSelecting) {
      const bounds = getSelectionBounds(
        this.marqueeStartPos,
        this.marqueeEndPos,
      );
      overlays.push(
        {
          type: "rect",
          position: { x: bounds.minX, y: bounds.minY },
          width: bounds.maxX - bounds.minX,
          height: bounds.maxY - bounds.minY,
          fillColor: uiColors.marqueeStroke,
          opacity: 0.16,
        },
        {
          type: "rect",
          position: { x: bounds.minX, y: bounds.minY },
          width: bounds.maxX - bounds.minX,
          height: bounds.maxY - bounds.minY,
          strokeColor: uiColors.marqueeStroke,
          lineWidth: uiSelectionHandle.strokeWidthPx / state.zoom,
        },
      );
    }

    return overlays;
  }

  private findObjectNearPosition(position: Position): Position | null {
    const { state } = this.getState();
    const objectSelectionThreshold = Math.max(
      selectionThresholds.object / state.zoom,
      OBJECT_DIAMETER / 2,
    );
    const useImageStartSelection = state.levelVisibility.showObjects;

    const apple = findObjectNearPosition(
      position,
      state.apples.map((a) => a.position),
      objectSelectionThreshold,
    );
    if (apple) return apple;

    const killer = findObjectNearPosition(
      position,
      state.killers,
      objectSelectionThreshold,
    );
    if (killer) return killer;

    const flower = findObjectNearPosition(
      position,
      state.flowers,
      objectSelectionThreshold,
    );
    if (flower) return flower;

    const start = isStartObjectHit(
      position,
      state.start,
      useImageStartSelection ? "boundsWithImage" : "boundsOnly",
      useImageStartSelection,
    );
    if (start) return state.start;

    return null;
  }

  private findSelectedObjectNearPosition(
    position: Position,
    objects: Position[],
    threshold: number,
    options?: {
      useStartImageSelection?: boolean;
    },
  ): Position | null {
    const { state } = this.getState();
    const startSelectionMode: StartSelectionMode =
      options?.useStartImageSelection ? "boundsWithImage" : "boundsOnly";

    for (const object of objects) {
      if (object === state.start) {
        const isHovered = isStartObjectHit(
          position,
          state.start,
          startSelectionMode,
          !!(
            state.levelVisibility.showObjects && options?.useStartImageSelection
          ),
        );
        if (isHovered) return object;
        continue;
      }

      if (findObjectNearPosition(position, [object], threshold)) {
        return object;
      }
    }

    return null;
  }

  private isExistingSelectionHit(
    position: Position,
    hoveredPicture: Picture | null,
  ): boolean {
    const { state, toolState } = this.getState();
    if (!toolState) return false;

    if (
      this.isObjectSelectable() &&
      this.findSelectedObjectNearPosition(
        position,
        toolState.selectedObjects,
        Math.max(selectionThresholds.object / state.zoom, OBJECT_DIAMETER / 2),
        {
          useStartImageSelection: false,
        },
      )
    ) {
      return true;
    }

    if (
      this.isPolygonSelectable() &&
      toolState.selectedVertices.some(({ polygon, vertex }) => {
        if (!state.polygons.includes(polygon)) return false;
        if (!polygon.vertices.includes(vertex)) return false;
        return isWithinVertexSelectionThreshold(position, vertex, state.zoom);
      })
    ) {
      return true;
    }

    if (
      this.isPolygonSelectable() &&
      findPolygonEdgeNearPosition(
        position,
        state.polygons,
        selectionThresholds.polygonEdge / state.zoom,
        (polygon, edgeIndex) =>
          this.isSelectablePolygonEdge(polygon, edgeIndex) &&
          this.isPolygonFullySelected(polygon),
      )
    ) {
      return true;
    }

    return hoveredPicture
      ? toolState.selectedPictures.includes(hoveredPicture.position)
      : false;
  }

  private isSelectablePolygonEdge = (polygon: Polygon, edgeIndex: number) => {
    const { toolState } = this.getState();
    const polygonSelectionCount =
      toolState?.selectedVertices.filter((sv) => sv.polygon === polygon)
        .length ?? 0;
    const isPolygonFullySelected =
      polygonSelectionCount === polygon.vertices.length &&
      polygonSelectionCount > 0;
    if (isPolygonFullySelected) return true;

    if (!polygon.grass) return true;
    const n = polygon.vertices.length;
    if (n < 2) return false;

    let longestEdgeIndex = -1;
    let longestEdgeLength = -1;
    for (let i = 0; i < n; i++) {
      const from = polygon.vertices[i];
      const to = polygon.vertices[(i + 1) % n];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (length > longestEdgeLength) {
        longestEdgeLength = length;
        longestEdgeIndex = i;
      }
    }

    return edgeIndex !== longestEdgeIndex;
  };

  private startDragging(worldPos: Position): void {
    const { toolState } = this.getState();
    if (!toolState) return;

    this.isDragging = true;
    this.getState().setToolState({ isDragging: true });
    this.dragStartPos = worldPos;
    this.dragHasChanges = false;
    this.beginDragHistoryBatch();

    // Store original positions of selected items for delta calculations
    this.dragOriginPositions = [
      ...toolState.selectedVertices.map((sv: VertexSelection) => ({
        ...sv.vertex,
      })),
      ...toolState.selectedObjects.map((obj: ObjectSelection) => ({ ...obj })),
      ...toolState.selectedPictures.map((pic: Position) => ({ ...pic })),
    ];
    this.dragConstraintDirections = getVertexDragConstraintDirections(
      toolState.selectedVertices,
    );
  }

  private startMarqueeSelection(worldPos: Position, modifier: boolean): void {
    if (!modifier) {
      this.clear();
    }
    this.getState().setToolState({
      isMarqueeSelecting: true,
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
    });
    this.isMarqueeSelecting = true;
    this.marqueeStartPos = worldPos;
    this.marqueeEndPos = worldPos;
  }

  private handleDragging(worldPos: Position, shouldConstrain: boolean): void {
    const { toolState } = this.getState();
    if (!toolState) return;

    const rawDelta = {
      x: worldPos.x - this.dragStartPos.x,
      y: worldPos.y - this.dragStartPos.y,
    };
    const totalDelta =
      shouldConstrain && toolState.selectedVertices.length > 0
        ? constrainDeltaToClosestDirection(
            rawDelta,
            this.dragConstraintDirections,
          )
        : rawDelta;
    const totalDeltaX = totalDelta.x;
    const totalDeltaY = totalDelta.y;
    if (totalDeltaX === 0 && totalDeltaY === 0) return;
    this.dragHasChanges = true;

    if (toolState.selectedVertices.length > 0) {
      const newVertexPositions = toolState.selectedVertices.map(
        (_vertexSelection: VertexSelection, index: number) => {
          const originalPos = this.dragOriginPositions[index];
          return {
            x: originalPos.x + totalDeltaX,
            y: originalPos.y + totalDeltaY,
          };
        },
      );
      this.updateSelectedVertices(newVertexPositions);
    }

    if (toolState.selectedObjects.length > 0) {
      const vertexCount = toolState.selectedVertices.length;
      const newObjectPositions = toolState.selectedObjects.map(
        (_object: ObjectSelection, index: number) => {
          const originPos = this.dragOriginPositions[vertexCount + index];
          return {
            x: originPos.x + totalDeltaX,
            y: originPos.y + totalDeltaY,
          };
        },
      );
      this.updateSelectedObjects(newObjectPositions);
    }

    if (toolState.selectedPictures.length > 0) {
      const vertexCount = toolState.selectedVertices.length;
      const objectCount = toolState.selectedObjects.length;
      const newPicturePositions = toolState.selectedPictures.map(
        (_picture: Position, index: number) => {
          const originPos =
            this.dragOriginPositions[vertexCount + objectCount + index];
          return {
            x: originPos.x + totalDeltaX,
            y: originPos.y + totalDeltaY,
          };
        },
      );
      this.updateSelectedPictures(newPicturePositions);
    }
  }

  private finalizeMarqueeSelection(): void {
    const { state, toolState } = this.getState();
    if (!toolState) return;

    const bounds = getSelectionBounds(this.marqueeStartPos, this.marqueeEndPos);

    // Select vertices within the marquee
    if (this.isPolygonSelectable()) {
      state.polygons.forEach((polygon: Polygon) => {
        polygon.vertices.forEach((vertex: Position) => {
          if (isPointInRect(vertex, bounds)) {
            const isSelected = toolState.selectedVertices.some(
              (sv: VertexSelection) =>
                sv.polygon === polygon && sv.vertex === vertex,
            );
            if (!isSelected) {
              this.selectVertex(polygon, vertex);
            }
          }
        });
      });
    }

    // Select objects within the marquee
    if (this.isObjectSelectable()) {
      const allObjects = getAllObjects(
        state.apples.map((a) => a.position),
        state.killers,
        state.flowers,
        state.start,
      );
      allObjects.forEach(({ obj }: { obj: Position }) => {
        if (isPointInRect(obj, bounds)) {
          this.selectObject(obj);
        }
      });
    }

    // Select pictures within the marquee
    state.pictures
      .filter((picture) => this.isPictureSelectable(picture))
      .forEach((picture) => {
        if (isPointInRect(picture.position, bounds)) {
          const isSelected = toolState.selectedPictures.includes(
            picture.position,
          );
          if (!isSelected) {
            this.selectPicture(picture.position);
          }
        }
      });
  }

  private isPolygonSelectable(): boolean {
    const { state } = this.getState();
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

  private isObjectSelectable(): boolean {
    const { state } = this.getState();
    const { showObjects, showObjectBounds } = state.levelVisibility;
    return showObjects || showObjectBounds;
  }

  private isPictureSelectable(picture: {
    texture?: string;
    mask?: string;
  }): boolean {
    const { state } = this.getState();
    const { showPictureBounds, showTextureBounds, showPictures, showTextures } =
      state.levelVisibility;
    const hasTexture = Boolean(picture.texture && picture.mask);
    return hasTexture
      ? showTextures || showTextureBounds
      : showPictures || showPictureBounds;
  }

  private isObjectPresent(object: Position): boolean {
    const { state } = this.getState();
    return (
      state.start === object ||
      state.killers.includes(object) ||
      state.flowers.includes(object) ||
      state.apples.some((apple) => apple.position === object)
    );
  }

  private isPolygonFullySelected(polygon: Polygon): boolean {
    const { toolState } = this.getState();
    const polygonSelectionCount =
      toolState?.selectedVertices.filter((sv) => sv.polygon === polygon)
        .length ?? 0;
    return (
      polygonSelectionCount === polygon.vertices.length &&
      polygonSelectionCount > 0
    );
  }

  private pruneHiddenSelection(): void {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState) return;

    const selectedVertices = this.isPolygonSelectable()
      ? toolState.selectedVertices
          .map((selection) => {
            const polygon = state.polygons.find((p) =>
              p.vertices.some(
                (vertex) =>
                  vertex.x === selection.vertex.x &&
                  vertex.y === selection.vertex.y,
              ),
            );
            if (!polygon) return null;
            const vertex = polygon.vertices.find(
              (candidate) =>
                candidate.x === selection.vertex.x &&
                candidate.y === selection.vertex.y,
            );
            if (!vertex) return null;
            return { polygon, vertex };
          })
          .filter((selection): selection is VertexSelection =>
            Boolean(selection),
          )
      : [];

    const selectedObjects = this.isObjectSelectable()
      ? toolState.selectedObjects
          .map((selectedObject) => {
            const identityMatch = this.findObjectByIdentity(selectedObject);
            if (identityMatch) return identityMatch;
            return this.findObjectByCoordinates(selectedObject);
          })
          .filter((object): object is Position => Boolean(object))
      : [];

    const selectedPictures = toolState.selectedPictures
      .map((position) => {
        const picture = state.pictures.find(
          (entry) =>
            entry.position.x === position.x && entry.position.y === position.y,
        );
        return picture && this.isPictureSelectable(picture)
          ? picture.position
          : null;
      })
      .filter((position): position is Position => Boolean(position));

    if (
      selectedVertices.length !== toolState.selectedVertices.length ||
      selectedObjects.length !== toolState.selectedObjects.length ||
      selectedPictures.length !== toolState.selectedPictures.length ||
      selectedVertices.some((selection, index) => {
        const previous = toolState.selectedVertices[index];
        return (
          previous?.polygon !== selection.polygon ||
          previous?.vertex !== selection.vertex
        );
      }) ||
      selectedObjects.some(
        (object, index) => object !== toolState.selectedObjects[index],
      ) ||
      selectedPictures.some(
        (position, index) => position !== toolState.selectedPictures[index],
      )
    ) {
      setToolState({ selectedVertices, selectedObjects, selectedPictures });
    }
  }

  private selectVertex(polygon: Polygon, vertex: Position): void {
    const { toolState, setToolState } = this.getState();
    if (!toolState) return;

    const isSelected = isVertexSelected(
      { polygon, vertex },
      toolState.selectedVertices,
    );
    if (isSelected) return;

    setToolState({
      selectedVertices: [...toolState.selectedVertices, { polygon, vertex }],
    });
  }

  private selectObject(object: ObjectSelection): void {
    const { toolState, setToolState } = this.getState();
    if (!toolState) return;

    const isSelected = isObjectSelected(object, toolState.selectedObjects);
    if (isSelected) return;

    setToolState({ selectedObjects: [...toolState.selectedObjects, object] });
  }

  private selectPicture(picture: Position): void {
    const { toolState, setToolState } = this.getState();
    if (!toolState) return;

    if (isObjectSelected(picture, toolState.selectedPictures)) return;

    setToolState({
      selectedPictures: [...toolState.selectedPictures, picture],
    });
  }

  private findObjectByIdentity(selectedObject: Position): Position | null {
    const { state } = this.getState();
    if (state.start === selectedObject) return state.start;
    if (state.apples.some((apple) => apple.position === selectedObject)) {
      return selectedObject;
    }
    if (state.killers.includes(selectedObject)) return selectedObject;
    if (state.flowers.includes(selectedObject)) return selectedObject;
    return null;
  }

  private findObjectByCoordinates(selectedObject: Position): Position | null {
    const { state } = this.getState();
    const matchByCoords = (object: Position) =>
      object.x === selectedObject.x && object.y === selectedObject.y;

    const apple = state.apples.find((entry) => matchByCoords(entry.position));
    if (apple) return apple.position;

    const killer = state.killers.find(matchByCoords);
    if (killer) return killer;

    const flower = state.flowers.find(matchByCoords);
    if (flower) return flower;

    if (matchByCoords(state.start)) return state.start;
    return null;
  }

  private selectPolygon(polygon: Polygon): void {
    const { toolState, setToolState } = this.getState();
    if (!toolState) return;

    // Filter out vertices that are already selected
    const existingSelectedVertices = toolState.selectedVertices.filter(
      (sv: VertexSelection) => sv.polygon !== polygon,
    );

    const polygonVertices = polygon.vertices.map((vertex) => ({
      polygon,
      vertex,
    }));
    setToolState({
      selectedVertices: [...existingSelectedVertices, ...polygonVertices],
    });
  }

  private updateSelectedVertices(newPositions: Position[]): void {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState) return;

    const updatedPolygons = state.polygons.map((polygon) => {
      let hasChanges = false;
      const newVertices = polygon.vertices.map((vertex) => {
        const selectionIndex = toolState.selectedVertices.findIndex(
          (selection: VertexSelection) =>
            selection.polygon === polygon && selection.vertex === vertex,
        );
        if (selectionIndex !== -1) {
          hasChanges = true;
          return newPositions[selectionIndex];
        }
        return vertex;
      });

      // Only create a new polygon object if vertices changed
      return hasChanges ? { ...polygon, vertices: newVertices } : polygon;
    });

    const updatedSelectedVertices = toolState.selectedVertices.map(
      (selection: VertexSelection, index) => ({
        polygon: updatedPolygons[state.polygons.indexOf(selection.polygon)],
        vertex: newPositions[index],
      }),
    );

    setToolState({ selectedVertices: updatedSelectedVertices });

    // Update polygons in store
    state.actions.setPolygons(updatedPolygons);
  }

  private updateSelectedObjects(newPositions: Position[]): void {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState) return;

    let nextApples: Apple[] | undefined;
    let nextKillers: Position[] | undefined;
    let nextFlowers: Position[] | undefined;
    let nextStart: Position | undefined;
    const updatedSelectedObjects = [...toolState.selectedObjects];

    // Update each selected object with its new position
    toolState.selectedObjects.forEach((object: ObjectSelection, index) => {
      const newPos = newPositions[index];

      // Find and update the object in the appropriate array
      const appleIndex = state.apples.findIndex((a) => a.position === object);
      if (appleIndex !== -1) {
        if (!nextApples) nextApples = [...state.apples];
        const apple = state.apples[appleIndex];
        nextApples[appleIndex] = {
          position: newPos,
          animation: apple.animation,
          gravity: apple.gravity,
        };
        updatedSelectedObjects[index] = newPos;
      }

      const killerIndex = state.killers.findIndex((k) => k === object);
      if (killerIndex !== -1) {
        if (!nextKillers) nextKillers = [...state.killers];
        nextKillers[killerIndex] = newPos;
        updatedSelectedObjects[index] = newPos;
      }

      const flowerIndex = state.flowers.findIndex((f) => f === object);
      if (flowerIndex !== -1) {
        if (!nextFlowers) nextFlowers = [...state.flowers];
        nextFlowers[flowerIndex] = newPos;
        updatedSelectedObjects[index] = newPos;
      }

      // Check if it's the start position
      if (object === state.start) {
        nextStart = newPos;
        updatedSelectedObjects[index] = newPos;
      }
    });

    if (nextApples) state.actions.setApples(nextApples);
    if (nextKillers) state.actions.setKillers(nextKillers);
    if (nextFlowers) state.actions.setFlowers(nextFlowers);
    if (nextStart) state.actions.setStart(nextStart);

    setToolState({ selectedObjects: updatedSelectedObjects });
  }

  private updateSelectedPictures(newPositions: Position[]): void {
    const { state, toolState, setToolState } = this.getState();
    if (!toolState) return;

    const updatedPictures = [...state.pictures];
    const updatedSelectedPictures: Position[] = [];
    const handledPictureIndexes = new Set<number>();

    // Update each selected picture with its new position
    toolState.selectedPictures.forEach((picture: Position, index) => {
      const pictureIndex = updatedPictures.findIndex(
        (p) => p.position === picture,
      );
      if (pictureIndex === -1 || handledPictureIndexes.has(pictureIndex))
        return;

      const newPos = newPositions[index];
      updatedPictures[pictureIndex] = {
        ...updatedPictures[pictureIndex],
        position: newPos,
      };
      handledPictureIndexes.add(pictureIndex);
      updatedSelectedPictures.push(newPos);
    });

    // Update pictures in store
    state.actions.setPictures(updatedPictures);

    setToolState({ selectedPictures: updatedSelectedPictures });
  }

  private getHistorySnapshot(): PartialEditorState {
    const { state } = this.getState();
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
    };
  }

  private beginDragHistoryBatch() {
    if (this.isHistoryPaused) return;
    this.dragHistoryStart = this.getHistorySnapshot();
    this.store.temporal.getState().pause();
    this.isHistoryPaused = true;
  }

  private endDragHistoryBatch(commit: boolean) {
    if (!this.isHistoryPaused) return;
    this.store.temporal.getState().resume();
    this.isHistoryPaused = false;

    if (!commit || !this.dragHasChanges || !this.dragHistoryStart) {
      this.dragHistoryStart = null;
      this.dragHasChanges = false;
      return;
    }

    const temporalState = this.store.temporal.getState() as {
      _handleSet?: (
        pastState: PartialEditorState,
        replace: undefined,
        currentState: PartialEditorState,
        deltaState?: Partial<PartialEditorState> | null,
      ) => void;
    };
    temporalState._handleSet?.(
      this.dragHistoryStart,
      undefined,
      this.getHistorySnapshot(),
    );
    this.dragHistoryStart = null;
    this.dragHasChanges = false;
  }

  private updatePolygon(index: number, polygon: Polygon): void {
    const { state } = this.getState();
    state.actions.setPolygons(
      state.polygons.map((p, i) => (i === index ? polygon : p)),
    );
  }

  private removePolygon(index: number): void {
    const { state } = this.getState();
    state.actions.setPolygons(state.polygons.filter((_, i) => i !== index));
  }

  private runHistoryBatch(mutate: () => void) {
    const historyStart = this.getHistorySnapshot();
    this.store.temporal.getState().pause();

    try {
      mutate();
    } finally {
      this.store.temporal.getState().resume();
    }

    const historyEnd = this.getHistorySnapshot();
    if (fastDeepEqual(historyStart, historyEnd)) return;

    const temporalState = this.store.temporal.getState() as {
      _handleSet?: (
        pastState: PartialEditorState,
        replace: undefined,
        currentState: PartialEditorState,
        deltaState?: Partial<PartialEditorState> | null,
      ) => void;
    };

    temporalState._handleSet?.(historyStart, undefined, historyEnd);
  }

  private copySelection(): boolean {
    const clipboard = this.buildClipboardFromSelection();
    if (!clipboard) return false;
    this.clipboard = clipboard;
    this.clipboardPasteCount = 0;
    return true;
  }

  private pasteClipboardWithMargin(): boolean {
    const step = this.clipboardPasteCount + 1;
    const pasted = this.pasteClipboard({
      x: DUPLICATE_OFFSET_STEP * step,
      y: DUPLICATE_OFFSET_STEP * step,
    });

    if (pasted) {
      this.clipboardPasteCount = step;
    }

    return pasted;
  }

  private async copySelectionToSystemClipboard(): Promise<void> {
    const { state } = this.getState();
    if (!this.clipboard || !this.canAccessSystemClipboard()) return;

    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          this.serializeClipboard(
            this.clipboard,
            state.documentSession.clipboardSessionId,
          ),
        ),
      );
    } catch {
      // Browser clipboard access can fail if permissions or context are missing.
    }
  }

  private async pasteFromSystemClipboard(anchor: Position): Promise<void> {
    const { state } = this.getState();
    if (this.canAccessSystemClipboard()) {
      try {
        const text = await navigator.clipboard.readText();
        const serializedClipboard = this.deserializeClipboard(text);
        if (serializedClipboard) {
          this.clipboard = serializedClipboard.payload;
          this.clipboardPasteCount = 0;
          if (
            serializedClipboard.sourceClipboardSessionId ===
            state.documentSession.clipboardSessionId
          ) {
            this.pasteClipboardWithMargin();
          } else {
            this.pasteClipboardAtAnchor(anchor);
          }
          return;
        }
      } catch {
        // Fall back to the in-memory clipboard when system clipboard reads fail.
      }
    }

    this.pasteClipboardAtAnchor(anchor);
  }

  private pasteClipboardAtAnchor(anchor: Position): boolean {
    if (!this.clipboard) return false;

    const clipboardCenter = getClipboardCenter(this.clipboard);
    if (!clipboardCenter) return false;

    return this.pasteClipboard({
      x: anchor.x - clipboardCenter.x,
      y: anchor.y - clipboardCenter.y,
    });
  }

  private pasteClipboard(offset: Position): boolean {
    if (!this.clipboard) return false;

    const { state, setToolState } = this.getState();
    const translatedPolygons = this.clipboard.polygons.map((polygon) => ({
      ...polygon,
      vertices: polygon.vertices.map((vertex) =>
        translatePosition(vertex, offset),
      ),
    }));
    const translatedApples = this.clipboard.apples.map((apple) => ({
      ...apple,
      position: translatePosition(apple.position, offset),
    }));
    const translatedKillers = this.clipboard.killers.map((killer) =>
      translatePosition(killer, offset),
    );
    const translatedFlowers = this.clipboard.flowers.map((flower) =>
      translatePosition(flower, offset),
    );
    const translatedPictures = this.clipboard.pictures.map((picture) => ({
      ...picture,
      position: translatePosition(picture.position, offset),
    }));

    if (
      translatedPolygons.length === 0 &&
      translatedApples.length === 0 &&
      translatedKillers.length === 0 &&
      translatedFlowers.length === 0 &&
      translatedPictures.length === 0
    ) {
      return false;
    }

    this.runHistoryBatch(() => {
      if (translatedPolygons.length > 0) {
        state.actions.setPolygons([...state.polygons, ...translatedPolygons]);
      }
      if (translatedApples.length > 0) {
        state.actions.setApples([...state.apples, ...translatedApples]);
      }
      if (translatedKillers.length > 0) {
        state.actions.setKillers([...state.killers, ...translatedKillers]);
      }
      if (translatedFlowers.length > 0) {
        state.actions.setFlowers([...state.flowers, ...translatedFlowers]);
      }
      if (translatedPictures.length > 0) {
        state.actions.setPictures([...state.pictures, ...translatedPictures]);
      }
    });

    setToolState({
      selectedVertices: translatedPolygons.flatMap((polygon) =>
        polygon.vertices.map((vertex) => ({ polygon, vertex })),
      ),
      selectedObjects: [
        ...translatedApples.map((apple) => apple.position),
        ...translatedKillers,
        ...translatedFlowers,
      ],
      selectedPictures: translatedPictures.map((picture) => picture.position),
      hoveredObject: undefined,
      hoveredPictureBounds: undefined,
      contextMenuType: undefined,
    });

    return true;
  }

  private buildClipboardFromSelection(): SelectionClipboard | null {
    const { state, toolState } = this.getState();
    if (!toolState) return null;

    const polygonSelections = new Map<Polygon, Set<Position>>();
    toolState.selectedVertices.forEach(({ polygon, vertex }) => {
      const existing = polygonSelections.get(polygon) ?? new Set<Position>();
      existing.add(vertex);
      polygonSelections.set(polygon, existing);
    });

    const polygons = Array.from(polygonSelections.entries())
      .map(([polygon, selectedVertices]) => {
        const vertices = polygon.vertices
          .filter((vertex) => selectedVertices.has(vertex))
          .map(clonePosition);

        if (vertices.length < 3) return null;

        return {
          ...polygon,
          vertices,
        };
      })
      .filter((polygon): polygon is Polygon => Boolean(polygon));

    const apples = toolState.selectedObjects
      .map((object) => {
        const apple = state.apples.find((entry) => entry.position === object);
        return apple
          ? {
              ...apple,
              position: clonePosition(apple.position),
            }
          : null;
      })
      .filter((apple): apple is Apple => Boolean(apple));

    const killers = toolState.selectedObjects
      .filter((object) => state.killers.includes(object))
      .map(clonePosition);

    const flowers = toolState.selectedObjects
      .filter((object) => state.flowers.includes(object))
      .map(clonePosition);

    const pictures = toolState.selectedPictures
      .map((position) => {
        const picture = state.pictures.find(
          (entry) => entry.position === position,
        );
        return picture
          ? {
              ...picture,
              position: clonePosition(picture.position),
            }
          : null;
      })
      .filter((picture): picture is Picture => Boolean(picture));

    const hasContent =
      polygons.length > 0 ||
      apples.length > 0 ||
      killers.length > 0 ||
      flowers.length > 0 ||
      pictures.length > 0;

    return hasContent
      ? {
          polygons,
          apples,
          killers,
          flowers,
          pictures,
        }
      : null;
  }

  private canAccessSystemClipboard(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.clipboard?.readText === "function" &&
      typeof navigator.clipboard?.writeText === "function"
    );
  }

  private serializeClipboard(
    clipboard: SelectionClipboard,
    sourceClipboardSessionId: string,
  ): SerializedSelectionClipboard {
    return {
      type: SELECTION_CLIPBOARD_TYPE,
      version: SELECTION_CLIPBOARD_VERSION,
      sourceClipboardSessionId,
      payload: clipboard,
    };
  }

  private deserializeClipboard(
    text: string,
  ): SerializedSelectionClipboard | null {
    try {
      const parsed = JSON.parse(text) as Partial<SerializedSelectionClipboard>;
      if (
        parsed.type !== SELECTION_CLIPBOARD_TYPE ||
        parsed.version !== SELECTION_CLIPBOARD_VERSION ||
        typeof parsed.sourceClipboardSessionId !== "string"
      ) {
        return null;
      }

      const payload = parsed.payload;
      if (!isSelectionClipboard(payload)) {
        return null;
      }

      return {
        type: SELECTION_CLIPBOARD_TYPE,
        version: SELECTION_CLIPBOARD_VERSION,
        sourceClipboardSessionId: parsed.sourceClipboardSessionId,
        payload,
      };
    } catch {
      return null;
    }
  }

  private deleteSelection(): void {
    const { state, toolState } = this.getState();
    if (!toolState) return;

    // Group selected vertices by polygon index
    const verticesByPolygonIndex = new Map<number, Position[]>();
    toolState.selectedVertices.forEach(
      ({ polygon, vertex }: VertexSelection) => {
        const polygonIndex = state.polygons.indexOf(polygon);
        if (polygonIndex !== -1) {
          if (!verticesByPolygonIndex.has(polygonIndex)) {
            verticesByPolygonIndex.set(polygonIndex, []);
          }
          verticesByPolygonIndex.get(polygonIndex)!.push(vertex);
        }
      },
    );

    this.runHistoryBatch(() => {
      // Delete vertices from each polygon
      const sortedPolygonIndices = Array.from(
        verticesByPolygonIndex.keys(),
      ).sort((a, b) => b - a);
      sortedPolygonIndices.forEach((polygonIndex) => {
        const polygon = state.polygons[polygonIndex];
        const verticesToDelete = verticesByPolygonIndex.get(polygonIndex)!;

        if (polygon) {
          const updatedVertices = polygon.vertices.filter(
            (vertex: Position) => !verticesToDelete.includes(vertex),
          );

          if (updatedVertices.length < 3) {
            this.removePolygon(polygonIndex);
          } else {
            this.updatePolygon(polygonIndex, {
              ...polygon,
              vertices: updatedVertices,
            });
          }
        }
      });

      // Delete selected objects
      toolState.selectedObjects.forEach((object: ObjectSelection) => {
        const apple = state.apples.find((a) => a.position === object);
        if (apple) {
          state.actions.removeApple(apple);
        } else if (state.killers.some((k) => k === object)) {
          state.actions.removeKiller(object);
        } else if (state.flowers.some((f) => f === object)) {
          state.actions.removeFlower(object);
        }
      });

      // Delete selected pictures
      toolState.selectedPictures.forEach((picturePos: Position) => {
        const picture = state.pictures.find((p) => p.position === picturePos);
        if (picture) {
          state.actions.removePicture(picture);
        }
      });
    });

    this.clear();
  }
}

function clonePosition(position: Position): Position {
  return { x: position.x, y: position.y };
}

function getClipboardCenter(clipboard: SelectionClipboard): Position | null {
  const positions: Position[] = [
    ...clipboard.polygons.flatMap((polygon) => polygon.vertices),
    ...clipboard.apples.map((apple) => apple.position),
    ...clipboard.killers,
    ...clipboard.flowers,
    ...clipboard.pictures.map((picture) => picture.position),
  ];

  if (positions.length === 0) return null;

  const bounds = positions.reduce(
    (acc, position) => ({
      minX: Math.min(acc.minX, position.x),
      maxX: Math.max(acc.maxX, position.x),
      minY: Math.min(acc.minY, position.y),
      maxY: Math.max(acc.maxY, position.y),
    }),
    {
      minX: positions[0].x,
      maxX: positions[0].x,
      minY: positions[0].y,
      maxY: positions[0].y,
    },
  );

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function isSelectionClipboard(value: unknown): value is SelectionClipboard {
  if (!isRecord(value)) return false;

  return (
    isPolygonArray(value.polygons) &&
    isAppleArray(value.apples) &&
    isPositionArray(value.killers) &&
    isPositionArray(value.flowers) &&
    isPictureArray(value.pictures)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isPositionArray(value: unknown): value is Position[] {
  return Array.isArray(value) && value.every(isPosition);
}

function isPolygon(value: unknown): value is Polygon {
  return (
    isRecord(value) &&
    typeof value.grass === "boolean" &&
    isPositionArray(value.vertices) &&
    value.vertices.length >= 3
  );
}

function isPolygonArray(value: unknown): value is Polygon[] {
  return Array.isArray(value) && value.every(isPolygon);
}

function isApple(value: unknown): value is Apple {
  return (
    isRecord(value) &&
    isPosition(value.position) &&
    typeof value.animation === "number" &&
    Number.isInteger(value.animation) &&
    value.animation >= 1 &&
    value.animation <= 9 &&
    typeof value.gravity === "number"
  );
}

function isAppleArray(value: unknown): value is Apple[] {
  return Array.isArray(value) && value.every(isApple);
}

function isPicture(value: unknown): value is Picture {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.texture === "string" &&
    typeof value.mask === "string" &&
    isPosition(value.position) &&
    typeof value.distance === "number" &&
    Number.isFinite(value.distance) &&
    typeof value.clip === "number"
  );
}

function isPictureArray(value: unknown): value is Picture[] {
  return Array.isArray(value) && value.every(isPicture);
}

function translatePosition(position: Position, offset: Position): Position {
  return {
    x: position.x + offset.x,
    y: position.y + offset.y,
  };
}

function getVertexDragConstraintDirections(
  selectedVertices: VertexSelection[],
): Position[] {
  const directions: Position[] = [];

  for (const selection of selectedVertices) {
    const vertexIndex = selection.polygon.vertices.indexOf(selection.vertex);
    if (vertexIndex === -1) continue;

    const vertexCount = selection.polygon.vertices.length;
    const previous =
      selection.polygon.vertices[(vertexIndex - 1 + vertexCount) % vertexCount];
    const current = selection.polygon.vertices[vertexIndex];
    const next = selection.polygon.vertices[(vertexIndex + 1) % vertexCount];

    addDirection(directions, getNormalizedDirection(previous, current));
    addDirection(directions, getNormalizedDirection(current, next));
  }

  return directions;
}

function addDirection(
  directions: Position[],
  direction: Position | null,
): void {
  if (!direction) return;

  const alreadyIncluded = directions.some((candidate) => {
    const dot = candidate.x * direction.x + candidate.y * direction.y;
    return Math.abs(dot) > 0.999;
  });
  if (!alreadyIncluded) {
    directions.push(direction);
  }
}

function getNormalizedDirection(
  from: Position | undefined,
  to: Position | undefined,
): Position | null {
  if (!from || !to) return null;

  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.hypot(x, y);
  if (length === 0) return null;

  return {
    x: x / length,
    y: y / length,
  };
}

function constrainDeltaToClosestDirection(
  delta: Position,
  directions: Position[],
): Position {
  if (directions.length === 0) return delta;

  let bestDirection = directions[0];
  let bestProjection = delta.x * bestDirection.x + delta.y * bestDirection.y;

  for (const direction of directions.slice(1)) {
    const projection = delta.x * direction.x + delta.y * direction.y;
    if (Math.abs(projection) > Math.abs(bestProjection)) {
      bestDirection = direction;
      bestProjection = projection;
    }
  }

  return {
    x: bestDirection.x * bestProjection,
    y: bestDirection.y * bestProjection,
  };
}

function isWithinVertexSelectionThreshold(
  position: Position,
  vertex: Position,
  zoom: number,
): boolean {
  return (
    Math.hypot(position.x - vertex.x, position.y - vertex.y) <=
    selectionThresholds.vertex / zoom
  );
}

function createSelectionHandleOverlay(
  position: Position,
  size: number,
  lineWidth: number,
): WorldRenderOverlayItem {
  const side = size * 2;
  return {
    type: "rect",
    position: {
      x: position.x - size,
      y: position.y - size,
    },
    width: side,
    height: side,
    cornerRadius:
      (uiSelectionHandle.cornerRadiusPx / uiSelectionHandle.halfWidthPx) * size,
    fillColor: uiColors.selectionHandleFill,
    strokeColor: uiColors.selectionHandleStroke,
    lineWidth,
    layer: "top",
  };
}

function rectIntersectsViewport(rect: WorldRect, viewportRect: WorldRect) {
  return !(
    rect.maxX < viewportRect.minX ||
    rect.minX > viewportRect.maxX ||
    rect.maxY < viewportRect.minY ||
    rect.minY > viewportRect.maxY
  );
}
