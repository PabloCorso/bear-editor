import type { Position } from "~/editor/elma-types";
import type { EventContext } from "~/editor/helpers/event-handler";
import { getClosestPointOnLineSegment } from "~/editor/helpers/coordinate-helpers";
import { defaultTools } from "./default-tools";
import { Tool } from "./tool-interface";

export type Measurement = { id: number; from: Position; to: Position };
export type MeasureToolState = {
  measurements: Measurement[];
  selectedId?: number;
  hoveredId?: number;
  preview?: Measurement;
  // Endpoint edits stay in the preview until released, so cancel is lossless.
  editingId?: number;
  anchor?: Position;
  dragging?: boolean;
  snappedPoint?: Position;
};

export function measurementValues({
  from,
  to,
}: Pick<Measurement, "from" | "to">) {
  const width = Math.abs(to.x - from.x);
  const height = Math.abs(to.y - from.y);
  const length = Math.hypot(width, height);
  const horizontalAngle = length
    ? (Math.atan2(height, width) * 180) / Math.PI
    : 0;
  return {
    width,
    height,
    length,
    horizontalAngle,
    verticalAngle: 90 - horizontalAngle,
  };
}

export function constrainMeasurement(
  anchor: Position,
  point: Position,
): Position {
  return Math.abs(point.x - anchor.x) >= Math.abs(point.y - anchor.y)
    ? { x: point.x, y: anchor.y }
    : { x: anchor.x, y: point.y };
}

export class MeasureTool extends Tool<MeasureToolState> {
  readonly meta = defaultTools.measure;

  onActivate() {
    if (!this.getState().toolState?.measurements) this.clearAll();
  }

  onDeactivate() {
    this.clear();
  }

  clear() {
    this.getState().setToolState({
      preview: undefined,
      anchor: undefined,
      editingId: undefined,
      dragging: false,
      hoveredId: undefined,
      snappedPoint: undefined,
    });
  }

  clearAll() {
    this.clear();
    this.getState().setToolState({ measurements: [], selectedId: undefined });
  }

  removeSelected() {
    const { toolState, setToolState } = this.getState();
    this.clear();
    setToolState({
      measurements: (toolState?.measurements ?? []).filter(
        (m) => m.id !== toolState?.selectedId,
      ),
      selectedId: undefined,
    });
  }

  private endpoint(
    point: Position,
    event: Pick<MouseEvent, "shiftKey" | "altKey">,
    anchor?: Position,
  ) {
    const { state } = this.getState();
    let target = { ...point };
    let closest = 10 / state.zoom;
    let snapped = false;
    if (!event.altKey) {
      for (const polygon of this.visiblePolygons()) {
        for (const vertex of polygon.vertices) {
          const distance = Math.hypot(point.x - vertex.x, point.y - vertex.y);
          if (distance < closest) {
            closest = distance;
            target = { ...vertex };
            snapped = true;
          }
        }
      }
    }
    if (anchor && event.shiftKey) {
      const constrained = constrainMeasurement(anchor, target);
      snapped =
        snapped && constrained.x === target.x && constrained.y === target.y;
      target = constrained;
    }
    return { point: target, snapped };
  }

  private visiblePolygons() {
    const { state } = this.getState();
    const visibility = state.levelVisibility;
    return state.polygons.filter(
      (p) =>
        visibility.showPolygons ||
        visibility.showPolygonHandles ||
        (p.grass ? visibility.showGrassBounds : visibility.showGroundBounds),
    );
  }

  private edgeAt(point: Position): Measurement | undefined {
    const { state } = this.getState();
    let closest = 7 / state.zoom;
    let result: Measurement | undefined;
    for (const polygon of this.visiblePolygons()) {
      for (let i = 0; i < polygon.vertices.length; i++) {
        const from = polygon.vertices[i];
        const to = polygon.vertices[(i + 1) % polygon.vertices.length];
        if (from.x === to.x && from.y === to.y) continue;
        const hit = getClosestPointOnLineSegment(point, from, to);
        const distance = Math.hypot(point.x - hit.x, point.y - hit.y);
        if (distance < closest) {
          closest = distance;
          result = { id: 0, from: { ...from }, to: { ...to } };
        }
      }
    }
    return result;
  }

  private rulerAt(point: Position) {
    const { state, toolState } = this.getState();
    let closest = 8 / state.zoom;
    let result: Measurement | undefined;
    for (const ruler of toolState?.measurements ?? []) {
      const hit = getClosestPointOnLineSegment(point, ruler.from, ruler.to);
      const distance = Math.hypot(point.x - hit.x, point.y - hit.y);
      if (distance <= closest) {
        closest = distance;
        result = ruler;
      }
    }
    return result;
  }

  onPointerDown(event: PointerEvent, context: EventContext) {
    const { toolState, setToolState, state } = this.getState();
    if (toolState?.anchor) {
      this.updatePreview(event, context.worldPos);
      this.commit();
      return true;
    }
    const ruler = this.rulerAt(context.worldPos);
    if (ruler) {
      const endpoint = (["from", "to"] as const).find(
        (key) =>
          Math.hypot(
            context.worldPos.x - ruler[key].x,
            context.worldPos.y - ruler[key].y,
          ) <=
          10 / state.zoom,
      );
      setToolState({
        selectedId: ruler.id,
        hoveredId: ruler.id,
        preview: undefined,
      });
      if (endpoint) {
        const anchor = ruler[endpoint === "from" ? "to" : "from"];
        setToolState({
          anchor: { ...anchor },
          preview: {
            ...ruler,
            from: { ...anchor },
            to: { ...ruler[endpoint] },
          },
          editingId: ruler.id,
          dragging: true,
        });
      }
      return true;
    }
    const { point, snapped: isSnapped } = this.endpoint(
      context.worldPos,
      event,
    );
    const edge =
      !event.altKey && !event.shiftKey && !isSnapped
        ? this.edgeAt(point)
        : undefined;
    if (edge) {
      setToolState({ preview: edge });
      this.commit();
    } else {
      setToolState({
        anchor: point,
        preview: { id: 0, from: point, to: point },
        selectedId: undefined,
        hoveredId: undefined,
      });
    }
    return true;
  }

  onPointerMove(event: PointerEvent, context: EventContext) {
    this.updatePreview(event, context.worldPos);
    return true;
  }

  private updatePreview(
    event: Pick<MouseEvent, "shiftKey" | "altKey">,
    point: Position,
  ) {
    const { toolState, setToolState } = this.getState();
    if (toolState?.anchor) {
      const { point: to, snapped } = this.endpoint(
        point,
        event,
        toolState.anchor,
      );
      setToolState({
        preview: { id: toolState.editingId ?? 0, from: toolState.anchor, to },
        snappedPoint: snapped ? to : undefined,
      });
      return;
    }
    const ruler = this.rulerAt(point);
    const { point: target, snapped: isSnapped } = this.endpoint(point, event);
    setToolState({
      hoveredId: ruler?.id,
      preview:
        !ruler && !event.altKey && !event.shiftKey && !isSnapped
          ? this.edgeAt(point)
          : undefined,
      snappedPoint: isSnapped ? target : undefined,
    });
  }

  onPointerUp(event: PointerEvent, context: EventContext) {
    if (this.getState().toolState?.dragging) {
      this.updatePreview(event, context.worldPos);
      this.commit();
      this.clear();
    }
    return true;
  }

  private commit() {
    const { toolState, setToolState } = this.getState();
    if (
      !toolState?.preview ||
      measurementValues(toolState.preview).length < 1e-8
    )
      return;
    const measurements = toolState.measurements ?? [];
    const id =
      toolState.editingId ?? Math.max(0, ...measurements.map((m) => m.id)) + 1;
    const ruler = { ...toolState.preview, id };
    setToolState({
      measurements: toolState.editingId
        ? measurements.map((m) => (m.id === id ? ruler : m))
        : [...measurements, ruler],
      selectedId: id,
    });
    this.clear();
  }

  onRightClick() {
    this.clear();
    return true;
  }

  onKeyDown(event: KeyboardEvent) {
    const { toolState, state } = this.getState();
    if (event.key === "Shift" || event.key === "Alt") {
      if (state.mouseOnCanvas) this.updatePreview(event, state.mousePosition);
      return true;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key === "Escape" && toolState?.anchor) {
      this.clear();
      event.preventDefault();
      return true;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      this.removeSelected();
      event.preventDefault();
      return true;
    }
    return false;
  }

  onKeyUp(event: KeyboardEvent) {
    const { state } = this.getState();
    if ((event.key === "Shift" || event.key === "Alt") && state.mouseOnCanvas)
      this.updatePreview(event, state.mousePosition);
    return false;
  }

  getCursor(context: EventContext) {
    return this.rulerAt(context.worldPos) ? "pointer" : "crosshair";
  }

  isInteracting() {
    return !!this.getState().toolState?.anchor;
  }
}
