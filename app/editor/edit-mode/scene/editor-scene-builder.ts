import { DRAFT_PREVIEW_OPACITY, uiStrokeWidths } from "~/editor/constants";
import type { EditorState } from "~/editor/editor-state";
import { Clip, type Picture } from "~/editor/elma-types";
import type { SelectToolState } from "~/editor/edit-mode/tools/select-tool";
import type { VertexToolState } from "~/editor/edit-mode/tools/vertex-tool";
import {
  type EditorHoverableWorldItem,
  type EditorWorldDrawItem,
  type EditorWorldScene,
} from "./editor-scene";
import { DEFAULT_OBJECT_RENDER_DISTANCE } from "~/editor/render/render-constants";
import type { WorldRect } from "~/editor/render/world-geometry";
import {
  getCachedPolygonDerivedData,
  isPictureVisible,
  isPointVisible,
  isPolygonVisible,
} from "~/editor/render/world-derived-data-cache";

const DEFAULT_DISTANCE_AND_CLIP = {
  distance: DEFAULT_OBJECT_RENDER_DISTANCE,
  clip: Clip.Unclipped,
} as const;

export function buildEditorWorldScene({
  state,
  viewportRect,
  resolvePictureDimensions,
}: {
  state: EditorState;
  viewportRect: WorldRect;
  resolvePictureDimensions?: (picture: {
    name?: string;
    texture?: string;
    mask?: string;
  }) => { width: number; height: number } | null;
}): EditorWorldScene {
  const scenePolygons = getScenePolygons(state);

  return {
    clearColor: "#1a1a2e",
    ground: state.ground,
    sky: state.sky,
    animateSprites: state.animateSprites,
    groundClipMode: "when-polygons-visible",
    visibility: {
      useGroundSkyTextures: state.levelVisibility.useGroundSkyTextures,
      showObjectAnimations: state.levelVisibility.showObjectAnimations,
      showObjects: state.levelVisibility.showObjects,
      showPictures: state.levelVisibility.showPictures,
      showTextures: state.levelVisibility.showTextures,
      showPolygons: state.levelVisibility.showPolygons,
      showPolygonBounds: state.levelVisibility.showPolygonBounds,
    },
    viewport: {
      rect: viewportRect,
      zoom: state.zoom,
    },
    polygons: scenePolygons
      .filter((polygon) => isPolygonVisible(polygon, viewportRect))
      .map((polygon) => {
        const { grassEdgeIndices } = getCachedPolygonDerivedData(polygon);
        return {
          vertices: polygon.vertices,
          isGrass: Boolean(polygon.grass),
          grassEdgeIndices,
        };
      }),
    drawItems: getDrawItemQueue(state, viewportRect, resolvePictureDimensions),
  };
}

export function getEditorHoverableItems(
  state: EditorState,
): EditorHoverableWorldItem[] {
  const items = getDrawItemQueue(state);
  return items.map((item) => {
    if (item.type === "picture") {
      return {
        kind: "picture",
        picture: {
          clip: item.clip,
          distance: item.distance,
          mask: item.mask ?? "",
          name: item.name ?? "",
          position: item.position,
          texture: item.texture ?? "",
        } as Picture,
      };
    }

    return {
      kind: "object",
      type: item.type === "start" ? "start" : item.objectKind,
      position: item.position,
    };
  });
}

function getDrawItemQueue(
  state: EditorState,
  viewportRect?: WorldRect,
  resolvePictureDimensions?: (picture: {
    name?: string;
    texture?: string;
    mask?: string;
  }) => { width: number; height: number } | null,
): EditorWorldDrawItem[] {
  const activeTool = state.actions.getActiveTool();
  const drafts = activeTool?.getDrafts?.() ?? {};
  const selectState = state.actions.getToolState<SelectToolState>("select");
  const {
    showObjects,
    showPictures,
    showTextures,
    showObjectBounds,
    showPictureBounds,
    showTextureBounds,
  } = state.levelVisibility;
  const showAnyObjects = showObjects || showObjectBounds;
  const showAnyPictures =
    showPictures || showTextures || showPictureBounds || showTextureBounds;
  const idleBoundsLineWidth = uiStrokeWidths.boundsIdleScreen / state.zoom;
  const selectedBoundsLineWidth =
    uiStrokeWidths.boundsSelectedScreen / state.zoom;

  return [
    ...(showAnyPictures
      ? state.pictures
          .filter((picture) =>
            !viewportRect ||
            isPictureVisible(picture, viewportRect, resolvePictureDimensions),
          )
          .map((picture) => ({
            type: "picture" as const,
            name: picture.name || undefined,
            texture: picture.texture || undefined,
            mask: picture.mask || undefined,
            position: picture.position,
            distance: picture.distance,
            clip: picture.clip,
            showBounds:
              showPictureBounds || (Boolean(picture.texture) && showTextureBounds),
            boundsLineWidth: idleBoundsLineWidth,
          }))
      : []),
    ...(drafts.pictures ?? []).map((picture) => ({
      type: "picture" as const,
      name: picture.name || undefined,
      texture: picture.texture || undefined,
      mask: picture.mask || undefined,
      position: picture.position,
      distance: picture.distance,
      clip: picture.clip,
      draft: true,
      opacity: DRAFT_PREVIEW_OPACITY,
      showBounds: true,
      boundsLineWidth: idleBoundsLineWidth,
      forceVisible: true,
    })),
    ...(showAnyObjects
      ? state.killers
          .filter((killer) => !viewportRect || isPointVisible(killer, viewportRect))
          .map((killer) => {
          const isSelected = isSelectedObject(selectState, killer);
          return {
            type: "object" as const,
            objectKind: "killer" as const,
            ...DEFAULT_DISTANCE_AND_CLIP,
            position: killer,
            showBounds: showObjectBounds || isSelected,
            boundsLineWidth: isSelected
              ? selectedBoundsLineWidth
              : idleBoundsLineWidth,
          };
          })
      : []),
    ...(drafts.killers ?? []).map((killer) => ({
      type: "object" as const,
      objectKind: "killer" as const,
      ...DEFAULT_DISTANCE_AND_CLIP,
      position: killer,
      opacity: DRAFT_PREVIEW_OPACITY,
      forceVisible: true,
      showBounds: showObjectBounds,
      boundsLineWidth: idleBoundsLineWidth,
    })),
    ...(showAnyObjects
      ? state.apples
          .filter(
            (apple) => !viewportRect || isPointVisible(apple.position, viewportRect),
          )
          .map((apple) => {
          const isSelected = isSelectedObject(selectState, apple.position);
          return {
            type: "object" as const,
            objectKind: "apple" as const,
            ...DEFAULT_DISTANCE_AND_CLIP,
            position: apple.position,
            animation: apple.animation,
            gravity: apple.gravity,
            showBounds: showObjectBounds || isSelected,
            boundsLineWidth: isSelected
              ? selectedBoundsLineWidth
              : idleBoundsLineWidth,
          };
          })
      : []),
    ...(drafts.apples ?? []).map((apple) => ({
      type: "object" as const,
      objectKind: "apple" as const,
      ...DEFAULT_DISTANCE_AND_CLIP,
      position: apple.position,
      animation: apple.animation,
      gravity: apple.gravity,
      opacity: DRAFT_PREVIEW_OPACITY,
      forceVisible: true,
      showBounds: showObjectBounds,
      boundsLineWidth: idleBoundsLineWidth,
    })),
    ...(showAnyObjects
      ? state.flowers
          .filter((flower) => !viewportRect || isPointVisible(flower, viewportRect))
          .map((flower) => {
          const isSelected = isSelectedObject(selectState, flower);
          return {
            type: "object" as const,
            objectKind: "flower" as const,
            ...DEFAULT_DISTANCE_AND_CLIP,
            position: flower,
            showBounds: showObjectBounds || isSelected,
            boundsLineWidth: isSelected
              ? selectedBoundsLineWidth
              : idleBoundsLineWidth,
          };
          })
      : []),
    ...(drafts.flowers ?? []).map((flower) => ({
      type: "object" as const,
      objectKind: "flower" as const,
      ...DEFAULT_DISTANCE_AND_CLIP,
      position: flower,
      opacity: DRAFT_PREVIEW_OPACITY,
      forceVisible: true,
      showBounds: showObjectBounds,
      boundsLineWidth: idleBoundsLineWidth,
    })),
    ...(showAnyObjects
      && (!viewportRect || isPointVisible(state.start, viewportRect))
      ? [
          (() => {
            const isSelected = isSelectedObject(selectState, state.start);
            return {
              type: "start" as const,
              ...DEFAULT_DISTANCE_AND_CLIP,
              position: state.start,
              showBounds: showObjectBounds || isSelected,
              boundsLineWidth: isSelected
                ? selectedBoundsLineWidth
                : idleBoundsLineWidth,
            };
          })(),
        ]
      : []),
  ].sort((a, b) => b.distance - a.distance);
}

function getScenePolygons(state: EditorState) {
  const activeTool = state.actions.getActiveTool();
  const draftPolygons = activeTool?.getDrafts?.()?.polygons || [];
  const vertexToolState = state.actions.getToolState<VertexToolState>("vertex");
  const scenePolygons = vertexToolState?.editingPolygon
    ? state.polygons.filter(
        (polygon) => polygon !== vertexToolState.editingPolygon,
      )
    : state.polygons;
  return [...scenePolygons, ...draftPolygons];
}

function isSelectedObject(
  selectState: SelectToolState | undefined,
  position: { x: number; y: number },
) {
  return (selectState?.selectedObjects ?? []).some(
    (selected) => selected.x === position.x && selected.y === position.y,
  );
}
