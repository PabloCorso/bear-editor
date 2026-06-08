import defaultLgr from "../assets/lgr/Default.lgr?url";
import { decodeLgrSpritePixels } from "~/editor/helpers/pcx-loader";
import { ElmaLGR, type AppleAnimation } from "~/editor/elma-types";
import { standardSprites } from "./standard-sprites";
import type { DecodedLgrSprite, WorkerResponse } from "./lgr-assets.worker";

type LoadedSprite = {
  bitmap: ImageBitmap;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  src?: string;
};

const SPRITE_LOAD_FRAME_BUDGET_MS = 8;

export class LgrAssets {
  private ready = false;
  private lgrSprites: Record<string, LoadedSprite> = {};
  private maskedPreviewUrls = new Map<string, string>();
  private loadPromise: Promise<void> | null = null;
  readonly name: string;
  readonly levelName: string;

  constructor(name = "Default.lgr", levelName = "default") {
    this.name = name;
    this.levelName = levelName;
  }

  async load() {
    if (this.ready) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadDefaultLgr().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async loadDefaultLgr() {
    const buf = await fetch(defaultLgr).then((r) => r.arrayBuffer());
    await this.loadFromBytes(buf);
  }

  async loadFromBytes(data: ArrayBuffer) {
    if (this.ready) return;
    try {
      const sprites = await decodeLgrSprites(data);
      await this.loadDecodedSprites(sprites);
      this.ready = true;
    } catch (error) {
      this.destroy();
      this.ready = false;
      throw error;
    }
  }

  private normalizeName(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/\.pcx$/, "");
  }

  private async loadDecodedSprites(sprites: DecodedLgrSprite[]) {
    let lastYieldTime = getNow();

    for (const sprite of sprites) {
      if (this.lgrSprites[sprite.name]) continue;
      if (getNow() - lastYieldTime >= SPRITE_LOAD_FRAME_BUDGET_MS) {
        await yieldToBrowser();
        lastYieldTime = getNow();
      }

      const pixels = new Uint8ClampedArray(sprite.pixels.length);
      pixels.set(sprite.pixels);
      const bitmap = await createImageBitmap(
        new ImageData(pixels, sprite.width, sprite.height),
      );
      this.lgrSprites[sprite.name] = {
        bitmap,
        pixels,
        width: sprite.width,
        height: sprite.height,
      };

      if (getNow() - lastYieldTime >= SPRITE_LOAD_FRAME_BUDGET_MS) {
        await yieldToBrowser();
        lastYieldTime = getNow();
      }
    }
  }

  getSprites() {
    return Object.fromEntries(
      Object.entries(this.lgrSprites).map(([name, sprite]) => [
        name,
        sprite.bitmap,
      ]),
    );
  }

  getSpriteEntries() {
    return Object.entries(this.lgrSprites).map(
      ([name, sprite]) => [name, sprite.bitmap] as const,
    );
  }

  getSprite(name: string) {
    const normName = this.normalizeName(name);
    return this.lgrSprites[normName]?.bitmap || null;
  }

  getSpritePixels(name: string) {
    const normName = this.normalizeName(name);
    const sprite = this.lgrSprites[normName];
    if (!sprite) return null;

    return {
      pixels: sprite.pixels,
      width: sprite.width,
      height: sprite.height,
    };
  }

  getSpritePreview(name: string) {
    const normName = this.normalizeName(name);
    const sprite = this.lgrSprites[normName];
    if (!sprite) return undefined;
    if (sprite.src) return sprite.src;

    sprite.src = createImageUrlFromRgba({
      width: sprite.width,
      height: sprite.height,
      pixels: sprite.pixels,
    });
    return sprite.src;
  }

  getKuskiSprites() {
    const kuskiSprites: Record<string, ImageBitmap> = {};
    for (const partName of standardSprites.kuski) {
      const sprite = this.getSprite(partName);
      if (sprite) {
        kuskiSprites[partName] = sprite;
      }
    }
    return kuskiSprites;
  }

  getAppleSprite(animation: AppleAnimation) {
    const sprites = this.getAppleSpriteEntries();
    if (sprites.length === 0) return null;

    const index = (animation - 1) % sprites.length;
    return sprites[index]?.sprite.bitmap ?? null;
  }

  getAppleSpritePreview(animation: AppleAnimation) {
    const sprites = this.getAppleSpriteEntries();
    if (sprites.length === 0) return undefined;

    const index = (animation - 1) % sprites.length;
    const sprite = sprites[index]?.sprite;
    if (!sprite) return undefined;
    if (sprite.src) return sprite.src;

    sprite.src = createImageUrlFromRgba({
      width: sprite.width,
      height: sprite.height,
      pixels: sprite.pixels,
    });
    return sprite.src;
  }

  getAppleAnimationOptions(): AppleAnimation[] {
    const animations = this.getAppleSpriteEntries().map(({ animation }) => {
      return animation;
    });
    return animations.length > 0 ? animations : [1, 2];
  }

  getKillerSprite() {
    return this.getSprite("qkiller");
  }

  getFlowerSprite() {
    return this.getSprite("qexit");
  }

  getPictureSprites() {
    return standardSprites.pictures.map((picture) => ({
      picture,
      sprite: this.getSprite(picture.name),
      src: this.getSpritePreview(picture.name),
    }));
  }

  getTextureSprites() {
    return standardSprites.textures.map((texture) => ({
      texture,
      sprite: this.getSprite(texture.texture),
      src: this.getSpritePreview(texture.texture),
    }));
  }

  getGrassSprites() {
    const qgrass = this.getSprite("qgrass");
    const variants = this.getSpriteEntries()
      .flatMap(([name, sprite]) => {
        const match = /^(qup|qdown)_(\d+)$/i.exec(name);
        if (!match) return [];

        return [
          {
            name,
            sprite,
            isUp: match[1]?.toLowerCase() === "qup",
            sortOrder: Number(match[2]),
          },
        ];
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      qgrass,
      variants,
    };
  }

  isReady() {
    return this.ready;
  }

  getMaskedTexturePreview(textureName: string, maskName: string) {
    const textureKey = this.normalizeName(textureName);
    const maskKey = this.normalizeName(maskName);
    const cacheKey = `${textureKey}:${maskKey}`;
    const cached = this.maskedPreviewUrls.get(cacheKey);
    if (cached) return cached;

    const texture = this.lgrSprites[textureKey];
    const mask = this.lgrSprites[maskKey];
    if (!texture || !mask) return undefined;

    const pixels = new Uint8ClampedArray(mask.width * mask.height * 4);
    for (let y = 0; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        const targetOffset = (y * mask.width + x) * 4;
        if (mask.pixels[targetOffset + 3] === 0) continue;

        const sourceX = x % texture.width;
        const sourceY = y % texture.height;
        const sourceOffset = (sourceY * texture.width + sourceX) * 4;
        pixels[targetOffset] = texture.pixels[sourceOffset]!;
        pixels[targetOffset + 1] = texture.pixels[sourceOffset + 1]!;
        pixels[targetOffset + 2] = texture.pixels[sourceOffset + 2]!;
        pixels[targetOffset + 3] = texture.pixels[sourceOffset + 3]!;
      }
    }

    const src = createImageUrlFromRgba({
      width: mask.width,
      height: mask.height,
      pixels,
    });
    if (!src) return undefined;

    this.maskedPreviewUrls.set(cacheKey, src);
    return src;
  }

  destroy() {
    Object.values(this.lgrSprites).forEach((sprite) => {
      sprite.bitmap.close();
      if (sprite.src) {
        URL.revokeObjectURL(sprite.src);
      }
    });
    this.lgrSprites = {};

    for (const src of this.maskedPreviewUrls.values()) {
      URL.revokeObjectURL(src);
    }
    this.maskedPreviewUrls.clear();
    this.ready = false;
  }

  private getAppleSpriteEntries() {
    return Object.entries(this.lgrSprites)
      .flatMap(([name, sprite]) => {
        const match = /^qfood([1-9])$/i.exec(name);
        if (!match) return [];

        return [
          {
            animation: Number(match[1]) as AppleAnimation,
            sprite,
          },
        ];
      })
      .sort((a, b) => a.animation - b.animation);
  }
}

async function decodeLgrSprites(data: ArrayBuffer) {
  if (typeof Worker === "undefined") {
    return decodeLgrSpritesOnMainThread(data);
  }

  try {
    return await decodeLgrSpritesInWorker(data);
  } catch (error) {
    console.warn(
      "LGR worker decode failed; falling back to main thread.",
      error,
    );
    return decodeLgrSpritesOnMainThread(data);
  }
}

function decodeLgrSpritesInWorker(data: ArrayBuffer) {
  return new Promise<DecodedLgrSprite[]>((resolve, reject) => {
    const worker = new Worker(
      new URL("./lgr-assets.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    worker.addEventListener("message", function handleWorkerMessage(event) {
      const response = event.data as WorkerResponse;
      worker.terminate();

      if (response.type === "error") {
        reject(new Error(response.message));
        return;
      }

      resolve(response.sprites);
    });
    worker.addEventListener("error", function handleWorkerError(event) {
      worker.terminate();
      reject(event.error ?? new Error(event.message));
    });
    const workerData = data.slice(0);
    worker.postMessage({ data: workerData }, [workerData]);
  });
}

async function decodeLgrSpritesOnMainThread(data: ArrayBuffer) {
  const lgr = ElmaLGR.from(new Uint8Array(data));
  await yieldToBrowser();

  const declarations = new Map(
    lgr.pictureList.map((declaration) => [
      normalizeSpriteName(declaration.name),
      declaration,
    ]),
  );
  const sprites: DecodedLgrSprite[] = [];
  let lastYieldTime = getNow();

  for (const picture of lgr.pictureData) {
    const name = normalizeSpriteName(picture.name);
    if (sprites.some((sprite) => sprite.name === name)) continue;

    const declaration = declarations.get(name);
    const decoded = decodeLgrSpritePixels(picture, declaration);
    sprites.push({
      name,
      pixels: decoded.pixels,
      width: decoded.width,
      height: decoded.height,
    });

    if (getNow() - lastYieldTime >= SPRITE_LOAD_FRAME_BUDGET_MS) {
      await yieldToBrowser();
      lastYieldTime = getNow();
    }
  }

  return sprites;
}

function normalizeSpriteName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.pcx$/, "");
}

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function createImageUrlFromRgba({
  width,
  height,
  pixels,
}: {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}) {
  if (typeof URL === "undefined") return undefined;
  const png = encodePngRgba({ width, height, pixels });
  return URL.createObjectURL(new Blob([png], { type: "image/png" }));
}

function encodePngRgba({
  width,
  height,
  pixels,
}: {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}) {
  const rowStride = width * 4;
  const raw = new Uint8Array(height * (rowStride + 1));
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (rowStride + 1);
    raw[rawOffset] = 0;
    raw.set(
      pixels.subarray(y * rowStride, y * rowStride + rowStride),
      rawOffset + 1,
    );
  }

  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return concatBytes([
    PNG_SIGNATURE,
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", encodeZlibStore(raw)),
    createPngChunk("IEND", new Uint8Array(0)),
  ]);
}

function encodeZlibStore(data: Uint8Array) {
  const chunks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  let offset = 0;

  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockLength = Math.min(0xffff, remaining);
    const isFinal = offset + blockLength >= data.length;
    const header = new Uint8Array(5);
    header[0] = isFinal ? 0x01 : 0x00;
    header[1] = blockLength & 0xff;
    header[2] = (blockLength >> 8) & 0xff;
    const invertedLength = ~blockLength & 0xffff;
    header[3] = invertedLength & 0xff;
    header[4] = (invertedLength >> 8) & 0xff;
    chunks.push(header, data.subarray(offset, offset + blockLength));
    offset += blockLength;
  }

  const checksum = adler32(data);
  const trailer = new Uint8Array(4);
  writeUint32(trailer, 0, checksum);
  chunks.push(trailer);
  return concatBytes(chunks);
}

function createPngChunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(
    chunk,
    chunk.length - 4,
    crc32(chunk.subarray(4, chunk.length - 4)),
  );
  return chunk;
}

function concatBytes(chunks: Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function writeUint32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = (value >>> 24) & 0xff;
  buffer[offset + 1] = (value >>> 16) & 0xff;
  buffer[offset + 2] = (value >>> 8) & 0xff;
  buffer[offset + 3] = value & 0xff;
}

function adler32(data: Uint8Array) {
  let a = 1;
  let b = 0;
  for (let index = 0; index < data.length; index += 1) {
    a = (a + data[index]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index]!;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(function resolveOnNextFrame() {
        resolve();
      });
      return;
    }

    setTimeout(resolve, 0);
  });
}
