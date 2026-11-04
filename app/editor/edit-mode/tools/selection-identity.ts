import type { Polygon, Position } from "~/editor/elma-types";

type VertexSelection = { polygon: Polygon; vertex: Position };

// Immutable content arrays make this index reusable across hover checks,
// selection reconciliation, and history capture. Weak keys release old versions.
const indexes = new WeakMap<
  Polygon[],
  {
    vertices: Map<Polygon, Set<Position>>;
    owners: Map<Position, Polygon>;
  }
>();

export function rebindSelectedVertices(
  polygons: Polygon[],
  selected: readonly VertexSelection[],
): VertexSelection[] {
  if (!selected.length) return [];
  let index = indexes.get(polygons);
  if (!index) {
    index = { vertices: new Map(), owners: new Map() };
    for (const polygon of polygons) {
      index.vertices.set(polygon, new Set(polygon.vertices));
      for (const vertex of polygon.vertices) index.owners.set(vertex, polygon);
    }
    indexes.set(polygons, index);
  }
  return selected.flatMap(({ polygon, vertex }) => {
    const owner = index.vertices.get(polygon)?.has(vertex)
      ? polygon
      : index.owners.get(vertex);
    return owner ? [{ polygon: owner, vertex }] : [];
  });
}
