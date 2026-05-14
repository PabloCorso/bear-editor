import type { PictureData } from "elmajs";

type DecodedPcx = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

export type DecodedSprite = DecodedPcx;

const PCX_HEADER_SIZE = 128;
const VGA_PALETTE_SIZE = 769; // 0x0C marker + 256 * 3 bytes

function decodePcx(pcx: Uint8Array): DecodedPcx {
  if (pcx.length < PCX_HEADER_SIZE + VGA_PALETTE_SIZE) {
    throw new Error("PCX buffer too small");
  }

  const dataView = new DataView(pcx.buffer, pcx.byteOffset, pcx.byteLength);
  const manufacturer = dataView.getUint8(0);
  const _version = dataView.getUint8(1);
  const encoding = dataView.getUint8(2);
  const bitsPerPixel = dataView.getUint8(3);

  if (manufacturer !== 0x0a || encoding !== 1 || bitsPerPixel !== 8) {
    throw new Error("Unsupported PCX format (expected 8-bit RLE)");
  }

  const xMin = dataView.getUint16(4, true);
  const yMin = dataView.getUint16(6, true);
  const xMax = dataView.getUint16(8, true);
  const yMax = dataView.getUint16(10, true);
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  const bytesPerLine = dataView.getUint16(66, true);
  const planes = dataView.getUint8(65);

  if (planes !== 1) {
    throw new Error("Unsupported PCX planes (expected 1)");
  }

  const paletteMarkerIndex = pcx.length - VGA_PALETTE_SIZE;
  if (pcx[paletteMarkerIndex] !== 0x0c) {
    throw new Error("Missing VGA palette marker in PCX");
  }

  // Decode RLE pixel indices
  const decoded = new Uint8Array(bytesPerLine * height);
  let src = PCX_HEADER_SIZE;
  let dst = 0;

  while (dst < decoded.length && src < paletteMarkerIndex) {
    const value = pcx[src++];
    if ((value & 0xc0) === 0xc0) {
      const runLength = value & 0x3f;
      const data = pcx[src++];
      decoded.fill(data, dst, dst + runLength);
      dst += runLength;
    } else {
      decoded[dst++] = value;
    }
  }

  if (dst < decoded.length) {
    throw new Error("PCX RLE decode ended early");
  }

  // Build RGBA buffer from palette + indices
  const palette = pcx.subarray(
    paletteMarkerIndex + 1,
    paletteMarkerIndex + VGA_PALETTE_SIZE,
  );
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const lineOffset = y * bytesPerLine;
    for (let x = 0; x < width; x++) {
      const idx = decoded[lineOffset + x];
      const palOffset = idx * 3;
      const outOffset = (y * width + x) * 4;
      const r = palette[palOffset];
      const g = palette[palOffset + 1];
      const b = palette[palOffset + 2];
      pixels[outOffset] = r;
      pixels[outOffset + 1] = g;
      pixels[outOffset + 2] = b;
      pixels[outOffset + 3] = 255;
    }
  }

  return { width, height, pixels };
}

type TransparencyMode = 10 | 11 | 12 | 13 | 14 | 15;

type DecodePcxOptions = {
  forceOpaque?: boolean;
  transparencyMode?: TransparencyMode;
};

function applyTransparency(
  pixels: Uint8ClampedArray,
  paletteIndices: Uint8Array,
  width: number,
  height: number,
  bytesPerLine: number,
  mode: TransparencyMode,
) {
  if (mode === 10) {
    return;
  }

  let transparentIndex = 0;
  if (mode === 11) {
    transparentIndex = 0;
  } else if (mode === 12) {
    transparentIndex = paletteIndices[0];
  } else if (mode === 13) {
    transparentIndex = paletteIndices[width - 1];
  } else if (mode === 14) {
    transparentIndex = paletteIndices[(height - 1) * bytesPerLine];
  } else if (mode === 15) {
    transparentIndex =
      paletteIndices[(height - 1) * bytesPerLine + (width - 1)];
  }

  for (let y = 0; y < height; y++) {
    const lineOffset = y * bytesPerLine;
    for (let x = 0; x < width; x++) {
      const idx = paletteIndices[lineOffset + x];
      if (idx === transparentIndex) {
        const outOffset = (y * width + x) * 4;
        pixels[outOffset + 3] = 0;
      }
    }
  }
}

function decodePcxWithOptions(pcx: Uint8Array, options: DecodePcxOptions = {}) {
  const decoded = decodePcx(pcx);
  const { forceOpaque, transparencyMode } = options;

  if (forceOpaque || transparencyMode === undefined) {
    return decoded;
  }

  // Re-decode palette indices needed for transparency mode handling.
  const dataView = new DataView(pcx.buffer, pcx.byteOffset, pcx.byteLength);
  const xMin = dataView.getUint16(4, true);
  const yMin = dataView.getUint16(6, true);
  const xMax = dataView.getUint16(8, true);
  const yMax = dataView.getUint16(10, true);
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  const bytesPerLine = dataView.getUint16(66, true);
  const paletteMarkerIndex = pcx.length - VGA_PALETTE_SIZE;

  const indices = new Uint8Array(bytesPerLine * height);
  let src = PCX_HEADER_SIZE;
  let dst = 0;
  while (dst < indices.length && src < paletteMarkerIndex) {
    const value = pcx[src++];
    if ((value & 0xc0) === 0xc0) {
      const runLength = value & 0x3f;
      const data = pcx[src++];
      indices.fill(data, dst, dst + runLength);
      dst += runLength;
    } else {
      indices[dst++] = value;
    }
  }

  applyTransparency(
    decoded.pixels,
    indices,
    width,
    height,
    bytesPerLine,
    transparencyMode,
  );
  return decoded;
}

function pcxToImageBitmap(decodedPcx: DecodedPcx) {
  // Clone into a new buffer (ensures ArrayBuffer, not SharedArrayBuffer).
  const clamped = new Uint8ClampedArray(decodedPcx.pixels.length);
  clamped.set(decodedPcx.pixels);
  const imageData = new ImageData(clamped, decodedPcx.width, decodedPcx.height);
  return createImageBitmap(imageData);
}

export function decodeLgrSpritePixels(
  picture: PictureData,
  declaration?: PictureDeclarationLike,
) {
  const normalizedName = picture.name.trim().toLowerCase();
  const bytes = new Uint8Array(
    picture.data.buffer,
    picture.data.byteOffset,
    picture.data.byteLength,
  );
  const isGrassTexture = normalizedName === "qgrass";
  const isGrassSprite =
    normalizedName.startsWith("qup_") || normalizedName.startsWith("qdown_");
  const isTexture = isGrassTexture || declaration?.pictureType === 101;
  const transparencyMode = isTexture
    ? undefined
    : ((isGrassSprite
        ? 12
        : (declaration?.transparency ?? 12)) as TransparencyMode);

  return decodePcxWithOptions(bytes, {
    forceOpaque: isTexture,
    transparencyMode,
  });
}

export async function decodeLgrSprite(picture: PictureData) {
  const bytes = new Uint8Array(
    picture.data.buffer,
    picture.data.byteOffset,
    picture.data.byteLength,
  );
  const decodedPcx = decodePcx(bytes);
  return pcxToImageBitmap(decodedPcx);
}

type PictureDeclarationLike = {
  pictureType?: number;
  transparency?: number;
};

export async function decodeLgrSpriteWithDeclaration(
  picture: PictureData,
  declaration?: PictureDeclarationLike,
) {
  return pcxToImageBitmap(decodeLgrSpritePixels(picture, declaration));
}
