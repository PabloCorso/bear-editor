import polygonClipping, {
  type Polygon as ClippingPolygon,
} from "polygon-clipping";
import type { Polygon } from "~/editor/elma-types";

export type PolygonOperation = "union" | "subtract" | "intersect";
export type PolygonOperationResult =
  | { status: "ready"; polygons: Polygon[] }
  | { status: "no-overlap" | "invalid" };

/** Work on enclosed areas; Elma represents holes as separate nested rings. */
export function applyPolygonOperation(
  operation: PolygonOperation,
  first: Polygon,
  second: Polygon,
): PolygonOperationResult {
  if (
    [first, second].some(
      (polygon) =>
        polygon.grass ||
        polygon.vertices.length < 3 ||
        polygon.vertices.some(
          ({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y),
        ),
    )
  )
    return { status: "invalid" };

  const toRing = (polygon: Polygon): ClippingPolygon => [
    polygon.vertices.map(({ x, y }) => [x, y]),
  ];
  try {
    const a = toRing(first);
    const b = toRing(second);
    const overlap = polygonClipping.intersection(a, b);
    // Point/edge contact alone is not an overlapping area.
    if (!overlap.length) return { status: "no-overlap" };
    const result =
      operation === "intersect"
        ? overlap
        : operation === "union"
          ? polygonClipping.union(a, b)
          : polygonClipping.difference(a, b);
    return {
      status: "ready",
      polygons: result.flatMap((polygon) =>
        polygon.map((ring) => ({
          grass: false,
          // Clipping closes rings; Elma closes them implicitly.
          vertices: ring.slice(0, -1).map(([x, y]) => ({ x, y })),
        })),
      ),
    };
  } catch {
    // Numerical failures must never partially change the level.
    return { status: "invalid" };
  }
}
