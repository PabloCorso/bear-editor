import type { Apple, Picture, Polygon, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";

import type { SelectToolState } from "./select-tool";

const CLIPBOARD_TYPE = "elma-selection";
const CLIPBOARD_VERSION = 1;

export type SelectionClipboard = {
  polygons: Polygon[];
  apples: Apple[];
  killers: Position[];
  flowers: Position[];
  pictures: Picture[];
};

type SerializedSelectionClipboard = {
  type: typeof CLIPBOARD_TYPE;
  version: typeof CLIPBOARD_VERSION;
  sourceClipboardSessionId: string;
  payload: SelectionClipboard;
};

export type PastedSelection = SelectionClipboard & {
  selectedVertices: SelectToolState["selectedVertices"];
  selectedObjects: Position[];
  selectedPictures: Position[];
};

export class SelectionClipboardController {
  private clipboard: SelectionClipboard | null = null;
  private pasteCount = 0;

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
      await navigator.clipboard.writeText(
        serializeClipboard(this.clipboard, sourceSessionId),
      );
    } catch {
      // Browser clipboard access can fail if permissions or context are missing.
    }
  }

  async readForPaste(
    anchor: Position,
    currentSessionId: string,
  ): Promise<PastedSelection | null> {
    if (canAccessSystemClipboard()) {
      try {
        const serialized = deserializeClipboard(
          await navigator.clipboard.readText(),
        );
        if (serialized) {
          this.clipboard = serialized.payload;
          this.pasteCount = 0;
          return serialized.sourceClipboardSessionId === currentSessionId
            ? this.pasteWithMargin()
            : this.pasteAtAnchor(anchor);
        }
      } catch {
        // Fall back to the in-memory clipboard when system reads fail.
      }
    }
    return this.pasteAtAnchor(anchor);
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
      return vertices.length >= (polygon.grass ? 2 : 3)
        ? { ...polygon, vertices }
        : null;
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

export function serializeClipboard(
  clipboard: SelectionClipboard,
  sourceClipboardSessionId: string,
): string {
  const serialized: SerializedSelectionClipboard = {
    type: CLIPBOARD_TYPE,
    version: CLIPBOARD_VERSION,
    sourceClipboardSessionId,
    payload: clipboard,
  };
  return JSON.stringify(serialized);
}

export function deserializeClipboard(
  text: string,
): SerializedSelectionClipboard | null {
  try {
    const value = JSON.parse(text) as Partial<SerializedSelectionClipboard>;
    if (
      value.type !== CLIPBOARD_TYPE ||
      value.version !== CLIPBOARD_VERSION ||
      typeof value.sourceClipboardSessionId !== "string" ||
      !isSelectionClipboard(value.payload)
    ) {
      return null;
    }
    return {
      type: CLIPBOARD_TYPE,
      version: CLIPBOARD_VERSION,
      sourceClipboardSessionId: value.sourceClipboardSessionId,
      payload: value.payload,
    };
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

function isSelectionClipboard(value: unknown): value is SelectionClipboard {
  return (
    isRecord(value) &&
    isPolygonArray(value.polygons) &&
    isAppleArray(value.apples) &&
    isPositionArray(value.killers) &&
    isPositionArray(value.flowers) &&
    isPictureArray(value.pictures)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

function isPositionArray(value: unknown): value is Position[] {
  return Array.isArray(value) && value.every(isPosition);
}

function isPolygon(value: unknown): value is Polygon {
  return (
    isRecord(value) &&
    typeof value.grass === "boolean" &&
    isPositionArray(value.vertices) &&
    value.vertices.length >= (value.grass ? 2 : 3)
  );
}

function isPolygonArray(value: unknown): value is Polygon[] {
  return Array.isArray(value) && value.every(isPolygon);
}

function isApple(value: unknown): value is Apple {
  return (
    isRecord(value) &&
    isPosition(value.position) &&
    typeof value.animation === "number" &&
    Number.isInteger(value.animation) &&
    value.animation >= 1 &&
    value.animation <= 9 &&
    typeof value.gravity === "number"
  );
}

function isAppleArray(value: unknown): value is Apple[] {
  return Array.isArray(value) && value.every(isApple);
}

function isPicture(value: unknown): value is Picture {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.texture === "string" &&
    typeof value.mask === "string" &&
    isPosition(value.position) &&
    typeof value.distance === "number" &&
    Number.isFinite(value.distance) &&
    typeof value.clip === "number"
  );
}

function isPictureArray(value: unknown): value is Picture[] {
  return Array.isArray(value) && value.every(isPicture);
}
