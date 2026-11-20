import type { EditorStore } from "../editor-store";
import type { Participant } from "./types";

// A sampled view, independent of the shared document and the physics engine.
// The presence loop sends at most ten updates per second.
const views = new WeakMap<EditorStore, Participant["camera"]>();
export function setRideView(store: EditorStore, view?: Participant["camera"]) {
  if (view) views.set(store, view);
  else views.delete(store);
}
export function getRideView(store: EditorStore) {
  return views.get(store);
}
