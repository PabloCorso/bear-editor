import {
  findSessionArtifact,
  getSessionArtifacts,
} from "~/editor/session-artifacts";
import type { Picture, Polygon, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";
import {
  circleIntersectsLasso,
  isPointInLasso,
  rectIntersectsLasso,
} from "~/editor/helpers/lasso-selection";
import {
  getAllObjects,
  getSelectionBounds,
  isPointInRect,
} from "~/editor/helpers/selection-helpers";
import { getKuskiSelectionCircles } from "~/editor/kuski-geometry";
import { getObjectBoundsRadius } from "~/editor/render/object-assets";
import { rectsIntersect, type WorldRect } from "~/editor/render/world-geometry";

import type { SelectToolState } from "./select-tool";

export type PictureDimensionsResolver = (picture: {
  name?: string;
  texture?: string;
  mask?: string;
}) => { width: number; height: number } | null;

type AreaSelectionOptions = {
  state: EditorState;
  start: Position;
  end: Position;
  lassoPath: Position[] | null;
  pictureDimensions: PictureDimensionsResolver;
  polygonsSelectable: boolean;
  objectsSelectable: boolean;
  pictureSelectable: (picture: Picture) => boolean;
};

export function findAreaSelection({
  state,
  start,
  end,
  lassoPath,
  pictureDimensions,
  polygonsSelectable,
  objectsSelectable,
  pictureSelectable,
}: AreaSelectionOptions): Pick<
  SelectToolState,
  "selectedVertices" | "selectedObjects" | "selectedPictures"
> {
  const bounds = getSelectionBounds(start, end);
  const selectedVertices: Array<{ polygon: Polygon; vertex: Position }> = [];
  const selectedObjects: Position[] = [];
  const selectedPictures: Position[] = [];

  if (polygonsSelectable) {
    for (const polygon of state.polygons) {
      for (const vertex of polygon.vertices) {
        if (
          lassoPath
            ? isPointInLasso(vertex, lassoPath)
            : isPointInRect(vertex, bounds)
        ) {
          selectedVertices.push({ polygon, vertex });
        }
      }
    }
  }

  if (objectsSelectable) {
    const objects = getAllObjects(
      state.apples.map((apple) => apple.position),
      state.killers,
      state.flowers,
      state.start,
    );
    for (const { obj } of objects) {
      if (
        lassoPath
          ? objectIntersectsLasso(state, obj, lassoPath)
          : objectIntersectsRect(state, obj, bounds)
      ) {
        selectedObjects.push(obj);
      }
    }
  }

  for (const artifact of getSessionArtifacts(state)) {
    if (
      artifact.intersectsRect?.(bounds) ??
      objectIntersectsRect(state, artifact.position, bounds)
    ) {
      selectedObjects.push(artifact.position);
    }
  }

  for (const picture of state.pictures.filter(pictureSelectable)) {
    if (
      lassoPath
        ? pictureIntersectsLasso(picture, lassoPath, pictureDimensions)
        : pictureIntersectsRect(state, picture, bounds, pictureDimensions)
    ) {
      selectedPictures.push(picture.position);
    }
  }

  return { selectedVertices, selectedObjects, selectedPictures };
}

function objectIntersectsLasso(
  state: EditorState,
  object: Position,
  path: Position[],
): boolean {
  if (object === state.start || findSessionArtifact(state, object)) {
    return getObjectSelectionCircles(state, object).some((circle) =>
      circleIntersectsLasso(circle, circle.radius, path),
    );
  }
  return circleIntersectsLasso(object, getObjectBoundsRadius(), path);
}

function objectIntersectsRect(
  state: EditorState,
  object: Position,
  bounds: WorldRect,
): boolean {
  const artifact = findSessionArtifact(state, object);
  if (artifact?.intersectsRect) return artifact.intersectsRect(bounds);
  if (object === state.start || artifact) {
    return getObjectSelectionCircles(state, object).some((circle) =>
      circleIntersectsRect(circle, circle.radius, bounds),
    );
  }
  return circleIntersectsRect(object, getObjectBoundsRadius(), bounds);
}

function getObjectSelectionCircles(state: EditorState, position: Position) {
  return (
    findSessionArtifact(state, position)?.selectionCircles ??
    getKuskiSelectionCircles({ start: position })
  );
}

function pictureIntersectsLasso(
  picture: Picture,
  path: Position[],
  resolveDimensions: PictureDimensionsResolver,
): boolean {
  const dimensions = resolveDimensions(picture);
  return dimensions
    ? rectIntersectsLasso(
        {
          minX: picture.position.x,
          minY: picture.position.y,
          maxX: picture.position.x + dimensions.width,
          maxY: picture.position.y + dimensions.height,
        },
        path,
      )
    : isPointInLasso(picture.position, path);
}

function pictureIntersectsRect(
  state: EditorState,
  picture: Picture,
  bounds: WorldRect,
  resolveDimensions: PictureDimensionsResolver,
): boolean {
  if (state.pictureSelection.area === "anchor") {
    return isPointInRect(picture.position, bounds);
  }
  const dimensions = resolveDimensions({
    name: picture.name || undefined,
    texture: picture.texture || undefined,
    mask: picture.mask || undefined,
  });
  return dimensions
    ? rectsIntersect(
        {
          minX: picture.position.x,
          minY: picture.position.y,
          maxX: picture.position.x + dimensions.width,
          maxY: picture.position.y + dimensions.height,
        },
        bounds,
      )
    : isPointInRect(picture.position, bounds);
}

function circleIntersectsRect(
  center: Position,
  radius: number,
  rect: WorldRect,
): boolean {
  const closestX = Math.max(rect.minX, Math.min(center.x, rect.maxX));
  const closestY = Math.max(rect.minY, Math.min(center.y, rect.maxY));
  const dx = center.x - closestX;
  const dy = center.y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}
