import { findSessionArtifact } from "~/editor/session-artifacts";
import {
  colors,
  OBJECT_DIAMETER,
  selectionRenderLimits,
  selectionThresholds,
  uiColors,
  uiSelectionHandle,
  uiStrokeWidths,
} from "~/editor/constants";
import type { Polygon, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";
import { getKuskiSelectionCircles } from "~/editor/kuski-geometry";
import {
  findPolygonEdgeNearPosition,
  findVertexNearPosition,
  getSelectionBounds,
} from "~/editor/helpers/selection-helpers";
import { getObjectBoundsRadius } from "~/editor/render/object-assets";
import {
  isPointVisible,
  isPolygonVisible,
} from "~/editor/render/world-derived-data-cache";
import type { WorldRect } from "~/editor/render/world-geometry";
import type { WorldRenderOverlayItem } from "~/editor/render/world-scene";

import {
  isPolygonEdgeSelectable,
  isPolygonEdgeSelected,
} from "./polygon-selection";
import type { SelectToolState } from "./select-tool";
import { SelectionVisibility } from "./selection-visibility";

type AreaSelectionOverlay = {
  variant: "marquee" | "lasso";
  start: Position;
  end: Position;
  lassoPath: Position[];
} | null;

export function createSelectionOverlays({
  state,
  selection,
  viewportRect,
  isDragging,
  areaSelection,
}: {
  state: EditorState;
  selection: SelectToolState;
  viewportRect: WorldRect;
  isDragging: boolean;
  areaSelection: AreaSelectionOverlay;
}): {
  selection: WorldRenderOverlayItem[];
  area: WorldRenderOverlayItem[];
} {
  const overlays: WorldRenderOverlayItem[] = [];
  const visibility = new SelectionVisibility(state);
  const handleSize = uiSelectionHandle.halfWidthPx / state.zoom;
  const hoverLineWidth = uiStrokeWidths.boundsHoverScreen / state.zoom;
  const selectedLineWidth = uiStrokeWidths.boundsSelectedScreen / state.zoom;
  const handleStrokeWidth = uiSelectionHandle.strokeWidthPx / state.zoom;
  const edgeSelectable = (polygon: Polygon, edgeIndex: number) =>
    isPolygonEdgeSelectable(polygon, edgeIndex, selection.selectedVertices);

  if (
    !selection.transformMode &&
    !isDragging &&
    !areaSelection &&
    state.mouseOnCanvas
  ) {
    addHoverOverlays({
      overlays,
      state,
      selection,
      viewportRect,
      visibility,
      handleSize,
      handleStrokeWidth,
      hoverLineWidth,
      edgeSelectable,
    });
  }

  addSelectedPolygonOverlays(
    overlays,
    selection,
    viewportRect,
    selectedLineWidth,
  );
  addSelectedObjectOverlays(
    overlays,
    state,
    selection,
    viewportRect,
    selectedLineWidth,
  );
  addSelectionHandles(
    overlays,
    state,
    selection,
    viewportRect,
    handleSize,
    handleStrokeWidth,
  );
  const area: WorldRenderOverlayItem[] = [];
  if (areaSelection) addAreaOverlay(area, state, areaSelection);
  return { selection: overlays, area };
}

function addHoverOverlays({
  overlays,
  state,
  selection,
  viewportRect,
  visibility,
  handleSize,
  handleStrokeWidth,
  hoverLineWidth,
  edgeSelectable,
}: {
  overlays: WorldRenderOverlayItem[];
  state: EditorState;
  selection: SelectToolState;
  viewportRect: WorldRect;
  visibility: SelectionVisibility;
  handleSize: number;
  handleStrokeWidth: number;
  hoverLineWidth: number;
  edgeSelectable: (polygon: Polygon, edgeIndex: number) => boolean;
}): void {
  const hoveredObject = selection.hoveredObject;
  if (hoveredObject && !selection.selectedObjects.includes(hoveredObject)) {
    if (
      hoveredObject === state.start ||
      findSessionArtifact(state, hoveredObject)
    ) {
      overlays.push(
        ...getObjectSelectionCircles(state, hoveredObject).map((circle) => ({
          type: "circle" as const,
          center: { x: circle.x, y: circle.y },
          radius: circle.radius,
          strokeColor: uiColors.boundsHover,
          lineWidth: hoverLineWidth,
          layer: "top" as const,
        })),
      );
    } else if (isPointVisible(hoveredObject, viewportRect)) {
      overlays.push({
        type: "circle",
        center: hoveredObject,
        radius: OBJECT_DIAMETER / 2,
        strokeColor: uiColors.boundsHover,
        lineWidth: hoverLineWidth,
        layer: "top",
      });
    }
  }
  if (hoveredObject || !visibility.polygonsSelectable()) return;

  const hoveredVertex = findVertexNearPosition(
    state.mousePosition,
    state.polygons,
    selectionThresholds.vertex / state.zoom,
  );
  if (hoveredVertex && isPointVisible(hoveredVertex.vertex, viewportRect)) {
    overlays.push(
      createSelectionHandleOverlay(
        hoveredVertex.vertex,
        handleSize,
        handleStrokeWidth,
      ),
    );
  }
  const hoveredPolygon = findPolygonEdgeNearPosition(
    state.mousePosition,
    state.polygons,
    selectionThresholds.polygonEdge / state.zoom,
    edgeSelectable,
  );
  if (!hoveredVertex && hoveredPolygon) {
    const hoveredSelectedEdge = findPolygonEdgeNearPosition(
      state.mousePosition,
      state.polygons,
      selectionThresholds.polygonEdge / state.zoom,
      (polygon, edgeIndex) =>
        edgeSelectable(polygon, edgeIndex) &&
        isPolygonEdgeSelected(polygon, edgeIndex, selection.selectedVertices),
    );
    const selectedCount = selection.selectedVertices.filter(
      (selected) => selected.polygon === hoveredPolygon,
    ).length;
    if (
      selectedCount !== hoveredPolygon.vertices.length &&
      !hoveredSelectedEdge &&
      isPolygonVisible(hoveredPolygon, viewportRect)
    ) {
      overlays.push({
        type: "polyline",
        points: hoveredPolygon.vertices,
        closed: true,
        color: uiColors.boundsHover,
        width: hoverLineWidth,
        layer: "top",
      });
    }
  }
}

function addSelectedPolygonOverlays(
  overlays: WorldRenderOverlayItem[],
  selection: SelectToolState,
  viewportRect: WorldRect,
  lineWidth: number,
): void {
  const verticesByPolygon = new Map<Polygon, Set<Position>>();
  for (const { polygon, vertex } of selection.selectedVertices) {
    const vertices = verticesByPolygon.get(polygon) ?? new Set<Position>();
    vertices.add(vertex);
    verticesByPolygon.set(polygon, vertices);
  }
  for (const [polygon, vertices] of verticesByPolygon) {
    if (
      polygon.vertices.length < 2 ||
      !isPolygonVisible(polygon, viewportRect)
    ) {
      continue;
    }
    for (let edgeIndex = 0; edgeIndex < polygon.vertices.length; edgeIndex++) {
      if (
        !isPolygonEdgeSelectable(
          polygon,
          edgeIndex,
          selection.selectedVertices,
        ) ||
        !isPolygonEdgeSelected(polygon, edgeIndex, vertices)
      ) {
        continue;
      }
      overlays.push({
        type: "polyline",
        points: [
          polygon.vertices[edgeIndex],
          polygon.vertices[(edgeIndex + 1) % polygon.vertices.length],
        ],
        closed: false,
        color: polygon.grass ? colors.grass : uiColors.boundsSelected,
        width: lineWidth,
        layer: "top",
      });
    }
  }
}

function addSelectedObjectOverlays(
  overlays: WorldRenderOverlayItem[],
  state: EditorState,
  selection: SelectToolState,
  viewportRect: WorldRect,
  lineWidth: number,
): void {
  for (const position of selection.selectedObjects) {
    const artifact = findSessionArtifact(state, position);
    if (artifact?.selectionShape) {
      overlays.push({
        type: "polyline",
        points: artifact.selectionShape,
        closed: true,
        color: uiColors.boundsSelected,
        width: lineWidth,
        layer: "top",
      });
    } else if (position === state.start || artifact) {
      for (const circle of getObjectSelectionCircles(state, position)) {
        if (!circleVisible(circle, viewportRect)) continue;
        overlays.push({
          type: "circle",
          center: { x: circle.x, y: circle.y },
          radius: circle.radius,
          strokeColor: uiColors.boundsSelected,
          lineWidth,
          layer: "top",
        });
      }
    } else if (isPointVisible(position, viewportRect)) {
      overlays.push({
        type: "circle",
        center: position,
        radius: getObjectBoundsRadius(),
        strokeColor: uiColors.boundsSelected,
        lineWidth,
        layer: "top",
      });
    }
  }
}

function addSelectionHandles(
  overlays: WorldRenderOverlayItem[],
  state: EditorState,
  selection: SelectToolState,
  viewportRect: WorldRect,
  size: number,
  lineWidth: number,
): void {
  if (selection.transformMode) return;
  const positions = [
    ...selection.selectedVertices.map(({ vertex }) => vertex),
    ...selection.selectedObjects,
  ].filter((position) => isPointVisible(position, viewportRect));
  if (!positions.length) return;
  const stride = Math.max(
    1,
    Math.ceil(positions.length / selectionRenderLimits.maxIndividualHandles),
  );
  overlays.push(
    ...positions
      .filter((_, index) => index % stride === 0)
      .map((position) =>
        createSelectionHandleOverlay(position, size, lineWidth),
      ),
  );
}

function addAreaOverlay(
  overlays: WorldRenderOverlayItem[],
  state: EditorState,
  area: NonNullable<AreaSelectionOverlay>,
): void {
  if (area.variant === "lasso") {
    overlays.push({
      type: "polyline",
      points: [...area.lassoPath, area.end],
      closed: true,
      color: uiColors.marqueeStroke,
      width: uiSelectionHandle.strokeWidthPx / state.zoom,
      layer: "top",
    });
    return;
  }
  const bounds = getSelectionBounds(area.start, area.end);
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

function getObjectSelectionCircles(state: EditorState, position: Position) {
  return (
    findSessionArtifact(state, position)?.selectionCircles ??
    getKuskiSelectionCircles({ start: position })
  );
}

function circleVisible(
  circle: { x: number; y: number; radius: number },
  viewport: WorldRect,
): boolean {
  return !(
    circle.x + circle.radius < viewport.minX ||
    circle.x - circle.radius > viewport.maxX ||
    circle.y + circle.radius < viewport.minY ||
    circle.y - circle.radius > viewport.maxY
  );
}

export function createSelectionHandleOverlay(
  position: Position,
  size: number,
  lineWidth: number,
): WorldRenderOverlayItem {
  const side = size * 2;
  return {
    type: "rect",
    position: { x: position.x - size, y: position.y - size },
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
