import type { Picture, Position } from "~/editor/elma-types";

const MIN_DISTANCE = 0;
const MAX_DISTANCE = 999;

export type ArrangeSelectionDirection =
  | "forward"
  | "front"
  | "backward"
  | "back";

export function arrangeSelectedPictures(
  pictures: Picture[],
  selectedPositions: Position[],
  direction: ArrangeSelectionDirection,
  occupiedDistances: number[] = [],
): Picture[] | null {
  const selectedIndexes = getSelectedPictureIndexes(
    pictures,
    selectedPositions,
  );
  if (!selectedIndexes.length) return null;
  const selectedDistances = selectedIndexes.map(
    (index) => pictures[index].distance,
  );
  const minimum = Math.min(...selectedDistances);
  const maximum = Math.max(...selectedDistances);
  const otherDistances = [
    ...pictures
      .filter((_picture, index) => !selectedIndexes.includes(index))
      .map((picture) => picture.distance),
    ...occupiedDistances,
  ];
  const delta = getDistanceDelta(direction, minimum, maximum, otherDistances);
  if (delta === 0) return null;
  return pictures.map((picture, index) =>
    selectedIndexes.includes(index)
      ? { ...picture, distance: clampDistance(picture.distance + delta) }
      : picture,
  );
}

function getSelectedPictureIndexes(
  pictures: Picture[],
  selectedPositions: Position[],
): number[] {
  const handled = new Set<number>();
  return selectedPositions
    .map((position) => {
      const index = pictures.findIndex(
        (picture, candidate) =>
          !handled.has(candidate) && picture.position === position,
      );
      if (index === -1) return null;
      handled.add(index);
      return index;
    })
    .filter((index): index is number => index !== null);
}

function getDistanceDelta(
  direction: ArrangeSelectionDirection,
  minimum: number,
  maximum: number,
  otherDistances: number[],
): number {
  if (direction === "front") return MIN_DISTANCE - minimum;
  if (direction === "back") return MAX_DISTANCE - maximum;
  if (direction === "forward") {
    const nearest = Math.max(
      ...otherDistances.filter((distance) => distance < minimum),
    );
    return Number.isFinite(nearest)
      ? nearest - minimum - 1
      : MIN_DISTANCE - minimum;
  }
  const nearest = Math.min(
    ...otherDistances.filter((distance) => distance > maximum),
  );
  return Number.isFinite(nearest)
    ? nearest - maximum + 1
    : MAX_DISTANCE - maximum;
}

function clampDistance(distance: number): number {
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, Math.round(distance)));
}
