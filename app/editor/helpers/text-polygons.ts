import type { Font, PathCommand } from "opentype.js";
import type { Polygon, Position } from "~/editor/elma-types";
import { ELMA_PIXELS_PER_WORLD_UNIT } from "~/editor/constants";
import { defaultTextFontId } from "./text-fonts";

export type TextOptions = {
  text: string;
  fontId: string;
  size: number;
  spacing: number;
  lineHeight: number;
  curveDetail: number;
  align: "left" | "center" | "right";
};
export const MIN_TEXT_CURVE_DETAIL = 1;
export const MAX_TEXT_CURVE_DETAIL = 10;
export const defaultTextOptions: TextOptions = {
  text: "Add text",
  fontId: defaultTextFontId,
  size: 96,
  spacing: 0,
  lineHeight: 1.2,
  curveDetail: 7,
  align: "left",
};

export function getTextLayoutBounds(font: Font, options: TextOptions) {
  const layout = createTextLayout(font, options);
  const scale = options.size / layout.em / ELMA_PIXELS_PER_WORLD_UNIT;
  return {
    width: layout.width * scale,
    height:
      layout.rows.length *
      (options.size / ELMA_PIXELS_PER_WORLD_UNIT) *
      options.lineHeight,
  };
}

export function getTextCaretMetrics(
  font: Font,
  options: TextOptions,
  offset: number,
) {
  const text = options.text.replace(/\r/g, "");
  const beforeCaret = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const lineIndex = beforeCaret.split("\n").length - 1;
  const lineBeforeCaret = beforeCaret.slice(beforeCaret.lastIndexOf("\n") + 1);
  const layout = createTextLayout(font, options);
  const row = layout.rows[lineIndex] ?? layout.rows.at(-1)!;
  const caretAdvance = createTextLayout(font, {
    ...options,
    text: lineBeforeCaret,
  }).rows[0].width;
  const rowOffset =
    options.align === "center"
      ? (layout.width - row.width) / 2
      : options.align === "right"
        ? layout.width - row.width
        : 0;
  const fontSize = options.size / ELMA_PIXELS_PER_WORLD_UNIT;

  return {
    x:
      ((rowOffset + caretAdvance) * options.size) /
      layout.em /
      ELMA_PIXELS_PER_WORLD_UNIT,
    y:
      lineIndex * fontSize * options.lineHeight +
      ((options.lineHeight - 1) * fontSize) / 2,
    height: fontSize,
  };
}

// Flatten the actual outlines, including counters, rather than tracing a bitmap.
// A fixed em resolution keeps the vertex count independent of placed text size.
export function createTextPolygons(
  font: Font,
  options: TextOptions,
): Polygon[] {
  const layout = createTextLayout(font, options);
  if (!options.text.trim()) return [];
  const { em, rows, width } = layout;
  const scale = options.size / em / ELMA_PIXELS_PER_WORLD_UNIT;
  const fontHeight = ((font.ascender - font.descender) * em) / font.unitsPerEm;
  const curveTolerance =
    2.4 * 2 ** (-(options.curveDetail - MIN_TEXT_CURVE_DETAIL) / 3);
  const baseline =
    (options.lineHeight * em - fontHeight) / 2 +
    (font.ascender * em) / font.unitsPerEm;
  const polygons: Polygon[] = [];
  rows.forEach((row, index) => {
    const offset =
      options.align === "center"
        ? (width - row.width) / 2
        : options.align === "right"
          ? width - row.width
          : 0;
    for (const path of row.paths) {
      for (const vertices of flattenContours(path.commands, curveTolerance)) {
        polygons.push({
          grass: false,
          vertices: vertices.map(({ x, y }) => ({
            x: (x + offset) * scale,
            y: (y + baseline + index * em * options.lineHeight) * scale,
          })),
        });
      }
    }
  });
  if (
    polygons.reduce((sum, polygon) => sum + polygon.vertices.length, 0) > 12000
  ) {
    throw new Error("Too many vertices. Try shorter text.");
  }
  return polygons;
}

export function textHasCurves(font: Font, options: TextOptions): boolean {
  return createTextLayout(font, options).rows.some((row) =>
    row.paths.some((path) =>
      path.commands.some(
        (command) => command.type === "Q" || command.type === "C",
      ),
    ),
  );
}

function createTextLayout(font: Font, options: TextOptions) {
  if (options.text.length > 120 || options.text.split("\n").length > 4) {
    throw new Error("Use up to 120 characters and 4 lines.");
  }
  const em = 128;
  const tracking = (options.spacing * em) / options.size;
  const lines = options.text.replace(/\r/g, "").split("\n");
  const rows = lines.map((line) => {
    const glyphs = font.stringToGlyphs(line);
    if (glyphs.some((glyph) => glyph.index === 0)) {
      throw new Error("This font does not support one of these characters.");
    }
    let x = 0;
    const paths = glyphs.map((glyph, index) => {
      const path = glyph.getPath(x, 0, em);
      x += ((glyph.advanceWidth ?? 0) * em) / font.unitsPerEm;
      if (index < glyphs.length - 1) {
        x +=
          (font.getKerningValue(glyph, glyphs[index + 1]) * em) /
            font.unitsPerEm +
          tracking;
      }
      return path;
    });
    return { paths, width: x };
  });
  return {
    em,
    rows,
    width: Math.max(...rows.map((row) => row.width)),
  };
}

function flattenContours(
  commands: PathCommand[],
  curveTolerance: number,
): Position[][] {
  const contours: Position[][] = [];
  let points: Position[] = [];
  const finish = () => {
    if (
      points.length > 1 &&
      points[0].x === points.at(-1)!.x &&
      points[0].y === points.at(-1)!.y
    )
      points.pop();
    if (points.length >= 3) contours.push(points);
    points = [];
  };
  for (const command of commands) {
    if (command.type === "M") {
      finish();
      pushPoint(points, { x: command.x, y: command.y });
    } else if (command.type === "L")
      pushPoint(points, { x: command.x, y: command.y });
    else if (command.type === "Q" || command.type === "C") {
      const controls = [points.at(-1)!, { x: command.x1, y: command.y1 }];
      if (command.type === "C") controls.push({ x: command.x2, y: command.y2 });
      controls.push({ x: command.x, y: command.y });
      flattenCurve(controls, points, curveTolerance);
    } else if (command.type === "Z") finish();
  }
  finish();
  return contours;
}

function pushPoint(points: Position[], point: Position): void {
  const previous = points.at(-1);
  if (previous?.x === point.x && previous.y === point.y) return;
  points.push(point);
}

function flattenCurve(
  controls: Position[],
  output: Position[],
  tolerance: number,
  depth = 0,
): void {
  const start = controls[0],
    end = controls.at(-1)!;
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const flat = controls.slice(1, -1).every((point) => {
    const t = lengthSquared
      ? Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * dx + (point.y - start.y) * dy) /
              lengthSquared,
          ),
        )
      : 0;
    return (
      Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy) <=
      tolerance
    );
  });
  if (flat || depth >= 12) {
    pushPoint(output, end);
    return;
  }
  const left = [start],
    right = [end];
  let row = controls;
  while (row.length > 1) {
    row = row.slice(1).map((point, index) => ({
      x: (point.x + row[index].x) / 2,
      y: (point.y + row[index].y) / 2,
    }));
    left.push(row[0]);
    right.unshift(row.at(-1)!);
  }
  flattenCurve(left, output, tolerance, depth + 1);
  flattenCurve(right, output, tolerance, depth + 1);
}
