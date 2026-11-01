import { isPointInPolygon } from "~/editor/helpers/polygon-helpers";
import { Tool } from "./tool-interface";
import { defaultTools } from "./default-tools";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { Polygon, Position } from "~/editor/elma-types";
import {
  createShapePolygons,
  normalizeShape,
  DEFAULT_ELLIPSE_VERTICES,
  DEFAULT_STAR_POINTS,
  DEFAULT_STAR_INNER_RADIUS,
  MAX_SHAPE_POINTS,
  type BuiltinShape,
} from "~/editor/helpers/shapes";
import { findPolygonEdgeNearPosition } from "~/editor/helpers/selection-helpers";
import {
  selectionThresholds,
  uiColors,
  uiStrokeWidths,
  uiSelectionHandle,
} from "~/editor/constants";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";

export type ShapeToolState = {
  shapeId: string;
  ellipseVertices: number;
  starPoints: number;
  starInnerRadius: number;
  capturing: boolean;
  start?: Position;
  end?: Position;
  constrain?: boolean;
};
export const defaultShapeState: ShapeToolState = {
  shapeId: "ellipse",
  ellipseVertices: DEFAULT_ELLIPSE_VERTICES,
  starPoints: DEFAULT_STAR_POINTS,
  starInnerRadius: DEFAULT_STAR_INNER_RADIUS,
  capturing: false,
};

export class ShapeTool extends Tool<ShapeToolState> {
  readonly meta = defaultTools.shape;
  private pointerDown?: Position;
  private dragged = false;

  onActivate() {
    if (!this.getState().toolState)
      this.getState().setToolState(defaultShapeState);
  }
  onDeactivate() {
    this.clear();
    this.getState().setToolState({ capturing: false });
  }
  clear() {
    this.pointerDown = undefined;
    this.dragged = false;
    this.getState().setToolState({
      start: undefined,
      end: undefined,
      constrain: false,
    });
  }
  isInteracting() {
    return !!this.getState().toolState?.start;
  }
  selectShape(shapeId: string) {
    this.clear();
    this.getState().setToolState({ shapeId, capturing: false });
  }
  startCapture() {
    this.clear();
    this.getState().setToolState({ capturing: true });
  }
  cancelCapture() {
    this.clear();
    this.getState().setToolState({ capturing: false });
  }
  saveShape(polygons: Polygon[]) {
    const normalized = normalizeShape(polygons);
    if (!normalized) return false;
    const { state } = this.getState();
    const id = crypto.randomUUID();
    const names = new Set(state.customShapes.map((s) => s.name));
    let number = 1;
    while (names.has(`Shape ${number}`)) number++;
    state.actions.setCustomShapes([
      ...state.customShapes,
      { id, name: `Shape ${number}`, polygons: normalized },
    ]);
    state.actions.activateTool(this.meta.id);
    this.selectShape(id);
    return true;
  }
  adjustOption(
    field: "ellipseVertices" | "starPoints" | "starInnerRadius",
    delta: number,
  ) {
    const { toolState, setToolState } = this.getState();
    setToolState({
      [field]: Math.max(
        field === "starInnerRadius" ? 1 : 3,
        Math.min(
          field === "starInnerRadius" ? 99 : MAX_SHAPE_POINTS,
          (toolState ?? defaultShapeState)[field] + delta,
        ),
      ),
    });
  }
  onPointerDown(event: PointerEvent, context: EventContext) {
    if (event.button !== 0) return false;
    const { toolState, setToolState } = this.getState();
    if (toolState?.start && !toolState.capturing) {
      setToolState({ end: context.worldPos, constrain: event.shiftKey });
      this.commit(event.altKey);
    } else {
      this.pointerDown = { x: context.screenX, y: context.screenY };
      this.dragged = false;
      setToolState({
        start: toolState?.capturing
          ? context.worldPos
          : this.snapPosition(context.worldPos, event.altKey),
        end: context.worldPos,
        constrain: event.shiftKey,
      });
    }
    return true;
  }
  onPointerMove(event: PointerEvent, context: EventContext) {
    const { toolState, setToolState } = this.getState();
    if (!toolState?.start) return false;
    if (
      this.pointerDown &&
      Math.hypot(
        context.screenX - this.pointerDown.x,
        context.screenY - this.pointerDown.y,
      ) >= 4
    )
      this.dragged = true;
    setToolState({
      end: context.worldPos,
      constrain: event.shiftKey,
    });
    return true;
  }
  onPointerUp(event: PointerEvent, context: EventContext) {
    if (event.type === "pointercancel") {
      this.clear();
      return true;
    }
    if (!this.pointerDown) return false;
    this.onPointerMove(event, context);
    const { toolState } = this.getState();
    this.pointerDown = undefined;
    if (toolState?.capturing) {
      const polygons = this.capturePolygons();
      this.clear();
      this.saveShape(polygons);
    } else if (this.dragged) this.commit(event.altKey);
    return true;
  }
  onRightClick() {
    const { toolState } = this.getState();
    if (!toolState?.start && !toolState?.capturing) return false;
    this.cancelCapture();
    return true;
  }
  onKeyDown(event: KeyboardEvent) {
    const { toolState, setToolState } = this.getState();
    if (!toolState) return false;
    if (event.key === "Escape" && (toolState.start || toolState.capturing)) {
      this.cancelCapture();
      return true;
    }
    if (event.key === "Shift") {
      setToolState({ constrain: true });
      return false;
    }
    if (
      event.metaKey ||
      (event.ctrlKey && !event.getModifierState("AltGraph")) ||
      event.isComposing ||
      toolState.capturing
    )
      return false;
    if (
      ["+", "=", "-", "_"].includes(event.key) &&
      ["ellipse", "star"].includes(toolState.shapeId)
    ) {
      this.adjustOption(
        toolState.shapeId === "ellipse" ? "ellipseVertices" : "starPoints",
        ["+", "="].includes(event.key) ? 1 : -1,
      );
    } else if (["[", "]"].includes(event.key) && toolState.shapeId === "star") {
      this.adjustOption("starInnerRadius", event.key === "]" ? 1 : -1);
    } else return false;
    event.preventDefault();
    return true;
  }
  onKeyUp(event: KeyboardEvent) {
    if (event.key !== "Shift") return false;
    this.getState().setToolState({ constrain: false });
    return false;
  }
  getCursor() {
    return "crosshair";
  }
  getDrafts(bypass?: boolean) {
    const { state, toolState } = this.getState();
    if (!toolState?.start || !toolState.end || toolState.capturing) return {};
    const shape =
      state.customShapes.find((s) => s.id === toolState.shapeId) ??
      (["ellipse", "rectangle", "star"].includes(toolState.shapeId)
        ? (toolState.shapeId as BuiltinShape)
        : null);
    return {
      polygons: shape
        ? createShapePolygons({
            shape,
            ...toolState,
            start: toolState.start,
            end: this.snapPosition(toolState.end, bypass),
          })
        : [],
    };
  }
  getWorldOverlays(): WorldRenderOverlayItem[] {
    const { state, toolState } = this.getState();
    if (toolState?.capturing && toolState.start && toolState.end) {
      return [
        {
          type: "rect",
          position: {
            x: Math.min(toolState.start.x, toolState.end.x),
            y: Math.min(toolState.start.y, toolState.end.y),
          },
          width: Math.abs(toolState.end.x - toolState.start.x),
          height: Math.abs(toolState.end.y - toolState.start.y),
          strokeColor: uiColors.boundsSelected,
          lineWidth: 1 / state.zoom,
        },
      ];
    }
    return (this.getDrafts().polygons ?? []).flatMap((p) => [
      {
        type: "polyline" as const,
        points: [...p.vertices, p.vertices[0]],
        color: uiColors.boundsSelected,
        width: uiStrokeWidths.boundsSelectedScreen / state.zoom,
        opacity: 0.75,
      },
      ...p.vertices.map((v) => ({
        type: "rect" as const,
        position: {
          x: v.x - uiSelectionHandle.halfWidthPx / state.zoom,
          y: v.y - uiSelectionHandle.halfWidthPx / state.zoom,
        },
        width: (uiSelectionHandle.halfWidthPx * 2) / state.zoom,
        height: (uiSelectionHandle.halfWidthPx * 2) / state.zoom,
        fillColor: uiColors.vertexDraftPointFill,
        strokeColor: uiColors.vertexDraftPointStroke,
        lineWidth: 1 / state.zoom,
        layer: "top" as const,
      })),
    ]);
  }
  private capturePolygons() {
    const { state, toolState } = this.getState();
    if (!toolState?.start || !toolState.end) return [];
    const { start, end } = toolState;
    const visibility = state.levelVisibility;
    if (
      !visibility.showPolygons &&
      !visibility.showGroundBounds &&
      !visibility.showGrassBounds &&
      !visibility.showPolygonHandles
    )
      return [];
    if (!this.dragged) {
      const polygon =
        findPolygonEdgeNearPosition(
          end,
          state.polygons,
          selectionThresholds.polygonEdge / state.zoom,
        ) ??
        [...state.polygons]
          .reverse()
          .find((p) => isPointInPolygon(end, p.vertices));
      return polygon ? [polygon] : [];
    }
    return state.polygons.filter((p) =>
      p.vertices.every(
        (v) =>
          v.x >= Math.min(start.x, end.x) &&
          v.x <= Math.max(start.x, end.x) &&
          v.y >= Math.min(start.y, end.y) &&
          v.y <= Math.max(start.y, end.y),
      ),
    );
  }
  private commit(bypass?: boolean) {
    const polygons = this.getDrafts(bypass).polygons ?? [];
    if (polygons.length) {
      const { state } = this.getState();
      state.actions.setPolygons([...state.polygons, ...polygons]);
    }
    this.clear();
  }
}
