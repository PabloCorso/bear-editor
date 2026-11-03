import type { Position } from "~/editor/elma-types";

import type { SelectToolState } from "./select-tool";

export function getSelectionDragOrigins(
  selection: SelectToolState,
): Position[] {
  return [
    ...selection.selectedVertices.map(({ vertex }) => ({ ...vertex })),
    ...selection.selectedObjects.map((object) => ({ ...object })),
    ...selection.selectedPictures.map((picture) => ({ ...picture })),
  ];
}

export function getVertexDragConstraintDirections(
  selection: SelectToolState["selectedVertices"],
): Position[] {
  const directions: Position[] = [];
  for (const { polygon, vertex } of selection) {
    const index = polygon.vertices.indexOf(vertex);
    if (index === -1) continue;
    const count = polygon.vertices.length;
    addDirection(
      directions,
      normalizedDirection(
        polygon.vertices[(index - 1 + count) % count],
        polygon.vertices[index],
      ),
    );
    addDirection(
      directions,
      normalizedDirection(
        polygon.vertices[index],
        polygon.vertices[(index + 1) % count],
      ),
    );
  }
  return directions;
}

export function calculateSelectionDrag({
  selection,
  origins,
  start,
  current,
  constraintDirections,
  constrain,
  snap,
}: {
  selection: SelectToolState;
  origins: Position[];
  start: Position;
  current: Position;
  constraintDirections: Position[];
  constrain: boolean;
  snap: (anchor: Position, delta: Position) => Position;
}): {
  vertices: Position[];
  objects: Position[];
  pictures: Position[];
} {
  const rawDelta = { x: current.x - start.x, y: current.y - start.y };
  const delta =
    constrain && selection.selectedVertices.length
      ? constrainDelta(rawDelta, constraintDirections)
      : origins[0]
        ? snap(origins[0], rawDelta)
        : rawDelta;
  const translated = origins.map((origin) => ({
    x: origin.x + delta.x,
    y: origin.y + delta.y,
  }));
  const vertexCount = selection.selectedVertices.length;
  const objectCount = selection.selectedObjects.length;
  return {
    vertices: translated.slice(0, vertexCount),
    objects: translated.slice(vertexCount, vertexCount + objectCount),
    pictures: translated.slice(vertexCount + objectCount),
  };
}

function addDirection(
  directions: Position[],
  direction: Position | null,
): void {
  if (
    direction &&
    !directions.some(
      (candidate) =>
        Math.abs(candidate.x * direction.x + candidate.y * direction.y) > 0.999,
    )
  ) {
    directions.push(direction);
  }
}

function normalizedDirection(
  from: Position | undefined,
  to: Position | undefined,
): Position | null {
  if (!from || !to) return null;
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.hypot(x, y);
  return length ? { x: x / length, y: y / length } : null;
}

function constrainDelta(delta: Position, directions: Position[]): Position {
  if (!directions.length) return delta;
  let best = directions[0];
  let projection = delta.x * best.x + delta.y * best.y;
  for (const direction of directions.slice(1)) {
    const candidate = delta.x * direction.x + delta.y * direction.y;
    if (Math.abs(candidate) > Math.abs(projection)) {
      best = direction;
      projection = candidate;
    }
  }
  return { x: best.x * projection, y: best.y * projection };
}
