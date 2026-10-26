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
import {
  cutAndConnect,
  DEFAULT_CUT_CONNECT_WIDTH_PX,
  MIN_CUT_CONNECT_WIDTH_PX,
  MAX_CUT_CONNECT_WIDTH_PX,
  type CutConnectResult,
} from "~/editor/helpers/cut-and-connect";

import {
  createPipePolygon,
  createPipeApples,
  getPipeStart,
  getPipeFlower,
  PIPE_APPLE_MODES,
  type PipeAppleMode,
  DEFAULT_PIPE_APPLE_DISTANCE,
  PIPE_APPLE_DISTANCE_STEP,
  MAX_PIPE_APPLE_DISTANCE,
  DEFAULT_PIPE_APPLE_COUNT,
  MAX_PIPE_APPLE_COUNT,
  DEFAULT_PIPE_WIDTH_PX,
  MIN_PIPE_WIDTH_PX,
  MAX_PIPE_WIDTH_PX,
} from "~/editor/helpers/pipe";

import {
  createFramePolygons,
  isPointInsideFramePolygon,
  FRAME_MODES,
  type FrameMode,
  DEFAULT_FRAME_WIDTH_PX,
  MIN_FRAME_WIDTH_PX,
  MAX_FRAME_WIDTH_PX,
} from "~/editor/helpers/frame";

const DEFAULT_VARIANT: VertexToolVariant = "normal";

export type VertexToolVariant =
  | "normal"
  | "grass"
  | "both"
  | "autoGrass"
  | "pipe"
  | "cutConnect"
  | "frame";

export type VertexToolState = {
  drawingPolygon: Polygon;
  editingPolygon?: Polygon;
  editPivot?: Position;
  variant?: VertexToolVariant;
  previewAutoGrassAll?: boolean;
  frameMode?: FrameMode;
  frameWidthPx?: number;
  pipeStart?: boolean;
  pipeFlower?: boolean;
  pipeWidthPx?: number;
  pipeAppleMode?: PipeAppleMode;
  pipeAppleDistance?: number;
  pipeAppleCount?: number;
  cutConnectWidthPx?: number;
  cutConnectError?: string;
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

  private frameTarget?: Polygon;
  private framePreviewCache?: {
    target: Polygon;
    width: number;
    mode: FrameMode;
    polygons: Polygon[] | null;
  };
  private frameCandidatesCache?: { polygons: Polygon[]; candidates: Polygon[] };
  private pipeCountDigits = "";
  private lastPipeCountDigitAt = 0;
  private cutPointer?: { id: number; x: number; y: number; dragged: boolean };
  private cutPreview?: {
    polygons: Polygon[];
    start: Position;
    end: Position;
    width: number;
    result: CutConnectResult;
  };

  constructor(store: EditorStore) {
    super(store);
  }

  onActivate(variant?: VertexToolVariant): void {
    this.cutPointer = undefined;
    this.cutPreview = undefined;
    this.frameTarget = undefined;
    this.pipeCountDigits = "";
    const { toolState, setToolState } = this.getState();
    const nextVariant = variant ?? toolState?.variant ?? DEFAULT_VARIANT;
    setToolState({
      drawingPolygon: { vertices: [], grass: nextVariant === "grass" },
      editPivot: undefined,
      editingPolygon: undefined,
      variant: nextVariant,
      previewAutoGrassAll: false,
      cutConnectError: undefined,
      pipeStart: false,
      pipeFlower: false,
    });
  }

  onDeactivate(): void {
    this.frameTarget = undefined;
    this.pipeCountDigits = "";
    const finalized = this.finalizeDrawingOrRestore();
    if (!finalized) {
      this.clear();
    }
  }

  clear(): void {
    this.cutPointer = undefined;
    this.cutPreview = undefined;
    this.pipeCountDigits = "";
    const { toolState, setToolState } = this.getState();
    // Preserve the current variant when clearing
    const currentVariant = toolState?.variant ?? DEFAULT_VARIANT;
    setToolState({
      drawingPolygon: { vertices: [], grass: currentVariant === "grass" },
      editingPolygon: undefined,
      editPivot: undefined,
      variant: currentVariant,
      previewAutoGrassAll: false,
      cutConnectError: undefined,
      pipeStart: false,
      pipeFlower: false,
    });
  }

  cycleFrameMode(): void {
    const { toolState, setToolState } = this.getState();
    const index = FRAME_MODES.indexOf(toolState?.frameMode ?? "inside");
    setToolState({ frameMode: FRAME_MODES[(index + 1) % FRAME_MODES.length] });
  }

  adjustFrameWidth(delta: number): void {
    const { toolState, setToolState } = this.getState();
    setToolState({
      frameWidthPx: Math.max(
        MIN_FRAME_WIDTH_PX,
        Math.min(
          MAX_FRAME_WIDTH_PX,
          (toolState?.frameWidthPx ?? DEFAULT_FRAME_WIDTH_PX) + delta,
        ),
      ),
    });
  }

  private findFrameTarget(position: Position): Polygon | undefined {
    const { state } = this.getState();
    if (this.frameCandidatesCache?.polygons !== state.polygons) {
      this.frameCandidatesCache = {
        polygons: state.polygons,
        candidates: state.polygons
          .filter((polygon) => !polygon.grass)
          .sort((a, b) => frameTargetArea(a) - frameTargetArea(b)),
      };
    }
    const { candidates } = this.frameCandidatesCache;
    return (
      findPolygonEdgeNearPosition(
        position,
        candidates,
        selectionThresholds.polygonEdge / state.zoom,
      ) ??
      candidates.find((polygon) =>
        isPointInsideFramePolygon(position, polygon.vertices),
      )
    );
  }

  private getFramePreview() {
    const { state, toolState } = this.getState();
    // Keep the last hovered target while operating the bottom-left controls.
    const target = state.mouseOnCanvas
      ? this.findFrameTarget(state.mousePosition)
      : this.frameTarget;
    if (!target || !state.polygons.includes(target)) return undefined;
    const width =
      (toolState?.frameWidthPx ?? DEFAULT_FRAME_WIDTH_PX) /
      ELMA_PIXELS_PER_WORLD_UNIT;
    const mode = toolState?.frameMode ?? "inside";
    if (
      this.framePreviewCache?.target !== target ||
      this.framePreviewCache.width !== width ||
      this.framePreviewCache.mode !== mode
    ) {
      this.framePreviewCache = {
        target,
        width,
        mode,
        polygons: createFramePolygons(target, width, mode),
      };
    }
    return this.framePreviewCache;
  }

  togglePipeStart(): void {
    const { toolState, setToolState } = this.getState();
    setToolState({ pipeStart: !toolState?.pipeStart });
  }

  adjustCutConnectWidth(delta: number): void {
    const { toolState, setToolState } = this.getState();
    setToolState({
      cutConnectWidthPx: Math.max(
        MIN_CUT_CONNECT_WIDTH_PX,
        Math.min(
          MAX_CUT_CONNECT_WIDTH_PX,
          (toolState?.cutConnectWidthPx ?? DEFAULT_CUT_CONNECT_WIDTH_PX) +
            delta,
        ),
      ),
    });
  }

  private getCutPreview(end?: Position): CutConnectResult | undefined {
    const { state, toolState } = this.getState();
    const start = toolState?.drawingPolygon.vertices[0];
    if (!start || (!end && !state.mouseOnCanvas)) return undefined;
    end ??= state.mousePosition;
    const width =
      (toolState?.cutConnectWidthPx ?? DEFAULT_CUT_CONNECT_WIDTH_PX) /
      ELMA_PIXELS_PER_WORLD_UNIT;
    const cached = this.cutPreview;
    if (
      cached &&
      cached.polygons === state.polygons &&
      cached.start === start &&
      cached.end.x === end.x &&
      cached.end.y === end.y &&
      cached.width === width
    ) {
      return cached.result;
    }
    const result = cutAndConnect(state.polygons, start, end, width);
    this.cutPreview = { polygons: state.polygons, start, end, width, result };
    return result;
  }

  private commitCut(end: Position): void {
    const { state } = this.getState();
    const result = this.getCutPreview(end);
    if (result && result.polygons !== state.polygons) {
      this.runHistoryBatch(() => {
        state.actions.setPolygons(result.polygons);
        this.clear();
      });
    } else {
      this.clear();
      if (result?.error)
        this.getState().setToolState({ cutConnectError: result.error });
    }
  }

  onPointerMove(event: PointerEvent, context: EventContext): boolean {
    const { toolState } = this.getState();
    if (toolState?.variant === "frame") {
      this.frameTarget = this.findFrameTarget(context.worldPos);
      return false;
    }
    if (!this.cutPointer || event.pointerId !== this.cutPointer.id)
      return false;
    if (
      Math.hypot(
        context.screenX - this.cutPointer.x,
        context.screenY - this.cutPointer.y,
      ) >= 4
    ) {
      this.cutPointer.dragged = true;
    }
    return true;
  }

  onPointerUp(event: PointerEvent, context: EventContext): boolean {
    const pointer = this.cutPointer;
    if (!pointer || event.pointerId !== pointer.id) return false;
    this.cutPointer = undefined;
    if (event.type === "pointercancel") {
      this.clear();
      return true;
    }
    if (
      pointer.dragged ||
      Math.hypot(context.screenX - pointer.x, context.screenY - pointer.y) >= 4
    ) {
      this.commitCut(context.worldPos);
    }
    return true;
  }

  togglePipeFlower(): void {
    const { toolState, setToolState } = this.getState();
    setToolState({ pipeFlower: !toolState?.pipeFlower });
  }

  private getPipeStart(includeMouse: boolean) {
    const { toolState } = this.getState();
    return toolState?.pipeStart
      ? getPipeStart(
          this.getPipePoints(includeMouse),
          (toolState.pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX) /
            ELMA_PIXELS_PER_WORLD_UNIT,
        )
      : undefined;
  }

  private getPipeFlower(includeMouse: boolean) {
    const { toolState } = this.getState();
    return toolState?.pipeFlower
      ? getPipeFlower(
          this.getPipePoints(includeMouse),
          (toolState.pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX) /
            ELMA_PIXELS_PER_WORLD_UNIT,
        )
      : undefined;
  }

  adjustPipeWidth(delta: number): void {
    const { toolState, setToolState } = this.getState();
    setToolState({
      pipeWidthPx: Math.max(
        MIN_PIPE_WIDTH_PX,
        Math.min(
          MAX_PIPE_WIDTH_PX,
          (toolState?.pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX) + delta,
        ),
      ),
    });
  }

  cyclePipeAppleMode(): void {
    this.pipeCountDigits = "";
    const { toolState, setToolState } = this.getState();
    const index = PIPE_APPLE_MODES.indexOf(toolState?.pipeAppleMode ?? "none");
    setToolState({
      pipeAppleMode: PIPE_APPLE_MODES[(index + 1) % PIPE_APPLE_MODES.length],
    });
  }

  adjustPipeApples(delta: number): void {
    this.pipeCountDigits = "";
    const { toolState, setToolState } = this.getState();
    if (toolState?.pipeAppleMode === "distance") {
      setToolState({
        pipeAppleDistance: Math.max(
          PIPE_APPLE_DISTANCE_STEP,
          Math.min(
            MAX_PIPE_APPLE_DISTANCE,
            (toolState.pipeAppleDistance ?? DEFAULT_PIPE_APPLE_DISTANCE) +
              delta * PIPE_APPLE_DISTANCE_STEP,
          ),
        ),
      });
    } else if (toolState?.pipeAppleMode === "count") {
      setToolState({
        pipeAppleCount: Math.max(
          0,
          Math.min(
            MAX_PIPE_APPLE_COUNT,
            (toolState.pipeAppleCount ?? DEFAULT_PIPE_APPLE_COUNT) + delta,
          ),
        ),
      });
    }
  }

  private getPipePoints(includeMouse: boolean): Position[] {
    const { state, toolState } = this.getState();
    if (!toolState || toolState.drawingPolygon.vertices.length === 0) return [];
    return includeMouse && state.mouseOnCanvas
      ? [...toolState.drawingPolygon.vertices, state.mousePosition]
      : toolState.drawingPolygon.vertices;
  }

  private getPipeApples(includeMouse: boolean) {
    const { toolState } = this.getState();
    return createPipeApples(
      this.getPipePoints(includeMouse),
      toolState?.pipeAppleMode ?? "none",
      toolState?.pipeAppleDistance,
      toolState?.pipeAppleCount,
      toolState?.pipeFlower,
      (toolState?.pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX) /
        ELMA_PIXELS_PER_WORLD_UNIT,
    );
  }

  private getPipePolygon(includeMouse: boolean): Polygon | null {
    const { toolState } = this.getState();
    if (!toolState) return null;
    return createPipePolygon(
      this.getPipePoints(includeMouse),
      (toolState.pipeWidthPx ?? DEFAULT_PIPE_WIDTH_PX) /
        ELMA_PIXELS_PER_WORLD_UNIT,
      toolState.pipeStart,
    );
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

    // Toolbar previews take precedence over the active drawing variant.
    if (toolState.previewAutoGrassAll) {
      return {
        polygons: generateAutoGrassPolygons({
          polygons: state.polygons,
          sourcePolygons: state.polygons.filter((polygon) => !polygon.grass),
          options: state.autoGrassOptions,
        }),
      };
    }

    if (toolState.variant === "cutConnect") {
      const preview = this.getCutPreview();
      return { polygons: [], replacementPolygons: preview?.polygons };
    }

    if (toolState.variant === "frame") {
      const preview = this.getFramePreview();
      return {
        polygons: preview?.polygons ?? [],
        hiddenPolygons: preview?.polygons ? [preview.target] : [],
      };
    }

    if (toolState.variant === "pipe") {
      const polygon = this.getPipePolygon(true);
      const flower = polygon ? this.getPipeFlower(true) : undefined;
      return {
        polygons: polygon ? [polygon] : [],
        apples: polygon ? this.getPipeApples(true) : [],
        flowers: flower ? [flower] : [],
        start: polygon ? this.getPipeStart(true) : undefined,
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

    if (toolState.variant === "cutConnect") {
      if (toolState.drawingPolygon.vertices.length) {
        this.commitCut(worldPos);
      } else {
        this.cutPointer = {
          id: event.pointerId,
          x: context.screenX,
          y: context.screenY,
          dragged: false,
        };
        setToolState({
          drawingPolygon: { vertices: [worldPos], grass: false },
          cutConnectError: undefined,
        });
      }
      return true;
    }

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

    if (toolState.variant === "frame") {
      if (event.button !== 0) return false;
      const target = this.findFrameTarget(worldPos);
      if (!target) return true;
      const polygons = createFramePolygons(
        target,
        (toolState.frameWidthPx ?? DEFAULT_FRAME_WIDTH_PX) /
          ELMA_PIXELS_PER_WORLD_UNIT,
        toolState.frameMode ?? "inside",
      );
      if (polygons)
        this.runHistoryBatch(() => {
          state.actions.setPolygons(
            state.polygons.flatMap((polygon) =>
              polygon === target ? polygons : [polygon],
            ),
          );
        });
      this.frameTarget = undefined;
      return true;
    }

    if (toolState.variant === "pipe") {
      const vertices = toolState.drawingPolygon.vertices;
      const previous = vertices[vertices.length - 1];
      if (
        !previous ||
        Math.hypot(worldPos.x - previous.x, worldPos.y - previous.y) > 1e-8
      ) {
        setToolState({
          drawingPolygon: { vertices: [...vertices, worldPos], grass: false },
          editPivot: worldPos,
        });
      }
      return true;
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

    if (toolState.variant === "cutConnect") {
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.isComposing &&
        ["+", "=", "-", "_"].includes(event.key)
      ) {
        this.adjustCutConnectWidth(
          event.key === "+" || event.key === "=" ? 1 : -1,
        );
        event.preventDefault();
        return true;
      }
      if (event.key === "Escape" && toolState.drawingPolygon.vertices.length) {
        this.clear();
        event.preventDefault();
        return true;
      }
      if (event.key === "Enter" && toolState.drawingPolygon.vertices.length) {
        if (this.getState().state.mouseOnCanvas)
          this.commitCut(this.getState().state.mousePosition);
        event.preventDefault();
        return true;
      }
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        ["g", "v"].includes(event.key.toLowerCase())
      ) {
        this.onActivate(event.key.toLowerCase() === "g" ? "grass" : "normal");
        return true;
      }
      // Do not inherit vertex drawing commands (Space, G, V, Enter).
      return false;
    }

    if (
      toolState.variant === "pipe" &&
      ["s", "f"].includes(event.key.toLowerCase()) &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      if (!event.repeat) {
        if (event.key.toLowerCase() === "s") this.togglePipeStart();
        else this.togglePipeFlower();
      }
      return true;
    }

    if (
      toolState.variant === "pipe" &&
      toolState.pipeAppleMode === "count" &&
      /^[0-9]$/.test(event.key) &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      if (event.repeat) return true;

      const now = performance.now();
      // A pause or a complete three-digit entry starts a fresh count.
      if (
        now - this.lastPipeCountDigitAt >= 1500 ||
        this.pipeCountDigits.length === 3
      ) {
        this.pipeCountDigits = "";
      }
      this.pipeCountDigits += event.key;
      this.lastPipeCountDigitAt = now;
      setToolState({
        pipeAppleCount: Math.min(
          MAX_PIPE_APPLE_COUNT,
          Number(this.pipeCountDigits),
        ),
      });
      return true;
    }

    this.pipeCountDigits = "";

    if (
      toolState.variant === "frame" &&
      !toolState.previewAutoGrassAll &&
      !event.metaKey &&
      (!event.ctrlKey || event.getModifierState("AltGraph"))
    ) {
      if (["+", "=", "-", "_"].includes(event.key)) {
        this.adjustFrameWidth(event.key === "+" || event.key === "=" ? 1 : -1);
        event.preventDefault();
        return true;
      }
      if (!event.altKey && (event.key === " " || event.key === "Space")) {
        if (!event.repeat) this.cycleFrameMode();
        event.preventDefault();
        return true;
      }
    }

    // Hovering All makes AutoGrass the target of shared size shortcuts.
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

    if (
      toolState.variant === "pipe" &&
      ["[", "]"].includes(event.key) &&
      toolState.pipeAppleMode &&
      toolState.pipeAppleMode !== "none" &&
      !event.metaKey &&
      (!event.ctrlKey || event.getModifierState("AltGraph"))
    ) {
      this.adjustPipeApples(event.key === "]" ? 1 : -1);
      event.preventDefault();
      return true;
    }

    if (
      toolState.variant === "pipe" &&
      ["+", "=", "-", "_"].includes(event.key) &&
      !event.metaKey &&
      (!event.ctrlKey || event.getModifierState("AltGraph"))
    ) {
      this.adjustPipeWidth(event.key === "+" || event.key === "=" ? 1 : -1);
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
      if (toolState.variant === "pipe") {
        if (!event.repeat) this.cyclePipeAppleMode();
        event.preventDefault();
        return true;
      }
      // Reverse the drawing, preserving the pivot when editing a polygon.
      const nextToolState = getToggledVertexToolState(toolState);
      if (nextToolState) {
        setToolState(nextToolState);
      }
      return true;
    }

    if (event.key.toUpperCase() === "G" || event.key.toUpperCase() === "V") {
      if (toolState.variant === "pipe") {
        this.finalizeDrawingOrRestore();
        this.onActivate(event.key.toUpperCase() === "G" ? "grass" : "normal");
        return true;
      }
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
    if (toolState?.variant === "cutConnect") {
      this.clear();
      return true;
    }
    const isDrawing = (toolState?.drawingPolygon.vertices.length ?? 0) > 0;
    if (isDrawing) {
      this.finalizeDrawingOrRestore();
      return true;
    }

    if (toolState?.variant === "pipe" || toolState?.variant === "frame")
      return false;

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

    if (toolState.variant === "cutConnect") {
      const start = toolState.drawingPolygon.vertices[0];
      if (!start || !state.mouseOnCanvas) return [];
      const preview = this.getCutPreview();
      const stroke = createPipePolygon(
        [start, state.mousePosition],
        (toolState.cutConnectWidthPx ?? DEFAULT_CUT_CONNECT_WIDTH_PX) /
          ELMA_PIXELS_PER_WORLD_UNIT,
      );
      const outlines = [
        ...(preview?.changedPolygons ?? []),
        ...(stroke ? [stroke] : []),
      ];
      return [
        ...outlines.map(
          (polygon): WorldRenderOverlayItem => ({
            type: "polyline",
            points: polygon.vertices,
            closed: true,
            color: uiColors.boundsSelected,
            width: uiStrokeWidths.boundsSelectedScreen / state.zoom,
            opacity: 0.75,
          }),
        ),
        {
          type: "line",
          from: start,
          to: state.mousePosition,
          color: uiColors.boundsSelected,
          width: 1 / state.zoom,
          opacity: 0.5,
        },
        ...[start, state.mousePosition].map((point) =>
          createDraftHandleOverlay(
            point,
            uiSelectionHandle.halfWidthPx / state.zoom,
            uiSelectionHandle.strokeWidthPx / state.zoom,
          ),
        ),
      ];
    }

    if (toolState.variant === "frame") {
      if (toolState.previewAutoGrassAll) return [];
      const preview = this.getFramePreview();
      if (!preview) return [];
      return (preview.polygons ?? [preview.target]).map((polygon) => ({
        type: "polyline" as const,
        points: [...polygon.vertices, polygon.vertices[0]],
        color: preview.polygons
          ? uiColors.boundsSelected
          : uiColors.boundsHover,
        width: uiStrokeWidths.boundsSelectedScreen / state.zoom,
        opacity: 0.75,
      }));
    }

    if (toolState.variant === "pipe") {
      const polygon = this.getPipePolygon(true);
      const overlays: WorldRenderOverlayItem[] = polygon
        ? [
            {
              type: "polyline",
              points: [...polygon.vertices, polygon.vertices[0]],
              color: uiColors.boundsSelected,
              width: uiStrokeWidths.boundsSelectedScreen / state.zoom,
              opacity: 0.75,
            },
          ]
        : [];
      overlays.push(
        ...(polygon?.vertices ?? [])
          .filter((vertex) => isPointVisible(vertex, viewportRect))
          .map((vertex) =>
            createDraftHandleOverlay(
              vertex,
              uiSelectionHandle.halfWidthPx / state.zoom,
              uiSelectionHandle.strokeWidthPx / state.zoom,
            ),
          ),
      );
      return overlays;
    }

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

    if (toolState.variant === "cutConnect") {
      const pending = toolState.drawingPolygon.vertices.length > 0;
      this.clear();
      return pending;
    }

    if (toolState.variant === "pipe") {
      const polygon = this.getPipePolygon(false);
      if (polygon) {
        const apples = this.getPipeApples(false);
        const start = this.getPipeStart(false);
        const flower = this.getPipeFlower(false);
        this.runHistoryBatch(() => {
          this.addPolygon(polygon);
          const { state } = this.getState();
          if (start) state.actions.setStart(start);
          if (flower) state.actions.setFlowers([...state.flowers, flower]);
          if (apples.length > 0) {
            const { state } = this.getState();
            state.actions.setApples([...state.apples, ...apples]);
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

// Choose the innermost polygon when multiple nested interiors are hit.
function frameTargetArea(polygon: Polygon): number {
  return Math.abs(
    polygon.vertices.reduce((sum, point, index, all) => {
      const next = all[(index + 1) % all.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0),
  );
}
