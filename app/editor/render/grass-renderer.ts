import type { LgrAssets } from "~/components/lgr-assets";
import {
  ELMA_PIXEL_SCALE,
  ELMA_PIXELS_PER_WORLD_UNIT,
  colors,
  GRASS_BASELINE_PX,
  QGRASS_TOP_EXTRA_PX,
} from "~/editor/constants";
import type { WorldPoint } from "~/editor/render/world-scene";

type GrassVariant = {
  sprite: ImageBitmap;
  widthPx: number;
  heightPx: number;
  fallPx: number;
  bordersPx: number[];
};

type GrassSlopeVariant = {
  widthPx: number;
  fallPx: number;
};

type GrassPlacement = {
  xPx: number;
  topYPx: number;
  variant: GrassVariant;
};

type PolygonHeightmap = {
  xOriginPx: number;
  x0Px: number;
  yByXPx: number[];
  lengthPx: number;
  yAtLocalXPx: (xPx: number) => number | undefined;
};

export type GrassTextureComposition = {
  canvas: HTMLCanvasElement;
  minXPx: number;
  minYPx: number;
};

const DEFAULT_STEEPEST_GRASS_SPRITE_FALL_PX = 18;
const DEFAULT_STEEPEST_GRASS_SPRITE_WIDTH_PX = 10;
export const DEFAULT_GRASS_MAX_SLOPE_DEGREES = getMaxGrassSlopeDegrees([
  {
    widthPx: DEFAULT_STEEPEST_GRASS_SPRITE_WIDTH_PX,
    fallPx: DEFAULT_STEEPEST_GRASS_SPRITE_FALL_PX,
  },
]);

const grassBordersCache = new WeakMap<ImageBitmap, number[]>();
const grassTextureCache = new WeakMap<
  LgrAssets,
  Map<string, GrassTextureComposition | null>
>();

export function getMaxGrassSlopeDegrees(variants: GrassSlopeVariant[]) {
  return variants.reduce((maxSlope, variant) => {
    if (variant.widthPx <= 0) return maxSlope;

    const slopeDegrees =
      (Math.atan2(Math.abs(variant.fallPx), variant.widthPx) * 180) / Math.PI;
    return Math.max(maxSlope, slopeDegrees);
  }, 0);
}

export function composeGrassTexture({
  lgrAssets,
  vertices,
}: {
  lgrAssets: LgrAssets | null;
  vertices: WorldPoint[];
}): GrassTextureComposition | null {
  if (!lgrAssets) return null;

  const cacheKey = vertices
    .map((vertex) => `${vertex.x.toFixed(4)},${vertex.y.toFixed(4)}`)
    .join(";");
  const cache =
    grassTextureCache.get(lgrAssets) ??
    new Map<string, GrassTextureComposition | null>();
  if (!grassTextureCache.has(lgrAssets)) {
    grassTextureCache.set(lgrAssets, cache);
  }

  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { qgrass, variants } = getGrassVariants(lgrAssets);
  if (variants.length < 2) {
    cache.set(cacheKey, null);
    return null;
  }

  const placements = calculateGrassPlacements(vertices, variants);
  if (placements.length === 0) {
    cache.set(cacheKey, null);
    return null;
  }

  const composedCanvas = composeGrassCanvas({ placements, qgrass });
  cache.set(cacheKey, composedCanvas);
  return composedCanvas;
}

export function composePlayGrass(
  lgrAssets: LgrAssets,
  polygons: WorldPoint[][],
  origin: WorldPoint,
): GrassTextureComposition[] {
  const { qgrass, variants } = getGrassVariants(lgrAssets, true);
  if (!qgrass || variants.length === 0) return [];

  const chunks: GrassTextureComposition[] = [];
  for (const vertices of polygons) {
    const placements = calculateGrassPlacements(vertices, variants, origin);
    let first = 0;
    for (let i = 1; i <= placements.length; i++) {
      const start = placements[first]!;
      const next = placements[i];
      if (
        next &&
        next.xPx - start.xPx < 512 &&
        Math.abs(next.topYPx - start.topYPx) < 512
      )
        continue;

      const chunk = composeGrassCanvas({
        placements: placements.slice(first, i),
        qgrass,
        origin,
      });
      if (chunk) chunks.push(chunk);
      first = i;
    }
  }
  return chunks;
}

function scaleQgrass(qgrass: ImageBitmap, scale: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(qgrass.width * scale));
  canvas.height = Math.max(1, Math.floor(qgrass.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(qgrass, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function createGrassPolygonHeightmap(
  vertices: WorldPoint[],
  origin?: WorldPoint,
): PolygonHeightmap | null {
  if (vertices.length < 3) return null;

  const xOriginPx = origin
    ? origin.x * ELMA_PIXELS_PER_WORLD_UNIT
    : Math.floor(
        Math.min(
          ...vertices.map((vertex) => vertex.x * ELMA_PIXELS_PER_WORLD_UNIT),
        ),
      );

  let longestEdgeIndex = 0;
  let longestHorizontalSpan = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const nextIndex = (index + 1) % vertices.length;
    const span = Math.abs(vertices[index]!.x - vertices[nextIndex]!.x);
    const averageY = (vertices[index]!.y + vertices[nextIndex]!.y) / 2;
    const longestNextIndex = (longestEdgeIndex + 1) % vertices.length;
    const longestAverageY =
      (vertices[longestEdgeIndex]!.y + vertices[longestNextIndex]!.y) / 2;

    if (
      span > longestHorizontalSpan ||
      (!origin && span === longestHorizontalSpan && averageY < longestAverageY)
    ) {
      longestHorizontalSpan = span;
      longestEdgeIndex = index;
    }
  }

  if (longestHorizontalSpan < 0.0001) {
    return null;
  }

  let firstIndex = longestEdgeIndex;
  let secondIndex = (firstIndex + 1) % vertices.length;
  const polygonIsCounterclockwise =
    vertices[firstIndex]!.x >= vertices[secondIndex]!.x;

  let x0Px = -1;
  let currentXPx = -1;
  const yByXPx: number[] = [];

  for (let index = 0; index < vertices.length - 1; index += 1) {
    if (polygonIsCounterclockwise) {
      firstIndex = (firstIndex + 1) % vertices.length;
      secondIndex = (secondIndex + 1) % vertices.length;
    } else {
      firstIndex = (firstIndex - 1 + vertices.length) % vertices.length;
      secondIndex = (secondIndex - 1 + vertices.length) % vertices.length;
    }

    const leftVertexIndex = polygonIsCounterclockwise
      ? firstIndex
      : secondIndex;
    const rightVertexIndex = polygonIsCounterclockwise
      ? secondIndex
      : firstIndex;

    currentXPx = appendGrassLineHeightmap(
      vertices[leftVertexIndex]!,
      vertices[rightVertexIndex]!,
      xOriginPx,
      x0Px,
      currentXPx,
      yByXPx,
      origin,
    );

    if (x0Px < 0 && yByXPx.length > 0) {
      x0Px = toLocalPixel(vertices[leftVertexIndex]!.x, xOriginPx);
    }
  }

  if (x0Px < 0 || yByXPx.length === 0) {
    return null;
  }

  const lengthPx = currentXPx - x0Px + 1;

  return {
    xOriginPx,
    x0Px,
    yByXPx,
    lengthPx,
    yAtLocalXPx(xPx) {
      const localIndex = xPx - x0Px;
      if (localIndex < 0 || localIndex >= lengthPx) return undefined;
      return yByXPx[localIndex];
    },
  };
}

function calculateGrassPlacements(
  vertices: WorldPoint[],
  variants: GrassVariant[],
  origin?: WorldPoint,
): GrassPlacement[] {
  const heightmap = createGrassPolygonHeightmap(vertices, origin);
  if (!heightmap) return [];

  let currentXPx = heightmap.x0Px;
  let currentYPx = heightmap.yAtLocalXPx(currentXPx);
  if (currentYPx == null) return [];

  const placements: GrassPlacement[] = [];

  while (currentXPx < heightmap.x0Px + heightmap.lengthPx) {
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestVariant: GrassVariant | null = null;

    for (const variant of variants) {
      const targetXPx = currentXPx + variant.widthPx;
      const targetYPx =
        targetXPx >= heightmap.x0Px + heightmap.lengthPx
          ? heightmap.yByXPx[heightmap.lengthPx - 1]!
          : heightmap.yAtLocalXPx(targetXPx)!;
      const distance = Math.abs(targetYPx - (currentYPx + variant.fallPx));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestVariant = variant;
      }
    }

    if (!bestVariant) {
      currentXPx += 1;
      const nextYPx = heightmap.yAtLocalXPx(currentXPx);
      if (nextYPx != null) {
        currentYPx = nextYPx;
      }
      continue;
    }

    const topYPx = origin
      ? currentYPx + 20 - bestVariant.heightPx + Math.max(0, bestVariant.fallPx)
      : currentYPx - Math.ceil((bestVariant.heightPx - bestVariant.fallPx) / 2);
    placements.push({
      xPx: heightmap.xOriginPx + Math.floor(currentXPx),
      topYPx: origin ? topYPx : Math.floor(topYPx),
      variant: bestVariant,
    });

    currentXPx += bestVariant.widthPx;
    currentYPx += bestVariant.fallPx;
  }

  return placements;
}

function getGrassVariants(lgrAssets: LgrAssets, play = false) {
  const { qgrass, variants } = lgrAssets.getGrassSprites();

  return {
    qgrass,
    variants: variants.map(({ sprite, isUp }) => ({
      sprite,
      widthPx: sprite.width,
      heightPx: sprite.height,
      fallPx:
        (play
          ? Math.max(0, sprite.height - GRASS_BASELINE_PX)
          : sprite.height - GRASS_BASELINE_PX) * (isUp ? -1 : 1),
      bordersPx: getGrassBorders(sprite),
    })),
  };
}

function getGrassBorders(sprite: ImageBitmap) {
  const cached = grassBordersCache.get(sprite);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const borders: number[] = [];

  if (!ctx) {
    for (let x = 0; x < sprite.width; x += 1) {
      borders.push(sprite.height);
    }
    grassBordersCache.set(sprite, borders);
    return borders;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0);
  const { data } = ctx.getImageData(0, 0, sprite.width, sprite.height);

  for (let x = 0; x < sprite.width; x += 1) {
    let y = 0;
    for (; y < sprite.height; y += 1) {
      const alphaIndex = 4 * (y * sprite.width + x) + 3;
      if ((data[alphaIndex] ?? 0) !== 0) break;
    }
    borders.push(y);
  }

  grassBordersCache.set(sprite, borders);
  return borders;
}

function composeGrassCanvas({
  placements,
  qgrass,
  origin,
}: {
  placements: GrassPlacement[];
  qgrass: ImageBitmap | null;
  origin?: WorldPoint;
}): GrassTextureComposition | null {
  const grassMargin = origin ? 20 : QGRASS_TOP_EXTRA_PX;
  let minXPx = Number.POSITIVE_INFINITY;
  let minYPx = Number.POSITIVE_INFINITY;
  let maxXPx = Number.NEGATIVE_INFINITY;
  let maxYPx = Number.NEGATIVE_INFINITY;

  for (const placement of placements) {
    minXPx = Math.min(minXPx, placement.xPx);
    minYPx = Math.min(minYPx, placement.topYPx - grassMargin);
    maxXPx = Math.max(maxXPx, placement.xPx + placement.variant.widthPx);
    maxYPx = Math.max(maxYPx, placement.topYPx + placement.variant.heightPx);
  }

  const widthPx = Math.max(1, Math.round(maxXPx - minXPx));
  const heightPx = Math.max(1, Math.round(maxYPx - minYPx));
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const canvasCtx = canvas.getContext("2d");
  if (!canvasCtx) return null;

  canvasCtx.imageSmoothingEnabled = false;
  canvasCtx.fillStyle = colors.grass;
  canvasCtx.fillRect(0, 0, widthPx, heightPx);

  if (qgrass) {
    const scale = ELMA_PIXELS_PER_WORLD_UNIT / 100;
    const scaledQgrass = origin ? qgrass : scaleQgrass(qgrass, scale);
    const qgrassPattern = canvasCtx.createPattern(scaledQgrass, "repeat");
    if (qgrassPattern) {
      const mod = (value: number, modulus: number) =>
        ((value % modulus) + modulus) % modulus;
      const offsetX = -mod(
        origin
          ? Math.round(minXPx - origin.x * ELMA_PIXELS_PER_WORLD_UNIT)
          : minXPx,
        scaledQgrass.width,
      );
      const offsetY = -mod(
        origin
          ? Math.round(minYPx - origin.y * ELMA_PIXELS_PER_WORLD_UNIT)
          : minYPx,
        scaledQgrass.height,
      );

      canvasCtx.save();
      canvasCtx.translate(offsetX, offsetY);
      canvasCtx.fillStyle = qgrassPattern;
      canvasCtx.fillRect(
        0,
        0,
        widthPx + scaledQgrass.width,
        heightPx + scaledQgrass.height,
      );
      canvasCtx.restore();
    }
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = widthPx;
  maskCanvas.height = heightPx;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return null;
  maskCtx.imageSmoothingEnabled = false;
  maskCtx.fillStyle = "#ffffff";

  for (const placement of placements) {
    drawLocalGrassTextureMask(
      maskCtx,
      placement,
      minXPx,
      minYPx,
      grassMargin,
      origin ? 0 : 1,
    );
  }

  canvasCtx.globalCompositeOperation = "destination-in";
  canvasCtx.drawImage(maskCanvas, 0, 0);
  canvasCtx.globalCompositeOperation = "source-over";

  for (const placement of placements) {
    canvasCtx.drawImage(
      placement.variant.sprite,
      placement.xPx - minXPx,
      placement.topYPx - minYPx,
    );
  }

  return {
    canvas,
    minXPx,
    minYPx,
  };
}

function drawLocalGrassTextureMask(
  ctx: CanvasRenderingContext2D,
  placement: GrassPlacement,
  minXPx: number,
  minYPx: number,
  grassMargin: number,
  edgeOverlap: number,
) {
  const xPx = placement.xPx - minXPx;
  const topYPx = placement.topYPx - minYPx;
  const maskTopYPx = topYPx - grassMargin;

  for (let index = 0; index < placement.variant.bordersPx.length; index += 1) {
    const borderYPx =
      topYPx + placement.variant.bordersPx[index]! + edgeOverlap;
    ctx.fillRect(xPx + index, maskTopYPx, 1, borderYPx - maskTopYPx);
  }
}

function appendGrassLineHeightmap(
  from: WorldPoint,
  to: WorldPoint,
  xOriginPx: number,
  x0Px: number,
  currentXPx: number,
  yByXPx: number[],
  origin?: WorldPoint,
) {
  const x1Px = toLocalPixel(from.x, xOriginPx);
  const yOriginPx = (origin?.y ?? 0) * ELMA_PIXELS_PER_WORLD_UNIT;
  const y1Px = origin
    ? from.y * ELMA_PIXELS_PER_WORLD_UNIT - yOriginPx
    : toPixel(from.y);
  const x2Px = toLocalPixel(to.x, xOriginPx);
  const y2Px = origin
    ? to.y * ELMA_PIXELS_PER_WORLD_UNIT - yOriginPx
    : toPixel(to.y);

  if (x1Px > x2Px) {
    return currentXPx;
  }

  let nextCurrentXPx = currentXPx;
  let nextX0Px = x0Px;

  if (nextCurrentXPx < 0) {
    nextCurrentXPx = x1Px;
    nextX0Px = x1Px;
    yByXPx[0] = origin ? Math.ceil(y1Px) + yOriginPx : y1Px;
  }

  if (x1Px >= x2Px) {
    return nextCurrentXPx;
  }

  if (nextCurrentXPx < x1Px - 1) {
    return nextCurrentXPx;
  }

  const endXPx = origin ? Math.min(x2Px, nextX0Px + 9999) : x2Px;
  for (let xPx = x1Px; xPx <= endXPx; xPx += 1) {
    if (xPx < nextCurrentXPx) continue;

    const t = (xPx - x1Px) / (x2Px - x1Px);
    const yPx = Math.trunc(y1Px + (y2Px - y1Px) * t);
    yByXPx[xPx - nextX0Px] = origin
      ? Math.ceil(y1Px + (y2Px - y1Px) * t) + yOriginPx
      : yPx;
    nextCurrentXPx = xPx;
  }

  return nextCurrentXPx;
}

function toPixel(value: number) {
  return Math.trunc(value * ELMA_PIXELS_PER_WORLD_UNIT);
}

function toLocalPixel(value: number, originPx: number) {
  return Math.trunc(value * ELMA_PIXELS_PER_WORLD_UNIT - originPx);
}

export function pixelsToWorldUnits(value: number) {
  return value * ELMA_PIXEL_SCALE;
}
