import { selectionThresholds, uiColors } from "~/editor/constants";
import type { Polygon, Position } from "~/editor/elma-types";
import type { EventContext } from "~/editor/helpers/event-handler";
import {
  applyPolygonOperation,
  type PolygonOperation,
  type PolygonOperationResult,
} from "~/editor/helpers/polygon-boolean";
import { isPointInPolygon } from "~/editor/helpers/polygon-helpers";
import { findPolygonEdgeNearPosition } from "~/editor/helpers/selection-helpers";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";
import { defaultTools } from "./default-tools";
import { Tool } from "./tool-interface";

export type PolygonBooleanToolState = {
  source: Polygon | null;
  originalPolygons: Polygon[] | null;
};

export function isPolygonBooleanTool(id: string): id is PolygonOperation {
  return (
    id === "union" ||
    id === "subtract" ||
    id === "intersect" ||
    id === "exclude"
  );
}

export abstract class PolygonBooleanTool extends Tool<PolygonBooleanToolState> {
  abstract readonly operation: PolygonOperation;
  private cachedResult?: {
    source: Polygon;
    target: Polygon;
    result: PolygonOperationResult;
  };

  onActivate() {
    this.clear();
  }
  onDeactivate() {
    this.clear();
  }
  clear() {
    this.cachedResult = undefined;
    this.getState().setToolState({ source: null, originalPolygons: null });
  }

  private getSource() {
    const { state, toolState } = this.getState();
    // History, document replacement, or another edit invalidates the pending pair.
    return toolState?.originalPolygons === state.polygons
      ? toolState.source
      : null;
  }

  private pickPolygon(position: Position, excluded: Polygon | null) {
    const { state } = this.getState();
    if (
      !state.levelVisibility.showPolygons &&
      !state.levelVisibility.showGroundBounds
    )
      return null;
    const candidates = state.polygons.filter(
      (polygon) =>
        polygon !== excluded && !polygon.grass && polygon.vertices.length >= 3,
    );
    const edge = findPolygonEdgeNearPosition(
      position,
      candidates,
      selectionThresholds.polygonEdge / state.zoom,
    );
    if (edge) return edge;
    // Prefer the smallest enclosing contour so nested polygons remain pickable.
    return (
      candidates
        .filter((polygon) => isPointInPolygon(position, polygon.vertices))
        .sort((a, b) => area(a) - area(b))[0] ?? null
    );
  }

  private getResult(source: Polygon, target: Polygon) {
    if (
      this.cachedResult?.source !== source ||
      this.cachedResult.target !== target
    ) {
      this.cachedResult = {
        source,
        target,
        result: applyPolygonOperation(this.operation, source, target),
      };
    }
    return this.cachedResult.result;
  }

  getInteraction() {
    const { state } = this.getState();
    const source = this.getSource();
    const target = state.mouseOnCanvas
      ? this.pickPolygon(state.mousePosition, source)
      : null;
    const result = source && target ? this.getResult(source, target) : null;
    return { source, target, result };
  }

  onPointerDown(event: PointerEvent, context: EventContext) {
    if (event.button !== 0) return false;
    const { state, setToolState } = this.getState();
    const source = this.getSource();
    const target = this.pickPolygon(context.worldPos, source);
    if (!target) return true;
    if (!source) {
      setToolState({ source: target, originalPolygons: state.polygons });
      return true;
    }
    const result = this.getResult(source, target);
    if (result.status !== "ready") return true;
    // One history entry for both removals and all result contours, including holes.
    state.actions.setPolygons(
      state.polygons.flatMap((polygon) =>
        polygon === source
          ? result.polygons
          : polygon === target
            ? []
            : [polygon],
      ),
    );
    this.clear();
    return true;
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return false;
    this.clear();
    return true;
  }

  onRightClick() {
    this.clear();
    return true;
  }

  getCursor() {
    const { target, result } = this.getInteraction();
    return result && result.status !== "ready"
      ? "not-allowed"
      : target
        ? "pointer"
        : "crosshair";
  }

  getPolygonPreview() {
    const { source, target, result } = this.getInteraction();
    if (!source || !target || result?.status !== "ready") return undefined;
    return { replacedPolygons: [source, target], polygons: result.polygons };
  }

  getWorldOverlays(): WorldRenderOverlayItem[] {
    const { state } = this.getState();
    const { source, target, result } = this.getInteraction();
    const outline = (
      polygon: Polygon,
      color: string,
      opacity = 1,
    ): WorldRenderOverlayItem => ({
      type: "polyline",
      points: polygon.vertices,
      closed: true,
      color,
      width: 2 / state.zoom,
      opacity,
      layer: "top",
    });
    if (result?.status === "ready") {
      return [
        ...[source!, target!].map((polygon) =>
          outline(polygon, uiColors.boundsIdle, 0.35),
        ),
        ...result.polygons.map((polygon) =>
          outline(polygon, uiColors.vertexDraftLine),
        ),
      ];
    }
    return [
      ...(source ? [outline(source, uiColors.vertexDraftLine)] : []),
      ...(target
        ? [outline(target, result ? "#ef4444" : uiColors.vertexDraftLine)]
        : []),
    ];
  }
}

function area(polygon: Polygon) {
  return Math.abs(
    polygon.vertices.reduce((sum, vertex, index, vertices) => {
      const next = vertices[(index + 1) % vertices.length];
      return sum + vertex.x * next.y - next.x * vertex.y;
    }, 0),
  );
}

export class UnionTool extends PolygonBooleanTool {
  readonly meta = defaultTools.union;
  readonly operation = "union";
}
export class SubtractTool extends PolygonBooleanTool {
  readonly meta = defaultTools.subtract;
  readonly operation = "subtract";
}
export class IntersectTool extends PolygonBooleanTool {
  readonly meta = defaultTools.intersect;
  readonly operation = "intersect";
}

export class ExcludeTool extends PolygonBooleanTool {
  readonly meta = defaultTools.exclude;
  readonly operation = "exclude";
}
