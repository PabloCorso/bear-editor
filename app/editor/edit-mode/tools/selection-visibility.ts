import {
  findSessionArtifact,
  getSessionArtifactKey,
  getSessionArtifacts,
} from "~/editor/session-artifacts";
import type { Picture, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";
import { getAllObjects } from "~/editor/helpers/selection-helpers";

import type { SelectToolState } from "./select-tool";

export type SelectSelectionKind =
  | "groundVertices"
  | "grassVertices"
  | "apples"
  | "killers"
  | "flowers"
  | "start"
  | "sessionArtifacts"
  | "referenceImages"
  | "pictures"
  | "textures";

export type SelectionSnapshot = Pick<
  SelectToolState,
  "selectedVertices" | "selectedObjects" | "selectedPictures"
>;

export class SelectionVisibility {
  constructor(private readonly state: EditorState) {}

  polygonsSelectable(): boolean {
    const {
      showPolygons,
      showGroundBounds,
      showGrassBounds,
      showPolygonHandles,
    } = this.state.levelVisibility;
    return (
      showPolygons || showGroundBounds || showGrassBounds || showPolygonHandles
    );
  }

  objectsSelectable(): boolean {
    const { showObjects, showObjectBounds } = this.state.levelVisibility;
    return showObjects || showObjectBounds;
  }

  pictureSelectable(picture: { texture?: string; mask?: string }): boolean {
    const { showPictureBounds, showTextureBounds, showPictures, showTextures } =
      this.state.levelVisibility;
    const hasTexture = Boolean(picture.texture && picture.mask);
    return hasTexture
      ? showTextures || showTextureBounds
      : showPictures || showPictureBounds;
  }

  objectPresent(object: Position): boolean {
    return (
      Boolean(findSessionArtifact(this.state, object)) ||
      this.state.start === object ||
      this.state.killers.includes(object) ||
      this.state.flowers.includes(object) ||
      this.state.apples.some((apple) => apple.position === object)
    );
  }

  hasLevelObjects(): boolean {
    return Boolean(
      this.state.apples.length ||
      this.state.killers.length ||
      this.state.flowers.length ||
      this.state.start,
    );
  }

  filterKinds(
    kinds: ReadonlySet<SelectSelectionKind>,
    source: SelectionSnapshot,
  ): SelectionSnapshot | null {
    const selectedVertices = source.selectedVertices.filter(({ polygon }) =>
      kinds.has(polygon.grass ? "grassVertices" : "groundVertices"),
    );
    const selectedObjects = source.selectedObjects.filter((object) => {
      const artifact = findSessionArtifact(this.state, object);
      if (artifact?.kind === "referenceImage")
        return kinds.has("referenceImages");
      if (artifact) return kinds.has("sessionArtifacts");
      if (object === this.state.start) return kinds.has("start");
      if (this.state.apples.some((apple) => apple.position === object))
        return kinds.has("apples");
      if (this.state.killers.includes(object)) return kinds.has("killers");
      if (this.state.flowers.includes(object)) return kinds.has("flowers");
      return false;
    });
    const selectedPictures = source.selectedPictures.filter((position) => {
      if (!kinds.has("pictures") && !kinds.has("textures")) return false;
      const picture =
        this.state.pictures.find((entry) => entry.position === position) ??
        this.state.pictures.find(
          (entry) =>
            entry.position.x === position.x && entry.position.y === position.y,
        );
      return Boolean(
        picture &&
        ((kinds.has("pictures") && picture.name) ||
          (kinds.has("textures") && picture.texture)),
      );
    });
    return selectedVertices.length ||
      selectedObjects.length ||
      selectedPictures.length
      ? { selectedVertices, selectedObjects, selectedPictures }
      : null;
  }

  selectAll(pictureFilter: (picture: Picture) => boolean): SelectionSnapshot {
    return {
      selectedVertices: this.polygonsSelectable()
        ? this.state.polygons.flatMap((polygon) =>
            polygon.vertices.map((vertex) => ({ polygon, vertex })),
          )
        : [],
      selectedObjects: [
        ...(this.objectsSelectable()
          ? getAllObjects(
              this.state.apples.map((apple) => apple.position),
              this.state.killers,
              this.state.flowers,
              this.state.start,
            ).map(({ obj }) => obj)
          : []),
        ...getSessionArtifacts(this.state).map((item) => item.position),
      ],
      selectedPictures: this.state.pictures
        .filter(
          (picture) =>
            this.pictureSelectable(picture) && pictureFilter(picture),
        )
        .map((picture) => picture.position),
    };
  }

  reconcile(selection: SelectionSnapshot): SelectionSnapshot | null {
    const verticesByPosition = new Map<
      string,
      SelectToolState["selectedVertices"]
    >();
    for (const polygon of this.state.polygons) {
      for (const vertex of polygon.vertices) {
        const key = `${vertex.x}:${vertex.y}`;
        const matches = verticesByPosition.get(key) ?? [];
        matches.push({ polygon, vertex });
        verticesByPosition.set(key, matches);
      }
    }
    const consumed = new Set<Position>();
    const selectedVertices = this.polygonsSelectable()
      ? selection.selectedVertices
          .map((selected) => {
            if (
              this.state.polygons.includes(selected.polygon) &&
              selected.polygon.vertices.includes(selected.vertex) &&
              !consumed.has(selected.vertex)
            ) {
              consumed.add(selected.vertex);
              return selected;
            }
            const matches =
              verticesByPosition.get(
                `${selected.vertex.x}:${selected.vertex.y}`,
              ) ?? [];
            const match = matches.find(({ vertex }) => !consumed.has(vertex));
            if (match) consumed.add(match.vertex);
            return match ?? null;
          })
          .filter((selected): selected is NonNullable<typeof selected> =>
            Boolean(selected),
          )
      : [];
    const selectedObjects = selection.selectedObjects
      .map((object) => this.reconcileObject(object))
      .filter((object): object is Position => object !== null);
    const selectedPictures = selection.selectedPictures
      .map((position) => {
        const picture = this.state.pictures.find(
          (entry) =>
            entry.position.x === position.x && entry.position.y === position.y,
        );
        return picture && this.pictureSelectable(picture)
          ? picture.position
          : null;
      })
      .filter((position): position is Position => position !== null);
    const result = { selectedVertices, selectedObjects, selectedPictures };
    return selectionChanged(selection, result) ? result : null;
  }

  private reconcileObject(object: Position): Position | null {
    const artifact = findSessionArtifact(this.state, object);
    if (artifact) return artifact.position;
    if (!this.objectsSelectable()) return null;
    if (
      this.state.start === object ||
      this.state.apples.some((apple) => apple.position === object) ||
      this.state.killers.includes(object) ||
      this.state.flowers.includes(object)
    ) {
      return object;
    }
    if (getSessionArtifactKey(object)) return null;
    const matches = (candidate: Position) =>
      candidate.x === object.x && candidate.y === object.y;
    return (
      this.state.apples.find((apple) => matches(apple.position))?.position ??
      this.state.killers.find(matches) ??
      this.state.flowers.find(matches) ??
      (matches(this.state.start) ? this.state.start : null)
    );
  }
}

function selectionChanged(
  before: SelectionSnapshot,
  after: SelectionSnapshot,
): boolean {
  return (
    before.selectedVertices.length !== after.selectedVertices.length ||
    before.selectedObjects.length !== after.selectedObjects.length ||
    before.selectedPictures.length !== after.selectedPictures.length ||
    after.selectedVertices.some((selected, index) => {
      const previous = before.selectedVertices[index];
      return (
        previous?.polygon !== selected.polygon ||
        previous?.vertex !== selected.vertex
      );
    }) ||
    after.selectedObjects.some(
      (object, index) => object !== before.selectedObjects[index],
    ) ||
    after.selectedPictures.some(
      (position, index) => position !== before.selectedPictures[index],
    )
  );
}
