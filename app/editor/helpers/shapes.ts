import type { Polygon, Position } from "~/editor/elma-types";

export type BuiltinShape = "ellipse" | "rectangle" | "star";
export type CustomShape = { id: string; name: string; polygons: Polygon[] };
export const builtinShapes: { id: BuiltinShape; name: string }[] = [
  { id: "ellipse", name: "Ellipse" },
  { id: "rectangle", name: "Rectangle" },
  { id: "star", name: "Star" },
];
export const DEFAULT_SHAPE_SIZE = 4;
export const DEFAULT_ELLIPSE_VERTICES = 10;
export const DEFAULT_STAR_POINTS = 5;
export const DEFAULT_STAR_INNER_RADIUS = 50;
export const MAX_SHAPE_POINTS = 200;

export function shapeBounds(polygons: Polygon[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const polygon of polygons)
    for (const { x, y } of polygon.vertices) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export function normalizeShape(polygons: Polygon[]): Polygon[] | null {
  if (
    !polygons.length ||
    polygons.some(
      (p) =>
        p.vertices.length < 3 ||
        p.vertices.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y)),
    )
  )
    return null;
  const { minX, minY, width, height } = shapeBounds(polygons);
  if (width <= 1e-8 || height <= 1e-8) return null;
  // Translate only: keep the original proportions, winding and relative layout.
  return polygons.map((p) => ({
    grass: p.grass,
    vertices: p.vertices.map((v) => ({ x: v.x - minX, y: v.y - minY })),
  }));
}

export function loadCustomShapes(value: unknown): CustomShape[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item) => {
    if (
      !item ||
      typeof item.id !== "string" ||
      builtinShapes.some((s) => s.id === item.id) ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      !Array.isArray(item.polygons)
    )
      return [];
    if (
      item.polygons.some(
        (p: Polygon) =>
          !p ||
          typeof p.grass !== "boolean" ||
          !Array.isArray(p.vertices) ||
          p.vertices.some(
            (v) => !v || typeof v.x !== "number" || typeof v.y !== "number",
          ),
      )
    )
      return [];
    const polygons = normalizeShape(item.polygons);
    if (!polygons) return [];
    ids.add(item.id);
    return [
      { id: item.id, name: item.name.trim().slice(0, 80) || "Shape", polygons },
    ];
  });
}

export function getCompleteSelectedPolygons(
  selection:
    | {
        selectedVertices: { polygon: Polygon; vertex: Position }[];
        selectedObjects: Position[];
        selectedPictures: Position[];
      }
    | undefined,
  polygons: Polygon[],
): Polygon[] {
  if (
    !selection ||
    selection.selectedObjects.length ||
    selection.selectedPictures.length ||
    !selection.selectedVertices.length
  )
    return [];
  const selected = new Set(selection.selectedVertices.map((s) => s.vertex));
  const candidates = polygons.filter((p) =>
    p.vertices.some((v) => selected.has(v)),
  );
  return candidates.every((p) => p.vertices.every((v) => selected.has(v)))
    ? candidates
    : [];
}

export function createShapePolygons({
  shape,
  start,
  end,
  constrain = false,
  ellipseVertices = DEFAULT_ELLIPSE_VERTICES,
  starPoints = DEFAULT_STAR_POINTS,
  starInnerRadius = DEFAULT_STAR_INNER_RADIUS,
}: {
  shape: BuiltinShape | CustomShape;
  start: Position;
  end: Position;
  constrain?: boolean;
  ellipseVertices?: number;
  starPoints?: number;
  starInnerRadius?: number;
}): Polygon[] {
  let dx = end.x - start.x,
    dy = end.y - start.y;
  const customBounds =
    typeof shape === "object" ? shapeBounds(shape.polygons) : undefined;
  if (constrain) {
    const ratio = customBounds ? customBounds.width / customBounds.height : 1;
    const height = Math.max(Math.abs(dy), Math.abs(dx) / ratio);
    dx = (dx < 0 ? -1 : 1) * height * ratio;
    dy = (dy < 0 ? -1 : 1) * height;
  }
  if (Math.abs(dx) <= 1e-8 || Math.abs(dy) <= 1e-8) return [];
  const left = Math.min(start.x, start.x + dx),
    top = Math.min(start.y, start.y + dy);
  const width = Math.abs(dx),
    height = Math.abs(dy);
  if (typeof shape === "object" && customBounds) {
    return shape.polygons.map((p) => ({
      grass: p.grass,
      vertices: p.vertices.map((v) => ({
        x: left + ((v.x - customBounds.minX) / customBounds.width) * width,
        y: top + ((v.y - customBounds.minY) / customBounds.height) * height,
      })),
    }));
  }
  if (shape === "rectangle")
    return [
      {
        grass: false,
        vertices: [
          { x: left, y: top },
          { x: left + width, y: top },
          { x: left + width, y: top + height },
          { x: left, y: top + height },
        ],
      },
    ];
  const points = Math.max(
    3,
    Math.min(
      MAX_SHAPE_POINTS,
      Math.round(shape === "star" ? starPoints : ellipseVertices),
    ),
  );
  const count = shape === "star" ? points * 2 : points;
  const inner = Math.max(1, Math.min(99, starInnerRadius)) / 100;
  return [
    {
      grass: false,
      vertices: Array.from({ length: count }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
        const radius = shape === "star" && i % 2 ? inner : 1;
        return {
          x: left + width / 2 + ((Math.cos(angle) * width) / 2) * radius,
          y: top + height / 2 + ((Math.sin(angle) * height) / 2) * radius,
        };
      }),
    },
  ];
}
