import type { Polygon, Position } from "~/editor/elma-types";

import type { SelectToolState } from "./select-tool";

export function isPolygonEdgeSelectable(
  polygon: Polygon,
  edgeIndex: number,
  selection: SelectToolState["selectedVertices"],
): boolean {
  const selectedCount = selection.filter(
    (selected) => selected.polygon === polygon,
  ).length;
  if (selectedCount === polygon.vertices.length && selectedCount > 0)
    return true;
  if (!polygon.grass) return true;
  if (polygon.vertices.length < 2) return false;
  return edgeIndex !== findLongestPolygonEdgeIndex(polygon);
}

export function isPolygonEdgeSelected(
  polygon: Polygon,
  edgeIndex: number,
  selection: SelectToolState["selectedVertices"] | ReadonlySet<Position>,
): boolean {
  if (polygon.vertices.length < 2) return false;
  const start = polygon.vertices[edgeIndex];
  const end = polygon.vertices[(edgeIndex + 1) % polygon.vertices.length];
  if (isPositionSet(selection))
    return selection.has(start) && selection.has(end);
  return (
    selection.some(
      (selected) => selected.polygon === polygon && selected.vertex === start,
    ) &&
    selection.some(
      (selected) => selected.polygon === polygon && selected.vertex === end,
    )
  );
}

function isPositionSet(
  selection: SelectToolState["selectedVertices"] | ReadonlySet<Position>,
): selection is ReadonlySet<Position> {
  return !Array.isArray(selection);
}

function findLongestPolygonEdgeIndex(polygon: Polygon): number {
  let longestIndex = -1;
  let longestLength = -1;
  for (let index = 0; index < polygon.vertices.length; index++) {
    const from = polygon.vertices[index];
    const to = polygon.vertices[(index + 1) % polygon.vertices.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > longestLength) {
      longestLength = length;
      longestIndex = index;
    }
  }
  return longestIndex;
}
