import defaultLgr from "../assets/lgr/Default.lgr?url";
import { decodeLgrSpritePixels } from "~/editor/helpers/pcx-loader";
import { ElmaLGR, type AppleAnimation } from "~/editor/elma-types";
import { standardSprites } from "./standard-sprites";

type LoadedSprite = {
  bitmap: ImageBitmap;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  src?: string;
};

export class LgrAssets {
  private lgr: InstanceType<typeof ElmaLGR> | null = null;
  private lgrSprites: Record<string, LoadedSprite> = {};
  private maskedPreviewUrls = new Map<string, string>();

  async load() {
    const buf = await fetch(defaultLgr).then((r) => r.arrayBuffer());
    this.lgr = ElmaLGR.from(new Uint8Array(buf));
    await this.loadAllSprites();
  }

  private normalizeName(name: string) {
    return name
      .trim()
      .toLowerCase()
      .replace(/\.pcx$/, "");
  }

  private async loadAllSprites() {
    if (!this.lgr) return;

    const declarations = new Map(
      this.lgr.pictureList.map((declaration) => [
        this.normalizeName(declaration.name),
        declaration,
      ]),
    );

    for (const picture of this.lgr.pictureData) {
      const name = this.normalizeName(picture.name);
      if (this.lgrSprites[name]) continue;

      const declaration = declarations.get(name);
      const decoded = decodeLgrSpritePixels(picture, declaration);
      const clamped = new Uint8ClampedArray(decoded.pixels.length);
      clamped.set(decoded.pixels);
      const bitmap = await createImageBitmap(
        new ImageData(clamped, decoded.width, decoded.height),
      );
      this.lgrSprites[name] = {
        bitmap,
        pixels: decoded.pixels,
        width: decoded.width,
        height: decoded.height,
      };
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
    const apple1Sprite = this.lgrSprites["qfood1"]?.bitmap;
    const apple2Sprite = this.lgrSprites["qfood2"]?.bitmap;
    return animation > 1 ? apple2Sprite : apple1Sprite;
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
    return !!this.lgr;
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
  }
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
