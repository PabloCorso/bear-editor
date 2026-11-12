import type { Mask, Polygon, Position } from "~/editor/elma-types";
import { ELMA_PIXEL_SCALE } from "~/editor/constants";
import { getPolygonBounds } from "~/editor/render/world-derived-data-cache";
import type { WorldRect } from "~/editor/render/world-geometry";

type MaskPixels = { width: number; height: number; pixels: Uint8ClampedArray };
export type FillMask = {
  mask: Mask;
  width: number;
  height: number;
  core: WorldRect;
};
export type FillPlacement = { mask: Mask; position: Position };
export type TextureFillResult = { placements: FillPlacement[]; error?: string };
const PIXEL = ELMA_PIXEL_SCALE;
const MAX_PLACEMENTS = 5000;
const MAX_WORK = 4_000_000;
const EPSILON = 1e-12;

// Largest fully opaque rectangle, found in linear time using a histogram.
// An inset leaves real overlap around every covered cell, including mask corners.
export function createFillMask(
  mask: Mask,
  sprite: MaskPixels,
): FillMask | null {
  const heights = new Int32Array(sprite.width);
  let best = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let bestArea = 0;
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      heights[x] =
        sprite.pixels[(y * sprite.width + x) * 4 + 3] === 255
          ? heights[x] + 1
          : 0;
    }
    const stack: number[] = [];
    for (let x = 0; x <= sprite.width; x++) {
      const height = heights[x] ?? 0;
      while (stack.length && heights[stack[stack.length - 1]] > height) {
        const h = heights[stack.pop()!];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = h * (x - left);
        if (area > bestArea) {
          bestArea = area;
          best = { minX: left, minY: y + 1 - h, maxX: x, maxY: y + 1 };
        }
      }
      stack.push(x);
    }
  }
  if (best.maxX - best.minX <= 2 || best.maxY - best.minY <= 2) return null;
  return {
    mask,
    width: sprite.width * PIXEL,
    height: sprite.height * PIXEL,
    core: {
      minX: (best.minX + 1) * PIXEL,
      minY: (best.minY + 1) * PIXEL,
      maxX: (best.maxX - 1) * PIXEL,
      maxY: (best.maxY - 1) * PIXEL,
    },
  };
}

export function generateTextureFill(
  polygon: Polygon,
  masks: FillMask[],
): TextureFillResult {
  const fail = (error: string): TextureFillResult => ({
    placements: [],
    error,
  });
  const vertices = polygon.vertices;
  if (
    polygon.grass ||
    vertices.length < 3 ||
    vertices.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  ) {
    return fail("Choose a closed ground or sky polygon.");
  }
  if (!masks.length) return fail("No usable texture masks in this LGR.");
  let work = 0;
  // Reject crossings rather than making an ambiguous fill for invalid geometry.
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    for (let j = i + 2; j < vertices.length; j++) {
      if (++work > MAX_WORK)
        return fail("This polygon is too complex to fill.");
      if (i === 0 && j === vertices.length - 1) continue;
      const c = vertices[j],
        d = vertices[(j + 1) % vertices.length];
      if (
        cross(a, b, c) * cross(a, b, d) < 0 &&
        cross(c, d, a) * cross(c, d, b) < 0
      ) {
        return fail("Fix the polygon’s intersecting edges before filling.");
      }
    }
  }
  if (polygonArea(vertices) <= EPSILON)
    return fail("This polygon has no area to fill.");
  const sorted = [...masks].sort((a, b) => coreArea(b) - coreArea(a));
  const smallest = sorted[sorted.length - 1];
  const smallWidth = smallest.core.maxX - smallest.core.minX;
  const smallHeight = smallest.core.maxY - smallest.core.minY;
  const largest = sorted[0];
  const tileWidth = largest.core.maxX - largest.core.minX;
  const tileHeight = largest.core.maxY - largest.core.minY;
  const bounds = getPolygonBounds(vertices);
  const cols = Math.ceil((bounds.maxX - bounds.minX) / tileWidth);
  const rows = Math.ceil((bounds.maxY - bounds.minY) / tileHeight);
  if (!Number.isFinite(cols * rows) || cols * rows > MAX_PLACEMENTS)
    return fail("This fill would need too many textures.");
  const placements: FillPlacement[] = [];
  const covered = new Map<string, WorldRect[]>();
  function buckets(rect: WorldRect) {
    const keys: string[] = [];
    for (
      let y = Math.floor(rect.minY / tileHeight);
      y <= Math.floor(rect.maxY / tileHeight);
      y++
    ) {
      for (
        let x = Math.floor(rect.minX / tileWidth);
        x <= Math.floor(rect.maxX / tileWidth);
        x++
      )
        keys.push(`${x},${y}`);
    }
    return keys;
  }
  function alreadyCovered(rect: WorldRect) {
    return buckets(rect).some((key) =>
      covered
        .get(key)
        ?.some(
          (core) =>
            core.minX <= rect.minX + EPSILON &&
            core.minY <= rect.minY + EPSILON &&
            core.maxX >= rect.maxX - EPSILON &&
            core.maxY >= rect.maxY - EPSILON,
        ),
    );
  }
  let error: string | undefined;
  function intersection(rect: WorldRect) {
    work += vertices.length;
    if (work > MAX_WORK) {
      error = "This polygon is too complex to fill.";
      return 0;
    }
    return polygonArea(clipToRect(vertices, rect));
  }
  function cover(rect: WorldRect, depth = 0): void {
    if (error) return;
    if (alreadyCovered(rect) || intersection(rect) <= EPSILON) return;
    const width = rect.maxX - rect.minX,
      height = rect.maxY - rect.minY;
    // Use the smallest mask that covers this cell. Large interior cells naturally
    // select large masks; boundary cells are subdivided down to the small mask.
    let chosen: { mask: FillMask; position: Position } | undefined;
    for (const mask of [...sorted].reverse()) {
      if (
        mask.core.maxX - mask.core.minX + EPSILON < width ||
        mask.core.maxY - mask.core.minY + EPSILON < height
      )
        continue;
      const minX = rect.maxX - mask.core.maxX,
        maxX = rect.minX - mask.core.minX;
      const minY = rect.maxY - mask.core.maxY,
        maxY = rect.minY - mask.core.minY;
      const clamp = (v: number, min: number, max: number) =>
        Math.max(min, Math.min(v, max));
      // Shift towards the polygon's interior where possible instead of always
      // centering a large mask on a small remaining strip.
      const xs = [
        ...new Set([
          clamp(bounds.minX, minX, maxX),
          clamp(bounds.maxX - mask.width, minX, maxX),
          (minX + maxX) / 2,
          minX,
          maxX,
        ]),
      ];
      const ys = [
        ...new Set([
          clamp(bounds.minY, minY, maxY),
          clamp(bounds.maxY - mask.height, minY, maxY),
          (minY + maxY) / 2,
          minY,
          maxY,
        ]),
      ];
      const fringe = 2 * PIXEL * (mask.width + mask.height);
      let bestOutside = Infinity;
      for (const x of xs) {
        for (const y of ys) {
          const outside =
            mask.width * mask.height -
            intersection({
              minX: x,
              minY: y,
              maxX: x + mask.width,
              maxY: y + mask.height,
            });
          if (outside < bestOutside) {
            bestOutside = outside;
            if (outside <= fringe + EPSILON || mask === smallest)
              chosen = { mask, position: { x, y } };
          }
          if (outside <= fringe + EPSILON || error) break;
        }
        if (bestOutside <= fringe + EPSILON || error) break;
      }
      if (chosen || error) break;
    }
    if (error) return;
    if (chosen) {
      placements.push({ mask: chosen.mask.mask, position: chosen.position });
      const core = {
        minX: chosen.position.x + chosen.mask.core.minX,
        minY: chosen.position.y + chosen.mask.core.minY,
        maxX: chosen.position.x + chosen.mask.core.maxX,
        maxY: chosen.position.y + chosen.mask.core.maxY,
      };
      for (const key of buckets(core))
        covered.set(key, [...(covered.get(key) ?? []), core]);
      if (placements.length > MAX_PLACEMENTS)
        error = "This fill would need too many textures.";
      return;
    }
    if (depth >= 40) {
      error = "Could not cover this polygon with the available masks.";
      return;
    }
    if (width / smallWidth >= height / smallHeight) {
      const middle = (rect.minX + rect.maxX) / 2;
      cover({ ...rect, maxX: middle }, depth + 1);
      cover({ ...rect, minX: middle }, depth + 1);
    } else {
      const middle = (rect.minY + rect.maxY) / 2;
      cover({ ...rect, maxY: middle }, depth + 1);
      cover({ ...rect, minY: middle }, depth + 1);
    }
  }
  for (let row = 0; row < rows && !error; row++) {
    for (let col = 0; col < cols && !error; col++) {
      const minX = bounds.minX + col * tileWidth,
        minY = bounds.minY + row * tileHeight;
      cover({
        minX,
        minY,
        maxX: Math.min(minX + tileWidth, bounds.maxX),
        maxY: Math.min(minY + tileHeight, bounds.maxY),
      });
    }
  }
  return error ? fail(error) : { placements };
}

function coreArea(mask: FillMask) {
  return (mask.core.maxX - mask.core.minX) * (mask.core.maxY - mask.core.minY);
}
function cross(a: Position, b: Position, c: Position) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
export function polygonArea(vertices: Position[]) {
  if (vertices.length < 3) return 0;
  const origin = vertices[0];
  let area = 0;
  for (let i = 1; i < vertices.length - 1; i++)
    area += cross(origin, vertices[i], vertices[i + 1]);
  return Math.abs(area) / 2;
}

// Sutherland–Hodgman clipping against a rectangle; signed area also accounts
// for the boundary bridges produced when a concave intersection is disconnected.
function clipToRect(vertices: Position[], rect: WorldRect): Position[] {
  let result = vertices;
  for (const [axis, limit, direction] of [
    ["x", rect.minX, 1],
    ["x", rect.maxX, -1],
    ["y", rect.minY, 1],
    ["y", rect.maxY, -1],
  ] as const) {
    const input = result;
    result = [];
    if (!input.length) break;
    let previous = input[input.length - 1];
    for (const current of input) {
      const currentInside = (current[axis] - limit) * direction >= 0;
      const previousInside = (previous[axis] - limit) * direction >= 0;
      if (currentInside !== previousInside) {
        const t = (limit - previous[axis]) / (current[axis] - previous[axis]);
        result.push({
          x: previous.x + t * (current.x - previous.x),
          y: previous.y + t * (current.y - previous.y),
        });
      }
      if (currentInside) result.push(current);
      previous = current;
    }
  }
  return result;
}
