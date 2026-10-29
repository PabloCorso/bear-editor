import type { EditorState } from "./editor-state";
import type { Position } from "./elma-types";
import { getKuskiSelectionCircles } from "./kuski-geometry";
import { isStartObjectHit } from "./helpers/selection-helpers";
import { buildRideMomentBikeSceneItem } from "./play-mode/scene/play-mode-scene-builder";

/** A session-only point object participating in the regular canvas selection.
 * Optional action handlers are capabilities: unsupported actions skip the item.
 * Session artifacts never enter the level clipboard or serialized level data.
 */
export type SessionArtifact = {
  key: string;
  position: Position;
  selectionCircles: { x: number; y: number; radius: number }[];
  hitTest: (point: Position, useImage: boolean) => boolean;
  move?: (position: Position) => void;
  remove?: () => void;
};

type SessionArtifactProvider = (state: EditorState) => SessionArtifact[];

// Add future session artifact types here; selection and action dispatch stay shared.
const providers: SessionArtifactProvider[] = [
  (state) =>
    state.testStarts.items.map((item) => {
      const coords = item.ride
        ? buildRideMomentBikeSceneItem(item.ride).coords
        : undefined;
      return {
        key: `test-start:${item.id}`,
        position: item.position,
        selectionCircles: getKuskiSelectionCircles({
          start: item.position,
          coords,
        }),
        hitTest: (point, useImage) =>
          isStartObjectHit(
            point,
            item.position,
            useImage ? "boundsWithImage" : "boundsOnly",
            useImage,
            coords,
          ),
        move: (position) => state.actions.moveTestStart(item.id, position),
        remove: () => state.actions.deleteTestStart(item.id),
      };
    }),
];

// A snapshot is immutable. Cache adapters so React selectors and hit testing
// share stable results for the same editor state. Providers may read any session collection.
const artifactCache = new WeakMap<EditorState, SessionArtifact[]>();
const artifactKeys = new WeakMap<Position, string>();

export function getSessionArtifacts(state: EditorState): SessionArtifact[] {
  let artifacts = artifactCache.get(state);
  if (!artifacts) {
    artifacts = providers.flatMap((provide) => provide(state));
    for (const artifact of artifacts)
      artifactKeys.set(artifact.position, artifact.key);
    artifactCache.set(state, artifacts);
  }
  return artifacts;
}

/** Retain identity across immutable position replacements, including history. */
export function getSessionArtifactKey(position: Position) {
  return artifactKeys.get(position);
}

export function findSessionArtifact(state: EditorState, position: Position) {
  const artifacts = getSessionArtifacts(state);
  const key = getSessionArtifactKey(position);
  return artifacts.find((item) =>
    key ? item.key === key : item.position === position,
  );
}
