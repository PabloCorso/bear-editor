import { rebindSelectedVertices } from "../edit-mode/tools/selection-identity";
import { getSessionArtifacts, findSessionArtifact } from "../session-artifacts";
import fastDeepEqual from "fast-deep-equal";
import type { EditorState } from "../editor-state";
import type { StoreApi } from "zustand";
import type { SelectToolState } from "../edit-mode/tools/select-tool";
import { createTransactionHistory } from "./transaction-history";

/** Selection references belong to the exact immutable content in this snapshot.
 * No coordinate matching or parallel history stack is needed, even for overlaps.
 */
type HistorySelection = Pick<
  SelectToolState,
  "selectedVertices" | "selectedObjects" | "selectedPictures"
>;
export type HistoryContent = Pick<
  EditorState,
  | "levelName"
  | "lgr"
  | "ground"
  | "sky"
  | "polygons"
  | "apples"
  | "killers"
  | "flowers"
  | "start"
  | "pictures"
  | "top10"
  | "testStarts"
  | "referenceImages"
>;
export type EditorHistorySnapshot = {
  content: HistoryContent;
  selection: HistorySelection;
};

export function createEditorHistory(
  store: StoreApi<EditorState>,
  limit?: number,
) {
  const bitmaps = new Set<ImageBitmap>();
  return createTransactionHistory<EditorHistorySnapshot>({
    limit,
    capture: () => {
      const state = store.getState();
      const selection = state.toolState.select as SelectToolState | undefined;
      const content: HistoryContent = {
        levelName: state.levelName,
        lgr: state.lgr,
        ground: state.ground,
        sky: state.sky,
        polygons: state.polygons,
        apples: state.apples,
        killers: state.killers,
        flowers: state.flowers,
        start: state.start,
        pictures: state.pictures,
        top10: state.top10,
        testStarts: state.testStarts,
        referenceImages: state.referenceImages,
      };
      state.referenceImages.forEach((image) => bitmaps.add(image.bitmap));
      const objects = new Set([
        state.start,
        ...state.apples.map((apple) => apple.position),
        ...state.killers,
        ...state.flowers,
        ...getSessionArtifacts(state).map((artifact) => artifact.position),
      ]);
      const pictures = new Set(
        state.pictures.map((picture) => picture.position),
      );
      return {
        content,
        selection: {
          selectedVertices: rebindSelectedVertices(
            state.polygons,
            selection?.selectedVertices ?? [],
          ),
          selectedObjects: (selection?.selectedObjects ?? []).flatMap(
            (position) => {
              const current = objects.has(position)
                ? position
                : findSessionArtifact(state, position)?.position;
              return current ? [current] : [];
            },
          ),
          selectedPictures: (selection?.selectedPictures ?? []).filter(
            (position) => pictures.has(position),
          ),
        },
      };
    },
    equal: (a, b) =>
      fastDeepEqual(a.content, b.content) &&
      a.content.referenceImages.every(
        (image, index) =>
          image.bitmap === b.content.referenceImages[index]?.bitmap,
      ),
    restore: ({ content, selection }) => {
      store.setState((state) => ({
        ...content,
        testStartMenu: null,
        testStartRename: null,
        topologyInspection: null,
        toolState: {
          ...state.toolState,
          select: {
            ...(state.toolState.select as SelectToolState | undefined),
            ...selection,
            isDragging: false,
            isMarqueeSelecting: false,
            transformMode: false,
            skewMode: false,
            hoveredObject: undefined,
            hoveredPictureBounds: undefined,
            contextMenuType: undefined,
            contextMenuPosition: undefined,
          },
        },
      }));
    },
    prepareRestore: () =>
      store.getState().actions.getActiveTool()?.cancelInteraction(),
    // Bitmaps remain alive while the canvas, an entry, or an active edit needs them.
    retain: (snapshots) => {
      const retained = new Set(
        snapshots.flatMap(({ content }) =>
          content.referenceImages.map((image) => image.bitmap),
        ),
      );
      for (const bitmap of bitmaps) {
        if (!retained.has(bitmap)) {
          bitmap.close();
          bitmaps.delete(bitmap);
        }
      }
    },
  });
}
export type EditorHistory = ReturnType<typeof createEditorHistory>;
