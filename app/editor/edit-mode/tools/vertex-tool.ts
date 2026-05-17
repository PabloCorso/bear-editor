import { Tool } from "./tool-interface";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { EditorState } from "~/editor/editor-state";
import type { PartialEditorState } from "~/editor/editor-store";
import {
  findPolygonEdgeNearPosition,
  findPolygonLineForEditing,
  findPolygonVertexForEditing,
} from "~/editor/helpers/selection-helpers";
import { isPolygonClockwise } from "~/editor/helpers/polygon-helpers";
import {
  colors,
  selectionThresholds,
  uiColors,
  uiSelectionHandle,
  uiStrokeWidths,
} from "~/editor/constants";
import type { EditorStore } from "~/editor/editor-store";
import { defaultTools } from "./default-tools";
import type { Polygon, Position } from "~/editor/elma-types";
import {
  isPointVisible,
  isPolygonVisible,
} from "~/editor/render/world-derived-data-cache";
import type { WorldRect } from "~/editor/render/world-geometry";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";
import { checkModifierKey } from "~/utils/misc";
import fastDeepEqual from "fast-deep-equal";

const DEFAULT_VARIANT: VertexToolVariant = "normal";

export type VertexToolVariant = "normal" | "grass" | "both";

export type VertexToolState = {
  drawingPolygon: Polygon;
  editingPolygon?: Polygon;
  editPivot?: Position;
  variant?: VertexToolVariant;
};

export function canToggleVertexToolDirection(
  toolState?: VertexToolState,
): toolState is VertexToolState {
  return (toolState?.drawingPolygon.vertices.length ?? 0) > 1;
}

export function getToggledVertexToolState(
  toolState: VertexToolState,
): Pick<VertexToolState, "drawingPolygon" | "editPivot"> | null {
  if (!canToggleVertexToolDirection(toolState)) {
    return null;
  }

  const pivot =
    toolState.editPivot ??
    toolState.drawingPolygon.vertices[
      toolState.drawingPolygon.vertices.length - 1
    ];
  const pivotIndex = toolState.drawingPolygon.vertices.indexOf(pivot);
  if (pivotIndex === -1) {
    return null;
  }

  const surroundingVertices = [
    ...toolState.drawingPolygon.vertices.slice(pivotIndex + 1),
    ...toolState.drawingPolygon.vertices.slice(0, pivotIndex),
  ];

  return {
    drawingPolygon: {
      ...toolState.drawingPolygon,
      vertices: [pivot, ...surroundingVertices.reverse()],
    },
    editPivot: pivot,
  };
}

export class VertexTool extends Tool<VertexToolState> {
  readonly meta = defaultTools.vertex;

  constructor(store: EditorStore) {
    super(store);
  }

  onActivate(variant?: VertexToolVariant): void {
    const { toolState, setToolState } = this.getState();
    const nextVariant = variant ?? toolState?.variant ?? DEFAULT_VARIANT;
    setToolState({
      drawingPolygon: { vertices: [], grass: nextVariant === "grass" },
      editPivot: undefined,
      variant: nextVariant,
    });
  }

  onDeactivate(): void {
    const finalized = this.finalizeDrawingOrRestore();
    if (!finalized) {
      this.clear();
    }
  }

  clear(): void {
    const { toolState, setToolState } = this.getState();
    // Preserve the current variant when clearing
    const currentVariant = toolState?.variant ?? DEFAULT_VARIANT;
    setToolState({
      drawingPolygon: { vertices: [], grass: currentVariant === "grass" },
      editingPolygon: undefined,
      editPivot: undefined,
      variant: currentVariant,
    });
  }

  getDrafts() {
    const { state, toolState } = this.getState();
    if (!toolState) return { polygons: [] };

    if (toolState.drawingPolygon.vertices.length >= 3) {
      // Create a draft polygon that includes the current mouse position
      return {
        polygons: [
          {
            vertices: [
              ...toolState.drawingPolygon.vertices,
              state.mousePosition,
            ],
            grass: toolState.drawingPolygon.grass,
          },
        ],
      };
    }

    return { polygons: [] };
  }

  onPointerDown(event: PointerEvent, context: EventContext): boolean {
    const worldPos = context.worldPos;
    const { state, toolState, setToolState } = this.getState();
    if (!toolState) return false;

    // If we're already drawing a polygon, continue with normal drawing behavior
    if (toolState.drawingPolygon.vertices.length > 0) {
      // When editing an existing polygon, keep inserting from the active
      // start side so the preview direction remains consistent.
      const newVertices = toolState.editingPolygon
        ? [worldPos, ...toolState.drawingPolygon.vertices]
        : [...toolState.drawingPolygon.vertices, worldPos];
      setToolState({
        drawingPolygon: { ...toolState.drawingPolygon, vertices: newVertices },
        editPivot: worldPos,
      });
      return true;
    }

    // If we're not drawing a polygon, check if we clicked near an existing polygon vertex first
    const vertexResult = findPolygonVertexForEditing(
      worldPos,
      state.polygons,
      selectionThresholds.vertex,
      state.zoom,
    );
    if (vertexResult) {
      // Start editing this polygon from the clicked vertex (without adding a new point)
      this.startEditingFromVertex(state, vertexResult);
      return true;
    }

    // If not near a vertex, check if we clicked near a polygon line
    const shouldStartEditingFromEdge =
      state.vertexEdgeClickBehavior === "smibu" || checkModifierKey(event);
    if (shouldStartEditingFromEdge) {
      const lineResult = findPolygonLineForEditing(
        worldPos,
        state.polygons,
        selectionThresholds.polygonEdge,
        state.zoom,
      );
      if (lineResult) {
        // Start editing this polygon from the closest existing edge vertex.
        this.startEditingFromLine(state, lineResult);
        return true;
      }
    }

    // Start a new polygon
    const newVertices = [worldPos];
    setToolState({
      drawingPolygon: {
        vertices: newVertices,
        grass: toolState.variant === "grass",
      },
      editPivot: worldPos,
    });
    return true;
  }

  onKeyDown(event: KeyboardEvent, _context: EventContext): boolean {
    const { toolState, setToolState } = this.getState();
    if (!toolState) return false;

    if (event.key === "Escape") {
      const isDrawing = toolState.drawingPolygon.vertices.length > 0;
      const isEditing = !!toolState.editingPolygon;

      if (!isDrawing && !isEditing) {
        // Let the editor-level Escape shortcut switch to the default/select tool.
        return false;
      }

      return this.finalizeDrawingOrRestore();
    }

    if (event.key === "Enter") {
      return this.finalizeDrawingOrRestore();
    }

    if (event.key === " " || event.key === "Space") {
      // Reverse around the current edit pivot without changing the open-chain
      // behavior used by polygon editing.
      const nextToolState = getToggledVertexToolState(toolState);
      if (nextToolState) {
        setToolState(nextToolState);
      }
      return true;
    }

    if (event.key.toUpperCase() === "G" || event.key.toUpperCase() === "V") {
      const targetGrass = event.key.toUpperCase() === "G";
      const targetVariant = targetGrass ? "grass" : "normal";

      // Only switch if not already in target mode
      if (toolState.drawingPolygon.grass !== targetGrass) {
        setToolState({
          drawingPolygon: { ...toolState.drawingPolygon, grass: targetGrass },
          variant: targetVariant,
        });
      }
      return true;
    }

    return false;
  }

  onRightClick(_event: MouseEvent, context: EventContext): boolean {
    const { state, toolState } = this.getState();
    const isDrawing = (toolState?.drawingPolygon.vertices.length ?? 0) > 0;
    if (isDrawing) {
      this.finalizeDrawingOrRestore();
      return true;
    }

    const polygon = findPolygonEdgeNearPosition(
      context.worldPos,
      state.polygons,
      selectionThresholds.polygonEdge / state.zoom,
    );
    if (polygon) {
      this.updatePolygon(state.polygons.indexOf(polygon), {
        ...polygon,
        grass: !polygon.grass,
      });
      return true;
    }

    return false;
  }

  getCursor(_context: EventContext): string {
    return "crosshair";
  }

  private updatePolygon(index: number, polygon: Polygon): void {
    const { state } = this.getState();
    state.actions.setPolygons(
      state.polygons.map((p, i) => (i === index ? polygon : p)),
    );
  }

  getWorldOverlays({
    viewportRect,
  }: {
    viewportRect: WorldRect;
  }): WorldRenderOverlayItem[] {
    const { state, toolState } = this.getState();
    if (!toolState || toolState.drawingPolygon.vertices.length === 0) return [];

    const overlays: WorldRenderOverlayItem[] = [];
    const isGrass = toolState.drawingPolygon.grass;
    const strokeColor = isGrass ? colors.grass : uiColors.vertexDraftLine;
    const selectedLineWidth = uiStrokeWidths.boundsSelectedScreen / state.zoom;
    const handleSize = uiSelectionHandle.halfWidthPx / state.zoom;
    const handleStrokeWidth = uiSelectionHandle.strokeWidthPx / state.zoom;

    if (isPolygonVisible(toolState.drawingPolygon, viewportRect)) {
      overlays.push({
        type: "polyline",
        points: toolState.drawingPolygon.vertices,
        color: strokeColor,
        width: selectedLineWidth,
      });
    }

    overlays.push(
      ...toolState.drawingPolygon.vertices
        .filter((vertex) => isPointVisible(vertex, viewportRect))
        .map((vertex) =>
          createDraftHandleOverlay(vertex, handleSize, handleStrokeWidth),
        ),
    );

    const isEditingExistingPolygon = Boolean(toolState.editingPolygon);
    const startPoint = toolState.drawingPolygon.vertices[0]!;
    const lastPoint =
      toolState.drawingPolygon.vertices[
        toolState.drawingPolygon.vertices.length - 1
      ]!;

    if (
      isPointVisible(
        isEditingExistingPolygon ? startPoint : lastPoint,
        viewportRect,
      ) ||
      isPointVisible(state.mousePosition, viewportRect)
    ) {
      overlays.push({
        type: "line",
        from: isEditingExistingPolygon ? startPoint : lastPoint,
        to: state.mousePosition,
        color: strokeColor,
        width: selectedLineWidth,
      });
    }

    if (toolState.drawingPolygon.vertices.length >= 3) {
      overlays.push(
        ...createDashedLineOverlays({
          from: isEditingExistingPolygon ? lastPoint : startPoint,
          to: state.mousePosition,
          color: strokeColor,
          width: selectedLineWidth,
          dashLength: 8 / state.zoom,
          gapLength: 6 / state.zoom,
        }),
      );
    }

    return overlays;
  }

  private addPolygon(polygon: Polygon): void {
    const { state } = this.getState();
    state.actions.setPolygons([...state.polygons, polygon]);
  }

  private replacePolygon(previousPolygon: Polygon, nextPolygon: Polygon): void {
    const { state } = this.getState();
    const polygonIndex = state.polygons.indexOf(previousPolygon);
    if (polygonIndex === -1) return;

    state.actions.setPolygons(
      state.polygons.map((polygon, index) =>
        index === polygonIndex ? nextPolygon : polygon,
      ),
    );
  }

  private finalizeDrawingOrRestore(): boolean {
    const { toolState } = this.getState();
    if (!toolState) return false;

    if (toolState.drawingPolygon.vertices.length >= 3) {
      const finalizedPolygon = {
        vertices: [...toolState.drawingPolygon.vertices],
        grass: toolState.drawingPolygon.grass,
      };
      this.runHistoryBatch(() => {
        if (toolState.editingPolygon) {
          this.replacePolygon(toolState.editingPolygon, finalizedPolygon);
        } else {
          this.addPolygon(finalizedPolygon);
        }
        this.clear();
      });
      return true;
    }

    if (toolState.drawingPolygon.vertices.length > 0) {
      this.clear();
      return true;
    }

    return false;
  }

  private startEditingFromVertex(
    _state: EditorState,
    vertexResult: {
      polygon: Polygon;
      vertexIndex: number;
      vertex: Position;
    },
  ): void {
    const { setToolState } = this.getState();
    const { polygon, vertexIndex } = vertexResult;

    const editingPolygon = polygon;

    // Always start vertex editing in the same canvas direction regardless of
    // the stored polygon winding. Clockwise polygons move to the next vertex;
    // counterclockwise polygons move to the previous vertex.
    const vertices = polygon.vertices;
    const drawingVertices = this.buildEditingVertices(
      vertices,
      vertexIndex,
      isPolygonClockwise(vertices) ? "previous" : "next",
    );

    // Set this as the current drawing polygon and store the original
    setToolState({
      drawingPolygon: {
        vertices: drawingVertices,
        grass: editingPolygon.grass,
      },
      editingPolygon: editingPolygon,
      editPivot: vertices[vertexIndex],
      variant: editingPolygon.grass ? "grass" : "normal",
    });
  }

  private startEditingFromLine(
    _state: EditorState,
    lineResult: {
      polygon: Polygon;
      pivotVertexIndex: number;
      side: "next" | "previous";
    },
  ): void {
    const { setToolState } = this.getState();
    const { polygon, pivotVertexIndex, side } = lineResult;

    const editingPolygon = polygon;

    // Start from the closest endpoint and follow the side of that endpoint
    // that belongs to the clicked edge.
    const vertices = polygon.vertices;
    const drawingVertices = this.buildEditingVertices(
      vertices,
      pivotVertexIndex,
      side,
    );

    // Set this as the current drawing polygon and store the original
    setToolState({
      drawingPolygon: {
        vertices: drawingVertices,
        grass: editingPolygon.grass,
      },
      editingPolygon: editingPolygon,
      editPivot: vertices[pivotVertexIndex],
      variant: editingPolygon.grass ? "grass" : "normal",
    });
  }

  private buildEditingVertices(
    vertices: Position[],
    pivotVertexIndex: number,
    side: "next" | "previous",
  ): Position[] {
    const result = [vertices[pivotVertexIndex]];
    const totalVertices = vertices.length;

    for (let offset = 1; offset < totalVertices; offset++) {
      const index =
        side === "next"
          ? (pivotVertexIndex + offset) % totalVertices
          : (pivotVertexIndex - offset + totalVertices) % totalVertices;
      result.push(vertices[index]);
    }

    return result;
  }

  private getHistorySnapshot(): PartialEditorState {
    const { state } = this.getState();
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
}

function createDraftHandleOverlay(
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
    fillColor: uiColors.vertexDraftPointFill,
    strokeColor: uiColors.vertexDraftPointStroke,
    lineWidth,
    layer: "top",
  };
}

function createDashedLineOverlays({
  from,
  to,
  color,
  width,
  dashLength,
  gapLength,
}: {
  from: Position;
  to: Position;
  color: string;
  width: number;
  dashLength: number;
  gapLength: number;
}): WorldRenderOverlayItem[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [];

  const ux = dx / length;
  const uy = dy / length;
  const overlays: WorldRenderOverlayItem[] = [];
  let offset = 0;

  while (offset < length) {
    const segmentStart = offset;
    const segmentEnd = Math.min(length, offset + dashLength);
    overlays.push({
      type: "line",
      from: {
        x: from.x + ux * segmentStart,
        y: from.y + uy * segmentStart,
      },
      to: {
        x: from.x + ux * segmentEnd,
        y: from.y + uy * segmentEnd,
      },
      color,
      width,
    });
    offset += dashLength + gapLength;
  }

  return overlays;
}
