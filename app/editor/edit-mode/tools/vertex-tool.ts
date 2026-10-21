import { Tool } from "./tool-interface";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { EditorState } from "~/editor/editor-state";
import type { PartialEditorState } from "~/editor/editor-store";
import {
  findPolygonEdgeNearPosition,
  findPolygonLineForEditing,
  findPolygonVertexForEditing,
} from "~/editor/helpers/selection-helpers";
import {
  appendAutoGrassForPolygons,
  generateAutoGrassPolygons,
} from "~/editor/helpers/auto-grass";
import { getClosestPointOnLineSegment } from "~/editor/helpers/coordinate-helpers";
import { isPolygonClockwise } from "~/editor/helpers/polygon-helpers";
import {
  colors,
  ELMA_PIXELS_PER_WORLD_UNIT,
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

export type VertexToolVariant = "normal" | "grass" | "both" | "autoGrass";

export type VertexToolState = {
  drawingPolygon: Polygon;
  editingPolygon?: Polygon;
  editPivot?: Position;
  variant?: VertexToolVariant;
  previewAutoGrassAll?: boolean;
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

  if (!toolState.editingPolygon) {
    // New drawings extend from the last point, so swap the chain's endpoints.
    const vertices = [...toolState.drawingPolygon.vertices].reverse();
    return {
      drawingPolygon: { ...toolState.drawingPolygon, vertices },
      editPivot: vertices[vertices.length - 1],
    };
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
      previewAutoGrassAll: false,
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
      previewAutoGrassAll: false,
    });
  }

  adjustAutoGrassOption(field: "depth" | "endInset", delta: number): void {
    const { state } = this.getState();
    const value = Math.round(
      state.autoGrassOptions[field] * ELMA_PIXELS_PER_WORLD_UNIT,
    );
    state.actions.setAutoGrassOptions({
      [field]:
        Math.max(field === "depth" ? 1 : 0, Math.min(200, value + delta)) /
        ELMA_PIXELS_PER_WORLD_UNIT,
    });
  }

  getDrafts() {
    const { state, toolState } = this.getState();
    if (!toolState) return { polygons: [] };

    if (toolState.previewAutoGrassAll) {
      return {
        polygons: generateAutoGrassPolygons({
          polygons: state.polygons,
          sourcePolygons: state.polygons.filter((polygon) => !polygon.grass),
          options: state.autoGrassOptions,
        }),
      };
    }

    if (
      state.mouseOnCanvas &&
      toolState.variant === "autoGrass" &&
      toolState.drawingPolygon.vertices.length === 0
    ) {
      const polygon = findPolygonEdgeNearPosition(
        state.mousePosition,
        state.polygons,
        selectionThresholds.polygonEdge / state.zoom,
        (candidate) => !candidate.grass,
      );
      if (!polygon) return { polygons: [] };

      return {
        polygons: generateAutoGrassPolygons({
          polygons: state.polygons,
          sourcePolygons: [polygon],
          options: state.autoGrassOptions,
        }),
      };
    }

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

    if (
      toolState.variant === "autoGrass" &&
      toolState.drawingPolygon.vertices.length === 0
    ) {
      const polygon = findPolygonEdgeNearPosition(
        worldPos,
        state.polygons,
        selectionThresholds.polygonEdge / state.zoom,
        (candidate) => !candidate.grass,
      );
      if (!polygon) return false;

      return this.autoGrassPolygons([polygon]);
    }

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

    const editTarget = this.findEditTarget(
      state,
      worldPos,
      state.vertexEdgeClickBehavior === "default" || checkModifierKey(event),
    );
    if (editTarget) {
      setToolState(this.getEditingState(editTarget));
      return true;
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

    if (
      (toolState.variant === "autoGrass" || toolState.previewAutoGrassAll) &&
      ["+", "=", "-", "_", "[", "]"].includes(event.key) &&
      !event.metaKey &&
      // Option/AltGr may be required to type these characters on some layouts.
      (!event.ctrlKey || event.getModifierState("AltGraph"))
    ) {
      this.adjustAutoGrassOption(
        event.key === "[" || event.key === "]" ? "endInset" : "depth",
        event.key === "]" || event.key === "+" || event.key === "=" ? 1 : -1,
      );
      event.preventDefault();
      return true;
    }

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
      // Reverse the drawing, preserving the pivot when editing a polygon.
      const nextToolState = getToggledVertexToolState(toolState);
      if (nextToolState) {
        setToolState(nextToolState);
      }
      return true;
    }

    if (event.key.toUpperCase() === "G" || event.key.toUpperCase() === "V") {
      const targetGrass = event.key.toUpperCase() === "G";
      const targetVariant = targetGrass ? "grass" : "normal";

      if (
        (toolState.variant ?? DEFAULT_VARIANT) !== targetVariant ||
        toolState.drawingPolygon.grass !== targetGrass
      ) {
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

  autoGrassAll(): boolean {
    const { state } = this.getState();
    return this.autoGrassPolygons(
      state.polygons.filter((polygon) => !polygon.grass),
    );
  }

  autoGrassPolygons(polygons: Polygon[]): boolean {
    const { state } = this.getState();
    const sourcePolygons = polygons.filter((polygon) =>
      state.polygons.includes(polygon),
    );
    if (sourcePolygons.length === 0) return false;

    const nextPolygons = appendAutoGrassForPolygons({
      polygons: state.polygons,
      sourcePolygons,
      options: state.autoGrassOptions,
    });
    if (nextPolygons === state.polygons) return false;

    this.runHistoryBatch(() => {
      state.actions.setPolygons(nextPolygons);
    });
    return true;
  }

  getCursor(_context: EventContext): string {
    return "crosshair";
  }

  private findEditTarget(
    state: EditorState,
    position: Position,
    modifierPressed: boolean,
  ) {
    const vertex = findPolygonVertexForEditing(
      position,
      state.polygons,
      selectionThresholds.vertex,
      state.zoom,
    );
    if (vertex) return { type: "vertex" as const, result: vertex };

    if (state.vertexEdgeClickBehavior === "default" || modifierPressed) {
      const edge = findPolygonLineForEditing(
        position,
        state.polygons,
        selectionThresholds.polygonEdge,
        state.zoom,
      );
      if (edge) return { type: "edge" as const, result: edge };
    }
    return null;
  }

  private updatePolygon(index: number, polygon: Polygon): void {
    const { state } = this.getState();
    state.actions.setPolygons(
      state.polygons.map((p, i) => (i === index ? polygon : p)),
    );
  }

  getWorldOverlays({
    viewportRect,
    modifierPressed = false,
  }: {
    viewportRect: WorldRect;
    modifierPressed?: boolean;
  }): WorldRenderOverlayItem[] {
    const { state, toolState } = this.getState();
    if (!toolState) return [];

    let previewState = toolState;
    let previewPosition = state.mousePosition;
    const isHoverPreview = toolState.drawingPolygon.vertices.length === 0;
    if (isHoverPreview) {
      if (
        !state.mouseOnCanvas ||
        toolState.variant === "autoGrass" ||
        toolState.previewAutoGrassAll
      ) {
        return [];
      }

      const target = this.findEditTarget(
        state,
        state.mousePosition,
        modifierPressed,
      );
      if (!target) return [];

      previewState = this.getEditingState(target);
      // Split the hovered edge where the cursor projects onto it, keeping
      // the polygon fixed while previewing the drawing direction.
      const vertices = previewState.drawingPolygon.vertices;
      previewPosition =
        target.type === "edge"
          ? getClosestPointOnLineSegment(
              state.mousePosition,
              vertices[0],
              vertices[vertices.length - 1],
            )
          : previewState.editPivot!;
    }

    const overlays: WorldRenderOverlayItem[] = [];
    const isGrass = previewState.drawingPolygon.grass;
    const strokeColor = isHoverPreview
      ? uiColors.boundsHover
      : isGrass
        ? colors.grass
        : uiColors.boundsSelected;
    const draftPolygonLineWidth =
      (isHoverPreview
        ? uiStrokeWidths.boundsHoverScreen
        : uiStrokeWidths.boundsSelectedScreen) / state.zoom;
    const draftPolygonLineOpacity = 0.75;
    const handleSize = uiSelectionHandle.halfWidthPx / state.zoom;
    const handleStrokeWidth = uiSelectionHandle.strokeWidthPx / state.zoom;

    if (isPolygonVisible(previewState.drawingPolygon, viewportRect)) {
      overlays.push({
        type: "polyline",
        points: previewState.drawingPolygon.vertices,
        color: strokeColor,
        width: draftPolygonLineWidth,
        opacity: draftPolygonLineOpacity,
      });
    }

    overlays.push(
      ...previewState.drawingPolygon.vertices
        .filter((vertex) => isPointVisible(vertex, viewportRect))
        .map((vertex) =>
          createDraftHandleOverlay(vertex, handleSize, handleStrokeWidth),
        ),
    );

    const isEditingExistingPolygon = Boolean(previewState.editingPolygon);
    const startPoint = previewState.drawingPolygon.vertices[0]!;
    const lastPoint =
      previewState.drawingPolygon.vertices[
        previewState.drawingPolygon.vertices.length - 1
      ]!;

    if (
      isPointVisible(
        isEditingExistingPolygon ? startPoint : lastPoint,
        viewportRect,
      ) ||
      isPointVisible(previewPosition, viewportRect)
    ) {
      overlays.push({
        type: "line",
        from: isEditingExistingPolygon ? startPoint : lastPoint,
        to: previewPosition,
        color: strokeColor,
        width: draftPolygonLineWidth,
        opacity: draftPolygonLineOpacity,
      });
    }

    if (previewState.drawingPolygon.vertices.length >= 3) {
      overlays.push(
        ...createDottedLineOverlays({
          from: isEditingExistingPolygon ? lastPoint : startPoint,
          to: previewPosition,
          color: strokeColor,
          opacity: draftPolygonLineOpacity,
          radius: 1.25 / state.zoom,
          spacing: 6 / state.zoom,
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

  private getEditingState(
    target: NonNullable<ReturnType<VertexTool["findEditTarget"]>>,
  ): VertexToolState {
    const { polygon } = target.result;
    const pivotVertexIndex =
      target.type === "vertex"
        ? target.result.vertexIndex
        : target.result.pivotVertexIndex;
    // Vertex starts use a consistent canvas direction; edge starts follow
    // the clicked edge from its closest endpoint.
    const side =
      target.type === "vertex"
        ? isPolygonClockwise(polygon.vertices)
          ? "previous"
          : "next"
        : target.result.side;

    return {
      drawingPolygon: {
        vertices: this.buildEditingVertices(
          polygon.vertices,
          pivotVertexIndex,
          side,
        ),
        grass: polygon.grass,
      },
      editingPolygon: polygon,
      editPivot: polygon.vertices[pivotVertexIndex],
      variant: polygon.grass ? "grass" : "normal",
    };
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

function createDottedLineOverlays({
  from,
  to,
  color,
  opacity,
  radius,
  spacing,
}: {
  from: Position;
  to: Position;
  color: string;
  opacity?: number;
  radius: number;
  spacing: number;
}): WorldRenderOverlayItem[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [];

  const ux = dx / length;
  const uy = dy / length;
  const overlays: WorldRenderOverlayItem[] = [];
  for (let offset = 0; offset < length; offset += spacing) {
    overlays.push({
      type: "circle",
      center: {
        x: from.x + ux * offset,
        y: from.y + uy * offset,
      },
      radius,
      fillColor: color,
      opacity,
    });
  }

  return overlays;
}
