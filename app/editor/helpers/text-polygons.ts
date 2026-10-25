import type { Font, PathCommand } from "opentype.js";
import type { Polygon, Position } from "~/editor/elma-types";
import { ELMA_PIXELS_PER_WORLD_UNIT } from "~/editor/constants";

export const textFonts = {
  sans: "Sans",
  serif: "Serif",
  mono: "Mono",
} as const;
export type TextOptions = {
  text: string;
  font: keyof typeof textFonts;
  bold: boolean;
  italic: boolean;
  size: number;
  spacing: number;
  lineHeight: number;
  align: "left" | "center" | "right";
};
export const defaultTextOptions: TextOptions = {
  text: "Text",
  font: "sans",
  bold: false,
  italic: false,
  size: 96,
  spacing: 0,
  lineHeight: 1.3,
  align: "left",
};
const fonts = new Map<string, Promise<Font>>();
export function loadTextFont(options: TextOptions): Promise<Font> {
  const family = {
    sans: "DejaVuSans",
    serif: "DejaVuSerif",
    mono: "DejaVuSansMono",
  }[options.font];
  const file = `${family}${options.bold ? "-Bold" : ""}.ttf`;
  let pending = fonts.get(file);
  if (!pending) {
    pending = fetch(`/fonts/text/${file}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load font. Try again.");
        const [{ parse }, buffer] = await Promise.all([
          import("opentype.js"),
          response.arrayBuffer(),
        ]);
        return parse(buffer);
      })
      .catch((error) => {
        fonts.delete(file);
        throw error;
      });
    fonts.set(file, pending);
  }
  return pending;
}

// Flatten the actual outlines, including counters, rather than tracing a bitmap.
// A fixed em resolution keeps the vertex count independent of placed text size.
export function createTextPolygons(
  font: Font,
  options: TextOptions,
): Polygon[] {
  if (!options.text.trim()) return [];
  if (options.text.length > 120 || options.text.split("\n").length > 4) {
    throw new Error("Use up to 120 characters and 4 lines.");
  }
  const em = 128;
  const scale = options.size / em / ELMA_PIXELS_PER_WORLD_UNIT;
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
  const width = Math.max(...rows.map((row) => row.width));
  const polygons: Polygon[] = [];
  rows.forEach((row, index) => {
    const offset =
      options.align === "center"
        ? (width - row.width) / 2
        : options.align === "right"
          ? width - row.width
          : 0;
    for (const path of row.paths) {
      for (const vertices of flattenContours(path.commands)) {
        polygons.push({
          grass: false,
          vertices: vertices.map(({ x, y }) => ({
            x: (x + offset - (options.italic ? y * 0.2 : 0)) * scale,
            y: (y + index * em * options.lineHeight) * scale,
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
  // The pointer anchors the top-left of the visible text, including italic overhangs.
  const points = polygons.flatMap((polygon) => polygon.vertices);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  return polygons.map((polygon) => ({
    ...polygon,
    vertices: polygon.vertices.map((point) => ({
      x: point.x - minX,
      y: point.y - minY,
    })),
  }));
}

function flattenContours(commands: PathCommand[]): Position[][] {
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
      points.push({ x: command.x, y: command.y });
    } else if (command.type === "L")
      points.push({ x: command.x, y: command.y });
    else if (command.type === "Q" || command.type === "C") {
      const controls = [points.at(-1)!, { x: command.x1, y: command.y1 }];
      if (command.type === "C") controls.push({ x: command.x2, y: command.y2 });
      controls.push({ x: command.x, y: command.y });
      flattenCurve(controls, points);
    } else if (command.type === "Z") finish();
  }
  finish();
  return contours;
}

function flattenCurve(
  controls: Position[],
  output: Position[],
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
      Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy) <= 0.3
    );
  });
  if (flat || depth >= 12) {
    output.push(end);
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
  flattenCurve(left, output, depth + 1);
  flattenCurve(right, output, depth + 1);
}
