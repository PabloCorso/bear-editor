import defaultLgr from "../assets/lgr/Default.lgr?url";
import { decodeLgrSpritePixels } from "~/editor/helpers/pcx-loader";
import { Clip, ElmaLGR, Mask, type AppleAnimation } from "~/editor/elma-types";
import { standardSprites } from "./standard-sprites";
import type { DecodedLgrSprite, WorkerResponse } from "./lgr-assets.worker";

type LoadedSprite = {
  declaration?: DecodedLgrSprite["declaration"];
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
    const response = await fetch(defaultLgr);
    const buf = await response.arrayBuffer();
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
        declaration: sprite.declaration,
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

  private getPictures() {
    const pictures = new Map(standardSprites.pictures.map((p) => [p.name, p]));
    for (const [name, sprite] of Object.entries(this.lgrSprites)) {
      const declaration = sprite.declaration;
      if (
        declaration?.pictureType !== 100 ||
        /^(q[12]|qfood|qup_|qdown_|qgrass$|qkiller$|qexit$|qflag$|qframe$|qcolors$)/i.test(
          name,
        )
      )
        continue;
      pictures.set(name, {
        name,
        distance: declaration.distance,
        clip: declaration.clipping as Clip,
      });
    }
    return [...pictures.values()];
  }

  getPictureSprites() {
    return this.getPictures()
      .filter((p) => !/^zz[0-9a-f]{6}$/i.test(p.name))
      .map((picture) => ({
        picture,
        sprite: this.getSprite(picture.name),
        src: this.getSpritePreview(picture.name),
      }));
  }

  getTextureSprites() {
    const textures = new Map(
      standardSprites.textures.map((t) => [t.texture, t]),
    );
    for (const [name, sprite] of Object.entries(this.lgrSprites)) {
      const declaration = sprite.declaration;
      if (declaration?.pictureType !== 101) continue;
      textures.set(name, {
        texture: name,
        mask: Mask.Big,
        distance: declaration.distance,
        clip: declaration.clipping as Clip,
      });
    }
    return [...textures.values()].map((texture) => ({
      texture,
      sprite: this.getSprite(texture.texture),
      src: this.getSpritePreview(texture.texture),
    }));
  }

  getTextureMasks(): string[] {
    return [
      ...new Set<string>([
        ...standardSprites.textureMasks,
        ...Object.entries(this.lgrSprites)
          .filter(([, sprite]) => sprite.declaration?.pictureType === 102)
          .map(([name]) => name),
      ]),
    ];
  }

  getTextureMaskSprites() {
    const textureSprites = this.getTextureSprites();

    return textureSprites.flatMap(({ texture }) =>
      this.getTextureMasks().map((mask) => ({
        texture,
        mask,
        maskSprite: this.getSprite(mask),
        src: this.getSpritePreview(texture.texture),
        maskedSrc: this.getMaskedTexturePreview(texture.texture, mask),
      })),
    );
  }

  getColorSprites() {
    return this.getPictures()
      .filter((picture) => /^zz[0-9a-f]{6}$/i.test(picture.name))
      .map((picture) => {
        const sprite = this.lgrSprites[picture.name];
        const pixels = sprite.pixels;
        let color = "transparent";
        let rgb: [number, number, number] = [0, 0, 0];
        for (let i = 0; i < pixels.length; i += 4) {
          if (!pixels[i + 3]) continue;
          rgb = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
          color = `rgb(${pixels[i]} ${pixels[i + 1]} ${pixels[i + 2]})`;
          break;
        }
        return {
          picture,
          color,
          rgb,
          width: sprite.width,
          height: sprite.height,
        };
      });
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
      declaration,
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

function createImageUrlFromRgba({
  width,
  height,
  pixels,
}: {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}) {
  if (typeof document === "undefined") return undefined;

  // Native PNG encoding avoids building and checksumming large uncompressed
  // PNGs in JavaScript when a picker first requests many sprite previews.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  const image = context.createImageData(width, height);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
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
