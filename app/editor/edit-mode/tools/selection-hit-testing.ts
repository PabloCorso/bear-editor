import {
  findSessionArtifact,
  getSessionArtifacts,
} from "~/editor/session-artifacts";
import { OBJECT_DIAMETER, selectionThresholds } from "~/editor/constants";
import type { Picture, Polygon, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";
import {
  findObjectNearPosition,
  findPolygonEdgeNearPosition,
  isStartObjectHit,
  type StartSelectionMode,
} from "~/editor/helpers/selection-helpers";

import type { SelectToolState } from "./select-tool";

type HitTestContext = {
  state: EditorState;
  selection: SelectToolState | undefined;
};

export class SelectionHitTester {
  constructor(
    private readonly getContext: () => HitTestContext,
    private readonly polygonsSelectable: () => boolean,
    private readonly edgeSelectable: (
      polygon: Polygon,
      edgeIndex: number,
    ) => boolean,
    private readonly edgeSelected: (
      polygon: Polygon,
      edgeIndex: number,
    ) => boolean,
  ) {}

  findObject(position: Position): Position | null {
    const { state } = this.getContext();
    const threshold = Math.max(
      selectionThresholds.object / state.zoom,
      OBJECT_DIAMETER / 2,
    );
    const useImage = state.levelVisibility.showObjects;
    const artifact = [...getSessionArtifacts(state)]
      .reverse()
      .find((item) => item.hitTest(position, useImage));
    if (artifact) return artifact.position;

    const groups = [
      state.apples.map((apple) => apple.position),
      state.killers,
      state.flowers,
    ];
    for (const objects of groups) {
      const object = findObjectNearPosition(position, objects, threshold);
      if (object) return object;
    }
    return isStartObjectHit(
      position,
      state.start,
      useImage ? "boundsWithImage" : "boundsOnly",
      useImage,
    )
      ? state.start
      : null;
  }

  findSelectedObject(
    position: Position,
    objects: Position[],
    threshold: number,
    useStartImageSelection = false,
  ): Position | null {
    const { state } = this.getContext();
    const startMode: StartSelectionMode = useStartImageSelection
      ? "boundsWithImage"
      : "boundsOnly";
    for (const object of objects) {
      const artifact = findSessionArtifact(state, object);
      if (artifact) {
        if (
          artifact.hitTest(
            position,
            Boolean(
              state.levelVisibility.showObjects && useStartImageSelection,
            ),
          )
        ) {
          return object;
        }
      } else if (object === state.start) {
        if (
          isStartObjectHit(
            position,
            state.start,
            startMode,
            Boolean(
              state.levelVisibility.showObjects && useStartImageSelection,
            ),
          )
        ) {
          return object;
        }
      } else if (findObjectNearPosition(position, [object], threshold)) {
        return object;
      }
    }
    return null;
  }

  isSelectionHit(position: Position, hoveredPicture: Picture | null): boolean {
    const { state, selection } = this.getContext();
    if (!selection) return false;
    if (
      this.findSelectedObject(
        position,
        selection.selectedObjects,
        Math.max(selectionThresholds.object / state.zoom, OBJECT_DIAMETER / 2),
      )
    ) {
      return true;
    }
    if (
      this.polygonsSelectable() &&
      selection.selectedVertices.some(
        ({ polygon, vertex }) =>
          state.polygons.includes(polygon) &&
          polygon.vertices.includes(vertex) &&
          isWithinVertexThreshold(position, vertex, state.zoom),
      )
    ) {
      return true;
    }
    if (this.polygonsSelectable() && this.findSelectedEdge(position)) {
      return true;
    }
    return hoveredPicture
      ? selection.selectedPictures.includes(hoveredPicture.position)
      : false;
  }

  findSelectedEdge(position: Position): Polygon | null {
    const { state } = this.getContext();
    return findPolygonEdgeNearPosition(
      position,
      state.polygons,
      selectionThresholds.polygonEdge / state.zoom,
      (polygon, edgeIndex) =>
        this.edgeSelectable(polygon, edgeIndex) &&
        this.edgeSelected(polygon, edgeIndex),
    );
  }
}

function isWithinVertexThreshold(
  position: Position,
  vertex: Position,
  zoom: number,
): boolean {
  return (
    Math.hypot(position.x - vertex.x, position.y - vertex.y) <=
    selectionThresholds.vertex / zoom
  );
}
