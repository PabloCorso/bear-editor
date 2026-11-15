import { findSessionArtifact } from "~/editor/session-artifacts";
import type { Apple, Polygon, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";
import {
  isObjectSelected,
  isVertexSelected,
} from "~/editor/helpers/selection-helpers";

import type { SelectToolState } from "./select-tool";

type MutationContext = {
  state: EditorState;
  selection: SelectToolState;
  updateSelection: (patch: Partial<SelectToolState>) => void;
};

export class SelectionMutations {
  constructor(private readonly getContext: () => MutationContext | null) {}

  addVertex(polygon: Polygon, vertex: Position): void {
    const context = this.getContext();
    if (
      !context ||
      isVertexSelected({ polygon, vertex }, context.selection.selectedVertices)
    ) {
      return;
    }
    context.updateSelection({
      selectedVertices: [
        ...context.selection.selectedVertices,
        { polygon, vertex },
      ],
    });
  }

  toggleVertex(polygon: Polygon, vertex: Position): boolean {
    const context = this.getContext();
    if (!context) return false;
    const isSelected = isVertexSelected(
      { polygon, vertex },
      context.selection.selectedVertices,
    );
    context.updateSelection({
      selectedVertices: isSelected
        ? context.selection.selectedVertices.filter(
            (selected) =>
              selected.polygon !== polygon || selected.vertex !== vertex,
          )
        : [...context.selection.selectedVertices, { polygon, vertex }],
    });
    return isSelected;
  }

  addObject(object: Position): void {
    const context = this.getContext();
    if (
      !context ||
      isObjectSelected(object, context.selection.selectedObjects)
    ) {
      return;
    }
    context.updateSelection({
      selectedObjects: [...context.selection.selectedObjects, object],
    });
  }

  toggleObject(object: Position): boolean {
    const context = this.getContext();
    if (!context) return false;
    const isSelected = isObjectSelected(
      object,
      context.selection.selectedObjects,
    );
    context.updateSelection({
      selectedObjects: isSelected
        ? context.selection.selectedObjects.filter(
            (selected) => selected !== object,
          )
        : [...context.selection.selectedObjects, object],
    });
    return isSelected;
  }

  addPicture(picture: Position): void {
    const context = this.getContext();
    if (
      !context ||
      isObjectSelected(picture, context.selection.selectedPictures)
    ) {
      return;
    }
    context.updateSelection({
      selectedPictures: [...context.selection.selectedPictures, picture],
    });
  }

  togglePicture(picture: Position): boolean {
    const context = this.getContext();
    if (!context) return false;
    const isSelected = isObjectSelected(
      picture,
      context.selection.selectedPictures,
    );
    context.updateSelection({
      selectedPictures: isSelected
        ? context.selection.selectedPictures.filter(
            (selected) => selected !== picture,
          )
        : [...context.selection.selectedPictures, picture],
    });
    return isSelected;
  }

  replacePolygon(polygon: Polygon): void {
    const context = this.getContext();
    if (!context) return;
    context.updateSelection({
      selectedVertices: [
        ...context.selection.selectedVertices.filter(
          (selection) => selection.polygon !== polygon,
        ),
        ...polygon.vertices.map((vertex) => ({ polygon, vertex })),
      ],
    });
  }

  togglePolygon(polygon: Polygon): boolean {
    const context = this.getContext();
    if (!context) return false;
    const polygonSelections = context.selection.selectedVertices.filter(
      (selection) => selection.polygon === polygon,
    );
    const isSelected =
      polygonSelections.length === polygon.vertices.length &&
      polygonSelections.length > 0;
    context.updateSelection({
      selectedVertices: isSelected
        ? context.selection.selectedVertices.filter(
            (selection) => selection.polygon !== polygon,
          )
        : [
            ...context.selection.selectedVertices.filter(
              (selection) => selection.polygon !== polygon,
            ),
            ...polygon.vertices.map((vertex) => ({ polygon, vertex })),
          ],
    });
    return isSelected;
  }

  moveVertices(newPositions: Position[]): void {
    const context = this.getContext();
    if (!context) return;
    const { state, selection, updateSelection } = context;
    const polygons = state.polygons.map((polygon) => {
      let changed = false;
      const vertices = polygon.vertices.map((vertex) => {
        const index = selection.selectedVertices.findIndex(
          (selected) =>
            selected.polygon === polygon && selected.vertex === vertex,
        );
        if (index === -1) return vertex;
        changed = true;
        return newPositions[index];
      });
      return changed ? { ...polygon, vertices } : polygon;
    });
    updateSelection({
      selectedVertices: selection.selectedVertices.map((selected, index) => ({
        polygon: polygons[state.polygons.indexOf(selected.polygon)],
        vertex: newPositions[index],
      })),
    });
    state.actions.setPolygons(polygons);
  }

  moveObjects(newPositions: Position[]): void {
    const context = this.getContext();
    if (!context) return;
    const { state, selection, updateSelection } = context;
    let apples: Apple[] | undefined;
    let killers: Position[] | undefined;
    let flowers: Position[] | undefined;
    let start: Position | undefined;
    let hoveredObject = selection.hoveredObject;
    const selectedObjects = [...selection.selectedObjects];

    selection.selectedObjects.forEach((object, index) => {
      const position = newPositions[index];
      const artifact = findSessionArtifact(state, object);
      if (artifact) {
        if (artifact.move) {
          artifact.move(position);
          selectedObjects[index] = position;
          if (selection.hoveredObject === object) hoveredObject = position;
        }
        return;
      }

      const appleIndex = state.apples.findIndex(
        (apple) => apple.position === object,
      );
      if (appleIndex !== -1) {
        apples ??= [...state.apples];
        apples[appleIndex] = { ...state.apples[appleIndex], position };
        selectedObjects[index] = position;
      }
      const killerIndex = state.killers.indexOf(object);
      if (killerIndex !== -1) {
        killers ??= [...state.killers];
        killers[killerIndex] = position;
        selectedObjects[index] = position;
      }
      const flowerIndex = state.flowers.indexOf(object);
      if (flowerIndex !== -1) {
        flowers ??= [...state.flowers];
        flowers[flowerIndex] = position;
        selectedObjects[index] = position;
      }
      if (object === state.start) {
        start = position;
        selectedObjects[index] = position;
        if (selection.hoveredObject === object) hoveredObject = position;
      }
    });

    if (apples) state.actions.setApples(apples);
    if (killers) state.actions.setKillers(killers);
    if (flowers) state.actions.setFlowers(flowers);
    if (start) state.actions.setStart(start);
    updateSelection({ selectedObjects, hoveredObject });
  }

  movePictures(newPositions: Position[]): void {
    const context = this.getContext();
    if (!context) return;
    const { state, selection, updateSelection } = context;
    const pictures = [...state.pictures];
    const selectedPictures: Position[] = [];
    const handled = new Set<number>();

    selection.selectedPictures.forEach((picture, index) => {
      const pictureIndex = pictures.findIndex(
        (candidate) => candidate.position === picture,
      );
      if (pictureIndex === -1 || handled.has(pictureIndex)) return;
      const position = newPositions[index];
      pictures[pictureIndex] = { ...pictures[pictureIndex], position };
      handled.add(pictureIndex);
      selectedPictures.push(position);
    });

    state.actions.setPictures(pictures);
    updateSelection({ selectedPictures });
  }

  deleteSelection(): void {
    const context = this.getContext();
    if (!context) return;
    const { state, selection } = context;
    const verticesByPolygon = new Map<number, Position[]>();
    for (const { polygon, vertex } of selection.selectedVertices) {
      const index = state.polygons.indexOf(polygon);
      if (index === -1) continue;
      const vertices = verticesByPolygon.get(index) ?? [];
      vertices.push(vertex);
      verticesByPolygon.set(index, vertices);
    }

    const polygons = [...state.polygons];
    for (const index of [...verticesByPolygon.keys()].sort((a, b) => b - a)) {
      const polygon = polygons[index];
      if (!polygon) continue;
      const removed = verticesByPolygon.get(index)!;
      const vertices = polygon.vertices.filter(
        (vertex) => !removed.includes(vertex),
      );
      if (vertices.length < 3) polygons.splice(index, 1);
      else polygons[index] = { ...polygon, vertices };
    }
    if (verticesByPolygon.size) state.actions.setPolygons(polygons);

    for (const object of selection.selectedObjects) {
      const artifact = findSessionArtifact(state, object);
      if (artifact) {
        artifact.remove?.();
        continue;
      }
      const apple = state.apples.find((entry) => entry.position === object);
      if (apple) state.actions.removeApple(apple);
      else if (state.killers.includes(object))
        state.actions.removeKiller(object);
      else if (state.flowers.includes(object))
        state.actions.removeFlower(object);
    }
    for (const position of selection.selectedPictures) {
      const picture = state.pictures.find(
        (entry) => entry.position === position,
      );
      if (picture) state.actions.removePicture(picture);
    }
  }
}
