import {
  parseLevelJson,
  serializeLevelJson,
  type LevelSelection,
} from "~/editor/helpers/level-json";
import type { EditorLevel } from "~/editor/elma-types";
import type { Apple, Picture, Polygon, Position } from "~/editor/elma-types";
import type { EditorState } from "~/editor/editor-state";

import type { SelectToolState } from "./select-tool";

export type SelectionClipboard = LevelSelection;

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
      const text = serializeLevelJson(this.clipboard);
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
  ): Promise<PastedSelection | { level: EditorLevel } | null> {
    let text: string;
    try {
      if (!canAccessSystemClipboard()) return this.pasteWithMargin();
      text = await navigator.clipboard.readText();
    } catch {
      return this.pasteWithMargin();
    }
    const parsed = parseLevelJson(text);
    if (parsed.kind === "level") return { level: parsed.data };
    const sameCopy =
      text === this.writtenText && currentSessionId === this.sourceSessionId;
    this.clipboard = parsed.data;
    if (!sameCopy) this.pasteCount = 0;
    return sameCopy ? this.pasteWithMargin() : this.pasteAtAnchor(anchor);
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

function clonePosition(position: Position): Position {
  return { x: position.x, y: position.y };
}

function translate(position: Position, offset: Position): Position {
  return { x: position.x + offset.x, y: position.y + offset.y };
}
