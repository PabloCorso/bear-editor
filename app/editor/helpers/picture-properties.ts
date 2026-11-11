import { Clip } from "~/editor/elma-types";

export const MIN_PICTURE_DISTANCE = 0;
export const MAX_PICTURE_DISTANCE = 999;
export const PICTURE_DISTANCE_STEP = 10;
export const pictureClipOptions = [
  { value: Clip.Sky, label: "Sky" },
  { value: Clip.Ground, label: "Ground" },
  { value: Clip.Unclipped, label: "Unclipped" },
] as const;

export function normalizeDistance(distance: number) {
  if (!Number.isFinite(distance)) return MAX_PICTURE_DISTANCE;
  return Math.min(
    MAX_PICTURE_DISTANCE,
    Math.max(MIN_PICTURE_DISTANCE, Math.round(distance)),
  );
}

export function nextPictureClip(clip: Clip) {
  const index = pictureClipOptions.findIndex((option) => option.value === clip);
  return pictureClipOptions[(index + 1) % pictureClipOptions.length].value;
}
