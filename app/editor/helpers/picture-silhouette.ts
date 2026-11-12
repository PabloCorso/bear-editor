import type { LgrAssets } from "~/components/lgr-assets";
import { ELMA_PIXEL_SCALE } from "~/editor/constants";
import type { Picture, Polygon, Position } from "~/editor/elma-types";

export type SilhouetteContour = { polygon: Polygon; isHole: boolean };
export type SilhouetteResult = {
  contours: SilhouetteContour[];
  error?: string;
};

type PixelPoint = { x: number; y: number };
type Edge = { from: PixelPoint; to: PixelPoint; direction: number };
const MAX_BITMAP_PIXELS = 750_000;
const MAX_EDGES = 35_000;
const MAX_CONTOURS = 48;
const MAX_TOTAL_VERTICES = 3_000;
const MIN_AREA_PIXELS = 4;
const ALPHA_THRESHOLD = 128;

const keyOf = (point: PixelPoint) => `${point.x},${point.y}`;

function area(points: PixelPoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function distanceToSegmentSquared(p: PixelPoint, a: PixelPoint, b: PixelPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
    : 0;
  const x = p.x - a.x - t * dx;
  const y = p.y - a.y - t * dy;
  return x * x + y * y;
}

function simplifyLine(points: PixelPoint[], tolerance: number): PixelPoint[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let farthest = start;
    let maximum = tolerance * tolerance;
    for (let i = start + 1; i < end; i++) {
      const distance = distanceToSegmentSquared(points[i], points[start], points[end]);
      if (distance > maximum) {
        maximum = distance;
        farthest = i;
      }
    }
    if (farthest !== start) {
      keep.add(farthest);
      stack.push([start, farthest], [farthest, end]);
    }
  }
  return points.filter((_, i) => keep.has(i));
}

function simplifyLoop(points: PixelPoint[], tolerance: number): PixelPoint[] {
  let opposite = 1;
  let greatest = -1;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[0].x;
    const dy = points[i].y - points[0].y;
    const distance = dx * dx + dy * dy;
    if (distance > greatest) {
      greatest = distance;
      opposite = i;
    }
  }
  return [
    ...simplifyLine(points.slice(0, opposite + 1), tolerance).slice(0, -1),
    ...simplifyLine([...points.slice(opposite), points[0]], tolerance).slice(0, -1),
  ];
}

/** Trace the alpha boundary, including disconnected islands and interior holes.
 * Converts pixels to normal .lev polygon vertices and never mutates the document.
 * Diagonal contacts are separated by following the clockwise-most outgoing edge.
 */
export function tracePictureSilhouette(
  picture: Picture,
  assets: LgrAssets,
): SilhouetteResult {
  const fail = (error: string): SilhouetteResult => ({ contours: [], error });
  if (!picture.name || picture.texture) {
    return fail("Choose a regular picture to trace.");
  }
  const sprite = assets.getSpritePixels(picture.name);
  if (!sprite) return fail("This picture is missing from the active LGR.");
  const { width, height, pixels } = sprite;
  if (!width || !height || width * height > MAX_BITMAP_PIXELS) {
    return fail("This picture is too large to trace.");
  }
  const opaque = (x: number, y: number) =>
    x >= 0 &&
    x < width &&
    y >= 0 &&
    y < height &&
    pixels[(y * width + x) * 4 + 3] >= ALPHA_THRESHOLD;
  const edges: Edge[] = [];
  const outgoing = new Map<string, number[]>();
  const add = (from: PixelPoint, to: PixelPoint, direction: number) => {
    const index = edges.length;
    edges.push({ from, to, direction });
    const key = keyOf(from);
    outgoing.set(key, [...(outgoing.get(key) ?? []), index]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      // Clockwise boundary orientation keeps opaque pixels on the right.
      if (!opaque(x, y - 1)) add({ x, y }, { x: x + 1, y }, 0);
      if (!opaque(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 }, 1);
      if (!opaque(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 }, 2);
      if (!opaque(x - 1, y)) add({ x, y: y + 1 }, { x, y }, 3);
      if (edges.length > MAX_EDGES) return fail("The picture outline is too detailed to trace.");
    }
  }
  if (!edges.length) return fail("This picture has no visible outline.");
  const visited = new Uint8Array(edges.length);
  const contours: SilhouetteContour[] = [];
  let totalVertices = 0;
  for (let startIndex = 0; startIndex < edges.length; startIndex++) {
    if (visited[startIndex]) continue;
    const first = edges[startIndex];
    const points: PixelPoint[] = [];
    let index = startIndex;
    let closed = false;
    for (let step = 0; step <= edges.length; step++) {
      if (visited[index]) break;
      const edge = edges[index];
      visited[index] = 1;
      points.push(edge.from);
      if (keyOf(edge.to) === keyOf(first.from)) {
        closed = true;
        break;
      }
      const choices = (outgoing.get(keyOf(edge.to)) ?? []).filter((i) => !visited[i]);
      if (!choices.length) break;
      // Prefer a right turn at pixel-diagonal contacts to retain separate islands.
      const preference = [1, 0, 3, 2];
      choices.sort(
        (a, b) =>
          preference.indexOf((edges[a].direction - edge.direction + 4) % 4) -
          preference.indexOf((edges[b].direction - edge.direction + 4) % 4),
      );
      index = choices[0];
    }
    if (!closed) return fail("Could not follow this picture's outline.");
    if (Math.abs(area(points)) < MIN_AREA_PIXELS) continue;
    let simplified = points;
    for (const tolerance of [0.8, 1.5, 2.5, 4]) {
      simplified = simplifyLoop(points, tolerance);
      if (simplified.length <= 500) break;
    }
    if (simplified.length < 3 || simplified.length > 500) {
      return fail("This outline is too complex to convert into a polygon.");
    }
    const signedArea = area(simplified);
    if (Math.abs(signedArea) < MIN_AREA_PIXELS) continue;
    const vertices: Position[] = simplified.map((p) => ({
      x: picture.position.x + p.x * ELMA_PIXEL_SCALE,
      y: picture.position.y + p.y * ELMA_PIXEL_SCALE,
    }));
    totalVertices += vertices.length;
    if (totalVertices > MAX_TOTAL_VERTICES || contours.length >= MAX_CONTOURS) {
      return fail("This picture contains too many outline details.");
    }
    contours.push({
      polygon: { vertices, grass: false },
      isHole: signedArea < 0,
    });
  }
  if (!contours.length) return fail("The outline is too small to convert.");
  // Outer boundaries first, holes afterward, preserving their nested geometry.
  contours.sort(
    (a, b) =>
      Math.abs(area(b.polygon.vertices)) -
      Math.abs(area(a.polygon.vertices)),
  );
  return { contours };
}
