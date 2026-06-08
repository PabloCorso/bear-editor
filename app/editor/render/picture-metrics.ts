import type { LgrAssets } from "~/components/lgr-assets";
import { ELMA_PIXEL_SCALE } from "~/editor/constants";
import type { Position } from "~/editor/elma-types";

export const PICTURE_SCALE = ELMA_PIXEL_SCALE;
const EPSILON_ALPHA = 0;

type CachedPictureOutline = {
  width: number;
  height: number;
  segments: Array<[Position, Position]>;
};
const pictureOutlineCache = new WeakMap<
  LgrAssets,
  Map<string, CachedPictureOutline>
>();
const maskedTextureAlphaCache = new WeakMap<
  LgrAssets,
  Map<string, { width: number; height: number; pixels: Uint8ClampedArray }>
>();

export function getBitmapWorldDimensions(bitmap: ImageBitmap) {
  return {
    width: bitmap.width * PICTURE_SCALE,
    height: bitmap.height * PICTURE_SCALE,
  };
}

export function getPictureWorldDimensions(
  picture: {
    name?: string;
    texture?: string;
    mask?: string;
  },
  lgrAssets: LgrAssets | null,
) {
  if (!lgrAssets) return null;

  if (picture.texture && picture.mask) {
    const maskSprite = lgrAssets.getSprite(picture.mask);
    if (!maskSprite) return null;
    return getBitmapWorldDimensions(maskSprite);
  }

  const sprite = picture.name ? lgrAssets.getSprite(picture.name) : null;
  if (!sprite) return null;
  return getBitmapWorldDimensions(sprite);
}

export function isWorldPointInPictureVisiblePixel(
  point: Position,
  picture: {
    name?: string;
    texture?: string;
    mask?: string;
    position: Position;
  },
  lgrAssets: LgrAssets | null,
) {
  const alphaSprite = getPictureAlphaSprite(picture, lgrAssets);
  if (!alphaSprite) return false;

  const localX = Math.floor((point.x - picture.position.x) / PICTURE_SCALE);
  const localY = Math.floor((point.y - picture.position.y) / PICTURE_SCALE);
  if (
    localX < 0 ||
    localY < 0 ||
    localX >= alphaSprite.width ||
    localY >= alphaSprite.height
  ) {
    return false;
  }

  const alphaOffset = (localY * alphaSprite.width + localX) * 4 + 3;
  return (alphaSprite.pixels[alphaOffset] ?? 0) > 0;
}

function getAlphaSpriteName(picture: {
  name?: string;
  texture?: string;
  mask?: string;
}) {
  return picture.texture && picture.mask
    ? `${picture.texture}::${picture.mask}`
    : picture.name;
}

export function getPictureWorldOutlineSegments(
  picture: {
    name?: string;
    texture?: string;
    mask?: string;
    position: Position;
  },
  lgrAssets: LgrAssets | null,
):
  | Array<{
      x: number;
      y: number;
    }>[]
  | null {
  const alphaSpriteName = getAlphaSpriteName(picture);
  if (!alphaSpriteName || !lgrAssets) return null;

  const sprite = getPictureAlphaSprite(picture, lgrAssets);
  if (!sprite) return null;

  const cacheKey = `${alphaSpriteName}:${sprite.width}x${sprite.height}`;
  const assetOutlineCache = getPictureOutlineCache(lgrAssets);
  const cache = assetOutlineCache.get(cacheKey);
  const localSegments =
    cache?.width === sprite.width && cache?.height === sprite.height
      ? cache.segments
      : null;

  const sourceSegments =
    localSegments ??
    buildOutlineSegments(sprite.width, sprite.height, sprite.pixels).map(
      ([from, to]) => [from, to] as [Position, Position],
    );

  if (
    !cache ||
    cache.width !== sprite.width ||
    cache.height !== sprite.height
  ) {
    assetOutlineCache.set(cacheKey, {
      width: sprite.width,
      height: sprite.height,
      segments: sourceSegments,
    });
  }

  return sourceSegments.map(([from, to]) => [
    {
      x: picture.position.x + from.x * PICTURE_SCALE,
      y: picture.position.y + from.y * PICTURE_SCALE,
    },
    {
      x: picture.position.x + to.x * PICTURE_SCALE,
      y: picture.position.y + to.y * PICTURE_SCALE,
    },
  ]);
}

function getPictureAlphaSprite(
  picture: {
    name?: string;
    texture?: string;
    mask?: string;
  },
  lgrAssets: LgrAssets | null,
) {
  if (!lgrAssets) return null;

  if (picture.texture && picture.mask) {
    const key = `${picture.texture.toLowerCase()}:${picture.mask.toLowerCase()}`;
    const assetTextureCache = getMaskedTextureAlphaCache(lgrAssets);
    const cached = assetTextureCache.get(key);
    if (cached) return cached;

    const maskSprite = lgrAssets.getSpritePixels(picture.mask);
    const textureSprite = lgrAssets.getSpritePixels(picture.texture);
    if (!maskSprite || !textureSprite) return null;

    const width = maskSprite.width;
    const height = maskSprite.height;
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const targetOffset = (y * width + x) * 4;
        const maskAlpha = maskSprite.pixels[targetOffset + 3];
        if (maskAlpha === 0) continue;

        const sourceX = x % textureSprite.width;
        const sourceY = y % textureSprite.height;
        const sourceOffset = (sourceY * textureSprite.width + sourceX) * 4 + 3;
        const sourceAlpha = textureSprite.pixels[sourceOffset];
        if (sourceAlpha > 0) {
          pixels[targetOffset + 3] = sourceAlpha;
        }
      }
    }

    const combined = { width, height, pixels };
    assetTextureCache.set(key, combined);
    return combined;
  }

  const name = picture.name;
  if (!name) return null;
  return lgrAssets.getSpritePixels(name);
}

function getPictureOutlineCache(lgrAssets: LgrAssets) {
  let cache = pictureOutlineCache.get(lgrAssets);
  if (!cache) {
    cache = new Map();
    pictureOutlineCache.set(lgrAssets, cache);
  }
  return cache;
}

function getMaskedTextureAlphaCache(lgrAssets: LgrAssets) {
  let cache = maskedTextureAlphaCache.get(lgrAssets);
  if (!cache) {
    cache = new Map();
    maskedTextureAlphaCache.set(lgrAssets, cache);
  }
  return cache;
}

function buildOutlineSegments(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
) {
  const outlineSegments: Array<[Position, Position]> = [];

  function isOpaque(x: number, y: number): boolean {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const alpha = pixels[(y * width + x) * 4 + 3];
    return alpha > EPSILON_ALPHA;
  }

  // Top and bottom edges
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!isOpaque(x, y) || isOpaque(x, y - 1)) {
        x += 1;
        continue;
      }

      const startX = x;
      x += 1;
      while (x < width && isOpaque(x, y) && !isOpaque(x, y - 1)) {
        x += 1;
      }
      outlineSegments.push([
        { x: startX, y },
        { x, y },
      ]);
    }
  }

  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (!isOpaque(x, y) || isOpaque(x, y + 1)) {
        x += 1;
        continue;
      }

      const startX = x;
      x += 1;
      while (x < width && isOpaque(x, y) && !isOpaque(x, y + 1)) {
        x += 1;
      }
      outlineSegments.push([
        { x: startX, y: y + 1 },
        { x, y: y + 1 },
      ]);
    }
  }

  // Left and right edges
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height) {
      if (!isOpaque(x, y) || isOpaque(x - 1, y)) {
        y += 1;
        continue;
      }

      const startY = y;
      y += 1;
      while (y < height && isOpaque(x, y) && !isOpaque(x - 1, y)) {
        y += 1;
      }
      outlineSegments.push([
        { x, y: startY },
        { x, y },
      ]);
    }
  }

  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height) {
      if (!isOpaque(x, y) || isOpaque(x + 1, y)) {
        y += 1;
        continue;
      }

      const startY = y;
      y += 1;
      while (y < height && isOpaque(x, y) && !isOpaque(x + 1, y)) {
        y += 1;
      }
      outlineSegments.push([
        { x: x + 1, y: startY },
        { x: x + 1, y },
      ]);
    }
  }

  return outlineSegments;
}
