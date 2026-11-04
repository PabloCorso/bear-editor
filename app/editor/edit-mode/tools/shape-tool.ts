import { isPointInPolygon } from "~/editor/helpers/polygon-helpers";
import { Tool } from "./tool-interface";
import { defaultTools } from "./default-tools";
import type { EventContext } from "~/editor/helpers/event-handler";
import type { Polygon, Position } from "~/editor/elma-types";
import {
  builtinShapes,
  createShapePolygons,
  isCompositeLibraryItem,
  libraryContentBounds,
  normalizeLibraryContent,
  shapeBounds,
  DEFAULT_SHAPE_SIZE,
  DEFAULT_ARROW_ASPECT_RATIO,
  DEFAULT_ELLIPSE_VERTICES,
  DEFAULT_STAR_POINTS,
  DEFAULT_STAR_INNER_RADIUS,
  MAX_SHAPE_POINTS,
  type BuiltinShape,
  type CustomShape,
  type LibraryContent,
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
    return this.saveLibraryItem({
      polygons,
      apples: [],
      killers: [],
      flowers: [],
      pictures: [],
    });
  }
  saveLibraryItem(content: LibraryContent) {
    const normalized = normalizeLibraryContent(content);
    if (!normalized) return false;
    const { state } = this.getState();
    const id = crypto.randomUUID();
    const names = new Set(state.customShapes.map((s) => s.name));
    let number = 1;
    while (names.has(`Item ${number}`)) number++;
    state.actions.setCustomShapes([
      ...state.customShapes,
      { id, name: `Item ${number}`, ...normalized },
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
    this.pointerDown = { x: context.screenX, y: context.screenY };
    this.dragged = false;
    setToolState({
      start: toolState?.capturing
        ? context.worldPos
        : this.snapPosition(context.worldPos, event.altKey),
      end: context.worldPos,
      constrain: event.shiftKey,
    });
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
    if (toolState?.capturing) {
      const polygons = this.capturePolygons();
      this.clear();
      this.saveShape(polygons);
    } else this.commit(event.altKey);
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
  getDrafts(bypass?: boolean): Partial<LibraryContent> {
    const { state, toolState } = this.getState();
    if (!toolState || toolState.capturing) return {};
    if (!toolState.start && !state.mouseOnCanvas) return {};
    const shape =
      state.customShapes.find((s) => s.id === toolState.shapeId) ??
      builtinShapes.find((shape) => shape.id === toolState.shapeId)?.id;
    if (!shape) return {};
    if (typeof shape === "object" && isCompositeLibraryItem(shape)) {
      const position =
        toolState.start && toolState.end && this.dragged
          ? this.snapPosition(toolState.end, bypass)
          : (toolState.start ?? this.snapPosition(state.mousePosition, bypass));
      return this.getPlacementContent(shape, position);
    }
    if (toolState.start && toolState.end && this.dragged) {
      return {
        polygons: createShapePolygons({
          shape,
          ...toolState,
          start: toolState.start,
          end: this.snapPosition(toolState.end, bypass),
        }),
      };
    }
    return {
      polygons: this.getPlacementPolygons(
        shape,
        toolState.start ?? this.snapPosition(state.mousePosition, bypass),
      ),
    };
  }
  private getPlacementPolygons(
    shape: BuiltinShape | CustomShape,
    position: Position,
  ): Polygon[] {
    if (typeof shape === "object") {
      const bounds = shapeBounds(shape.polygons);
      const offset = {
        x: position.x - bounds.minX - bounds.width / 2,
        y: position.y - bounds.minY - bounds.height / 2,
      };
      return shape.polygons.map((polygon) => ({
        grass: polygon.grass,
        vertices: polygon.vertices.map((vertex) => ({
          x: vertex.x + offset.x,
          y: vertex.y + offset.y,
        })),
      }));
    }
    const { toolState } = this.getState();
    const halfWidth = DEFAULT_SHAPE_SIZE / 2;
    const halfHeight =
      halfWidth / (shape === "arrow" ? DEFAULT_ARROW_ASPECT_RATIO : 1);
    return createShapePolygons({
      ...toolState,
      shape,
      start: { x: position.x - halfWidth, y: position.y - halfHeight },
      end: { x: position.x + halfWidth, y: position.y + halfHeight },
    });
  }
  private getPlacementContent(
    item: CustomShape,
    position: Position,
  ): LibraryContent {
    const bounds = libraryContentBounds(item);
    const offset = {
      x: position.x - bounds.minX - bounds.width / 2,
      y: position.y - bounds.minY - bounds.height / 2,
    };
    const translate = (point: Position) => ({
      x: point.x + offset.x,
      y: point.y + offset.y,
    });
    return {
      polygons: item.polygons.map((polygon) => ({
        grass: polygon.grass,
        vertices: polygon.vertices.map(translate),
      })),
      apples: item.apples.map((apple) => ({
        ...apple,
        position: translate(apple.position),
      })),
      killers: item.killers.map(translate),
      flowers: item.flowers.map(translate),
      pictures: item.pictures.map((picture) => ({
        ...picture,
        position: translate(picture.position),
      })),
    };
  }
  getWorldOverlays(): WorldRenderOverlayItem[] {
    const { state, toolState } = this.getState();
    if (toolState?.capturing && toolState.start && toolState.end) {
      const captured = this.capturePolygons();
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
        ...captured.map((polygon) => ({
          type: "polyline" as const,
          points: polygon.vertices,
          closed: true,
          color: uiColors.boundsHover,
          width: uiStrokeWidths.boundsHoverScreen / state.zoom,
          layer: "top" as const,
        })),
      ];
    }
    if (toolState?.capturing && state.mouseOnCanvas) {
      const polygon = this.findCapturePolygon(state.mousePosition);
      return polygon
        ? [
            {
              type: "polyline" as const,
              points: polygon.vertices,
              closed: true,
              color: uiColors.boundsHover,
              width: uiStrokeWidths.boundsHoverScreen / state.zoom,
              layer: "top" as const,
            },
          ]
        : [];
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
      const polygon = this.findCapturePolygon(end);
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
  private findCapturePolygon(position: Position) {
    const { state } = this.getState();
    return (
      findPolygonEdgeNearPosition(
        position,
        state.polygons,
        selectionThresholds.polygonEdge / state.zoom,
      ) ??
      [...state.polygons]
        .reverse()
        .find((polygon) => isPointInPolygon(position, polygon.vertices))
    );
  }
  private commit(bypass?: boolean) {
    const drafts = this.getDrafts(bypass);
    const { state } = this.getState();
    if (
      !drafts.polygons?.length &&
      !drafts.apples?.length &&
      !drafts.killers?.length &&
      !drafts.flowers?.length &&
      !drafts.pictures?.length
    )
      return this.clear();
    this.store.history.execute(
      { label: "Place library item", toolId: this.meta.id },
      () =>
        this.store.setState({
          polygons: [...state.polygons, ...(drafts.polygons ?? [])],
          apples: [...state.apples, ...(drafts.apples ?? [])],
          killers: [...state.killers, ...(drafts.killers ?? [])],
          flowers: [...state.flowers, ...(drafts.flowers ?? [])],
          pictures: [...state.pictures, ...(drafts.pictures ?? [])],
        }),
    );
    this.clear();
  }
}
