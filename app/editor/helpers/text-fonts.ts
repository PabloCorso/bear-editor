import type { Font } from "opentype.js";

const DB_NAME = "bear-editor-text-fonts";
const STORE_NAME = "fonts";
const MAX_FONT_BYTES = 20 * 1024 * 1024;

export type TextFontFace = {
  id: string;
  family: string;
  style: string;
  fullName: string;
  source: "built-in" | "imported";
};

type StoredTextFontFace = TextFontFace & { data: ArrayBuffer };

export const builtInTextFonts: readonly TextFontFace[] = [
  {
    id: "quantico-regular",
    family: "Quantico",
    style: "Regular",
    fullName: "Quantico Regular",
    source: "built-in",
  },
  {
    id: "quantico-italic",
    family: "Quantico",
    style: "Italic",
    fullName: "Quantico Italic",
    source: "built-in",
  },
  {
    id: "quantico-bold",
    family: "Quantico",
    style: "Bold",
    fullName: "Quantico Bold",
    source: "built-in",
  },
  {
    id: "quantico-bold-italic",
    family: "Quantico",
    style: "Bold Italic",
    fullName: "Quantico Bold Italic",
    source: "built-in",
  },
  {
    id: "geo-regular",
    family: "Geo",
    style: "Regular",
    fullName: "Geo Regular",
    source: "built-in",
  },
  {
    id: "geo-oblique",
    family: "Geo",
    style: "Oblique",
    fullName: "Geo Oblique",
    source: "built-in",
  },
  {
    id: "chakra-petch-regular",
    family: "Chakra Petch",
    style: "Regular",
    fullName: "Chakra Petch Regular",
    source: "built-in",
  },
  {
    id: "chakra-petch-italic",
    family: "Chakra Petch",
    style: "Italic",
    fullName: "Chakra Petch Italic",
    source: "built-in",
  },
  {
    id: "chakra-petch-bold",
    family: "Chakra Petch",
    style: "Bold",
    fullName: "Chakra Petch Bold",
    source: "built-in",
  },
  {
    id: "chakra-petch-bold-italic",
    family: "Chakra Petch",
    style: "Bold Italic",
    fullName: "Chakra Petch Bold Italic",
    source: "built-in",
  },
  {
    id: "audiowide-regular",
    family: "Audiowide",
    style: "Regular",
    fullName: "Audiowide Regular",
    source: "built-in",
  },
  {
    id: "inter-regular",
    family: "Inter",
    style: "Regular",
    fullName: "Inter Regular",
    source: "built-in",
  },
  {
    id: "inter-italic",
    family: "Inter",
    style: "Italic",
    fullName: "Inter Italic",
    source: "built-in",
  },
  {
    id: "inter-bold",
    family: "Inter",
    style: "Bold",
    fullName: "Inter Bold",
    source: "built-in",
  },
  {
    id: "inter-bold-italic",
    family: "Inter",
    style: "Bold Italic",
    fullName: "Inter Bold Italic",
    source: "built-in",
  },
];

export const defaultTextFontId = builtInTextFonts[0].id;

const builtInFiles: Record<string, string> = {
  "quantico-regular": "/fonts/text/quantico/Quantico-Regular.ttf",
  "quantico-italic": "/fonts/text/quantico/Quantico-Italic.ttf",
  "quantico-bold": "/fonts/text/quantico/Quantico-Bold.ttf",
  "quantico-bold-italic": "/fonts/text/quantico/Quantico-BoldItalic.ttf",
  "geo-regular": "/fonts/text/geo/Geo-Regular.ttf",
  "geo-oblique": "/fonts/text/geo/Geo-Oblique.ttf",
  "chakra-petch-regular": "/fonts/text/chakra-petch/ChakraPetch-Regular.ttf",
  "chakra-petch-italic": "/fonts/text/chakra-petch/ChakraPetch-Italic.ttf",
  "chakra-petch-bold": "/fonts/text/chakra-petch/ChakraPetch-Bold.ttf",
  "chakra-petch-bold-italic":
    "/fonts/text/chakra-petch/ChakraPetch-BoldItalic.ttf",
  "audiowide-regular": "/fonts/text/audiowide/Audiowide-Regular.ttf",
  "inter-regular": "/fonts/text/inter/Inter-Regular.ttf",
  "inter-italic": "/fonts/text/inter/Inter-Italic.ttf",
  "inter-bold": "/fonts/text/inter/Inter-Bold.ttf",
  "inter-bold-italic": "/fonts/text/inter/Inter-BoldItalic.ttf",
};

const fonts = new Map<string, Promise<Font>>();
const previewFamilies = new Map<string, Promise<string>>();

export async function listTextFonts(): Promise<TextFontFace[]> {
  const imported = await loadStoredFonts();
  return [
    ...builtInTextFonts,
    ...imported
      .map(withoutData)
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  ];
}

export function loadTextFont(id: string): Promise<Font> {
  let pending = fonts.get(id);
  if (pending) return pending;

  pending = (async () => {
    const builtInFile = builtInFiles[id];
    if (builtInFile) {
      const response = await fetch(builtInFile);
      if (!response.ok) throw new Error("Could not load font. Try again.");
      return parseFont(await response.arrayBuffer());
    }

    const stored = await loadStoredFont(id);
    if (!stored) throw new Error("Font not found. Import it again.");
    return parseFont(stored.data);
  })().catch((error) => {
    fonts.delete(id);
    throw error;
  });

  fonts.set(id, pending);
  return pending;
}

export function loadTextFontPreviewFamily(id: string): Promise<string> {
  const builtIn = builtInTextFonts.find((font) => font.id === id);
  if (builtIn?.family === "Inter") return Promise.resolve("Inter");

  let pending = previewFamilies.get(id);
  if (pending) return pending;

  pending = (async () => {
    if (builtIn) {
      const file = builtInFiles[id];
      const family = `bear-text-${id}`;
      const style = builtIn.style.toLowerCase();
      const face = await new FontFace(family, `url("${file}")`, {
        style:
          style.includes("italic") || style.includes("oblique")
            ? "italic"
            : "normal",
        weight: style.includes("bold") ? "700" : "400",
      }).load();
      document.fonts.add(face);
      return family;
    }
    const stored = await loadStoredFont(id);
    if (!stored) throw new Error("Font not found. Import it again.");
    const family = `bear-text-${id}`;
    const face = await new FontFace(family, stored.data).load();
    document.fonts.add(face);
    return family;
  })().catch((error) => {
    previewFamilies.delete(id);
    throw error;
  });

  previewFamilies.set(id, pending);
  return pending;
}

export async function importTextFont(file: File): Promise<TextFontFace> {
  if (!/\.(?:otf|ttf|woff)$/i.test(file.name)) {
    throw new Error("Choose a TTF, OTF, or WOFF font file.");
  }
  if (file.size > MAX_FONT_BYTES) {
    throw new Error("Choose a font smaller than 20 MB.");
  }

  const data = await file.arrayBuffer();
  const font = await parseFont(data.slice(0));
  const family = font.getEnglishName("fontFamily") || "Untitled font";
  const style = font.getEnglishName("fontSubfamily") || "Regular";
  const fullName = font.getEnglishName("fullName") || `${family} ${style}`;
  const id = `imported-${await hash(data)}`;
  const face: StoredTextFontFace = {
    id,
    family,
    style,
    fullName,
    source: "imported",
    data,
  };

  await saveStoredFont(face);
  fonts.set(id, Promise.resolve(font));
  previewFamilies.delete(id);
  return withoutData(face);
}

async function parseFont(data: ArrayBuffer): Promise<Font> {
  try {
    const { parse } = await import("opentype.js");
    return parse(data);
  } catch {
    throw new Error("Could not read this font file.");
  }
}

function withoutData({
  data: _data,
  ...face
}: StoredTextFontFace): TextFontFace {
  return face;
}

async function hash(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function loadStoredFonts(): Promise<StoredTextFontFace[]> {
  if (!isClient()) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadStoredFont(id: string): Promise<StoredTextFontFace | null> {
  if (!isClient()) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function saveStoredFont(font: StoredTextFontFace): Promise<void> {
  if (!isClient()) throw new Error("This browser cannot save imported fonts.");
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.objectStore(STORE_NAME).put(font, font.id);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
  });
}

function isClient() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}
