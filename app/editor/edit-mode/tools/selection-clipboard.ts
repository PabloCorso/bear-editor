import {
  Clip,
  Gravity,
  type Apple,
  type AppleAnimation,
  type Picture,
  type Polygon,
  type Position,
} from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";
import { EOL_LEVEL_LIMITS } from "~/editor/helpers/level-limits";

import type { SelectToolState } from "./select-tool";

export type SelectionClipboard = {
  polygons: Polygon[];
  apples: Apple[];
  killers: Position[];
  flowers: Position[];
  pictures: Picture[];
};

export type PastedSelection = SelectionClipboard & {
  selectedVertices: SelectToolState["selectedVertices"];
  selectedObjects: Position[];
  selectedPictures: Position[];
};

export class SelectionClipboardController {
  private clipboard: SelectionClipboard | null = null;
  private pasteCount = 0;
  private writtenText: string | null = null;
  private sourceSessionId: string | null = null;

  canCopy(state: EditorState, selection: SelectToolState): boolean {
    return Boolean(buildSelectionClipboard(state, selection));
  }

  copy(state: EditorState, selection: SelectToolState): boolean {
    const clipboard = buildSelectionClipboard(state, selection);
    if (!clipboard) return false;
    this.clipboard = clipboard;
    this.pasteCount = 0;
    return true;
  }

  canPaste(): boolean {
    return this.clipboard !== null || canAccessSystemClipboard();
  }

  duplicate(
    state: EditorState,
    selection: SelectToolState,
  ): PastedSelection | null {
    return this.copy(state, selection) ? this.pasteWithMargin() : null;
  }

  async copyToSystemClipboard(sourceSessionId: string): Promise<void> {
    if (!this.clipboard || !canAccessSystemClipboard()) return;
    try {
      const text = serializeClipboard(this.clipboard);
      await navigator.clipboard.writeText(text);
      this.writtenText = text;
      this.sourceSessionId = sourceSessionId;
    } catch {
      // Browser clipboard access can fail if permissions or context are missing.
    }
  }

  async readForPaste(
    anchor: Position,
    currentSessionId: string,
  ): Promise<PastedSelection | null> {
    let text: string;
    try {
      if (!canAccessSystemClipboard()) return this.pasteWithMargin();
      text = await navigator.clipboard.readText();
    } catch {
      return this.pasteWithMargin();
    }
    const clipboard = deserializeClipboard(text);
    if (!clipboard) return null;
    const sameCopy =
      text === this.writtenText && currentSessionId === this.sourceSessionId;
    this.clipboard = clipboard;
    if (!sameCopy) this.pasteCount = 0;
    return sameCopy ? this.pasteWithMargin() : this.pasteAtAnchor(anchor);
  }

  /** Read the source for Replace without consuming the clipboard or advancing
   * normal Paste's offset. An accessible but invalid system clipboard is not
   * silently replaced by stale in-memory content.
   */
  async readForReplacement(): Promise<SelectionClipboard | null> {
    if (!canAccessSystemClipboard()) return this.clipboard;
    try {
      const text = await navigator.clipboard.readText();
      return deserializeClipboard(text);
    } catch {
      return this.clipboard;
    }
  }

  private pasteWithMargin(): PastedSelection | null {
    if (!this.clipboard) return null;
    const step = this.pasteCount + 1;
    const pasted = translateClipboard(this.clipboard, { x: step, y: step });
    if (pasted) this.pasteCount = step;
    return pasted;
  }

  private pasteAtAnchor(anchor: Position): PastedSelection | null {
    if (!this.clipboard) return null;
    const center = getClipboardCenter(this.clipboard);
    return center
      ? translateClipboard(this.clipboard, {
          x: anchor.x - center.x,
          y: anchor.y - center.y,
        })
      : null;
  }
}

export function buildSelectionClipboard(
  state: EditorState,
  selection: SelectToolState,
): SelectionClipboard | null {
  const polygonSelections = new Map<Polygon, Set<Position>>();
  for (const { polygon, vertex } of selection.selectedVertices) {
    const selected = polygonSelections.get(polygon) ?? new Set<Position>();
    selected.add(vertex);
    polygonSelections.set(polygon, selected);
  }

  const polygons = Array.from(polygonSelections.entries())
    .map(([polygon, selected]) => {
      const vertices = polygon.vertices
        .filter((vertex) => selected.has(vertex))
        .map(clonePosition);
      return vertices.length >= 3 ? { ...polygon, vertices } : null;
    })
    .filter((polygon): polygon is Polygon => polygon !== null);
  const apples = selection.selectedObjects
    .map((object) => state.apples.find((apple) => apple.position === object))
    .filter((apple): apple is Apple => apple !== undefined)
    .map((apple) => ({ ...apple, position: clonePosition(apple.position) }));
  const killers = selection.selectedObjects
    .filter((object) => state.killers.includes(object))
    .map(clonePosition);
  const flowers = selection.selectedObjects
    .filter((object) => state.flowers.includes(object))
    .map(clonePosition);
  const pictures = selection.selectedPictures
    .map((position) =>
      state.pictures.find((picture) => picture.position === position),
    )
    .filter((picture): picture is Picture => picture !== undefined)
    .map((picture) => ({
      ...picture,
      position: clonePosition(picture.position),
    }));

  return polygons.length ||
    apples.length ||
    killers.length ||
    flowers.length ||
    pictures.length
    ? { polygons, apples, killers, flowers, pictures }
    : null;
}

export function translateClipboard(
  clipboard: SelectionClipboard,
  offset: Position,
): PastedSelection | null {
  const polygons = clipboard.polygons.map((polygon) => ({
    ...polygon,
    vertices: polygon.vertices.map((vertex) => translate(vertex, offset)),
  }));
  const apples = clipboard.apples.map((apple) => ({
    ...apple,
    position: translate(apple.position, offset),
  }));
  const killers = clipboard.killers.map((killer) => translate(killer, offset));
  const flowers = clipboard.flowers.map((flower) => translate(flower, offset));
  const pictures = clipboard.pictures.map((picture) => ({
    ...picture,
    position: translate(picture.position, offset),
  }));

  if (
    !polygons.length &&
    !apples.length &&
    !killers.length &&
    !flowers.length &&
    !pictures.length
  ) {
    return null;
  }

  return {
    polygons,
    apples,
    killers,
    flowers,
    pictures,
    selectedVertices: polygons.flatMap((polygon) =>
      polygon.vertices.map((vertex) => ({ polygon, vertex })),
    ),
    selectedObjects: [
      ...apples.map((apple) => apple.position),
      ...killers,
      ...flowers,
    ],
    selectedPictures: pictures.map((picture) => picture.position),
  };
}

export function getClipboardCenter(
  clipboard: SelectionClipboard,
): Position | null {
  const positions = [
    ...clipboard.polygons.flatMap((polygon) => polygon.vertices),
    ...clipboard.apples.map((apple) => apple.position),
    ...clipboard.killers,
    ...clipboard.flowers,
    ...clipboard.pictures.map((picture) => picture.position),
  ];
  if (!positions.length) return null;

  const bounds = positions.reduce(
    (result, position) => ({
      minX: Math.min(result.minX, position.x),
      maxX: Math.max(result.maxX, position.x),
      minY: Math.min(result.minY, position.y),
      maxY: Math.max(result.maxY, position.y),
    }),
    {
      minX: positions[0].x,
      maxX: positions[0].x,
      minY: positions[0].y,
      maxY: positions[0].y,
    },
  );
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

export function canAccessSystemClipboard(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.readText === "function" &&
    typeof navigator.clipboard?.writeText === "function"
  );
}

export function serializeClipboard(clipboard: SelectionClipboard): string {
  return JSON.stringify({
    ...(clipboard.polygons.length
      ? {
          polygons: clipboard.polygons.map((polygon) => ({
            vertices: polygon.vertices.map(({ x, y }) => [x, y]),
            ...(polygon.grass ? { grass: true } : {}),
          })),
        }
      : {}),
    ...(clipboard.apples.length
      ? {
          apples: clipboard.apples.map((apple) => ({
            position: [apple.position.x, apple.position.y],
            ...(apple.animation !== 1 ? { animation: apple.animation } : {}),
            ...(apple.gravity !== Gravity.None
              ? { gravity: apple.gravity }
              : {}),
          })),
        }
      : {}),
    ...(clipboard.killers.length
      ? { killers: clipboard.killers.map(({ x, y }) => [x, y]) }
      : {}),
    ...(clipboard.flowers.length
      ? { flowers: clipboard.flowers.map(({ x, y }) => [x, y]) }
      : {}),
    ...(clipboard.pictures.length
      ? {
          pictures: clipboard.pictures.map((picture) => ({
            position: [picture.position.x, picture.position.y],
            ...(picture.name ? { name: picture.name } : {}),
            ...(picture.texture ? { texture: picture.texture } : {}),
            ...(picture.mask ? { mask: picture.mask } : {}),
            ...(picture.distance !== 999 ? { distance: picture.distance } : {}),
            ...(picture.clip !== Clip.Sky ? { clip: picture.clip } : {}),
          })),
        }
      : {}),
  });
}

export function deserializeClipboard(text: string): SelectionClipboard | null {
  try {
    const root = parseRecord(JSON.parse(text), [
      "polygons",
      "apples",
      "killers",
      "flowers",
      "pictures",
    ]);
    const clipboard: SelectionClipboard = {
      polygons: parseArray(root.polygons, (value) => {
        const polygon = parseRecord(value, ["vertices", "grass"]);
        if (polygon.grass !== undefined && typeof polygon.grass !== "boolean")
          throw new Error();
        const grass = polygon.grass === true;
        const vertices = parseArray(polygon.vertices, parsePosition, false);
        if (vertices.length < 3) throw new Error();
        return { grass, vertices };
      }),
      apples: parseArray(root.apples, (value): Apple => {
        const apple = parseRecord(value, ["position", "animation", "gravity"]);
        return {
          position: parsePosition(apple.position),
          animation: parseInteger(apple.animation ?? 1, 1, 9) as AppleAnimation,
          gravity: parseInteger(apple.gravity ?? 0, 0, 4) as Gravity,
        };
      }),
      killers: parseArray(root.killers, parsePosition),
      flowers: parseArray(root.flowers, parsePosition),
      pictures: parseArray(root.pictures, (value): Picture => {
        const picture = parseRecord(value, [
          "position",
          "name",
          "texture",
          "mask",
          "distance",
          "clip",
        ]);
        return {
          position: parsePosition(picture.position),
          name: parseText(picture.name, "", 10),
          texture: parseText(picture.texture, "", 10),
          mask: parseText(picture.mask, "", 10),
          distance: parseInteger(
            picture.distance ?? 999,
            -2147483648,
            2147483647,
          ),
          clip: parseInteger(picture.clip ?? Clip.Sky, 0, 2) as Clip,
        };
      }),
    };
    if (!Object.values(clipboard).some((items) => items.length)) return null;
    if (!isWithinLevelLimits(clipboard)) return null;
    return clipboard;
  } catch {
    return null;
  }
}

function clonePosition(position: Position): Position {
  return { x: position.x, y: position.y };
}

function translate(position: Position, offset: Position): Position {
  return { x: position.x + offset.x, y: position.y + offset.y };
}

function parseRecord(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key))) throw new Error();
  return record;
}

function parseArray<T>(
  value: unknown,
  parseItem: (item: unknown) => T,
  optional = true,
): T[] {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) throw new Error();
  return value.map(parseItem);
}

function parsePosition(value: unknown): Position {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some(
      (coordinate) =>
        !(typeof coordinate === "number" && Number.isFinite(coordinate)),
    )
  )
    throw new Error();
  return { x: value[0], y: value[1] };
}

function parseInteger(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error();
  return value;
}

function parseText(
  value: unknown,
  fallback: string,
  maxLength: number,
): string {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    /[^\x20-\x7e]/.test(value)
  )
    throw new Error();
  return value;
}

function isWithinLevelLimits(clipboard: SelectionClipboard): boolean {
  const vertices = clipboard.polygons.reduce(
    (count, polygon) => count + polygon.vertices.length,
    0,
  );
  const objects =
    clipboard.apples.length +
    clipboard.killers.length +
    clipboard.flowers.length;
  return (
    clipboard.polygons.length <= EOL_LEVEL_LIMITS.polygons &&
    vertices <= EOL_LEVEL_LIMITS.vertices &&
    clipboard.polygons.every(
      (polygon) =>
        polygon.vertices.length <= EOL_LEVEL_LIMITS.verticesPerPolygon,
    ) &&
    objects <= EOL_LEVEL_LIMITS.objects &&
    clipboard.pictures.length <= EOL_LEVEL_LIMITS.pictures
  );
}
