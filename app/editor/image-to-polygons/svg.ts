import { SVGPathData } from "svg-pathdata";
import type { Position } from "../elma-types";
import { luminance } from "./pixels";
import type { Ring, Shape } from "./types";

function midpoint(a: Position, b: Position): Position {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Adaptive de Casteljau subdivision keeps small curves detailed without
// sampling long straight sections at a fixed interval.
function flattenCurve(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
  tolerance: number,
  output: Ring,
  depth = 0,
) {
  const dx = d.x - a.x,
    dy = d.y - a.y;
  const length = Math.hypot(dx, dy);
  const distance = (p: Position) =>
    length
      ? Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / length
      : Math.hypot(p.x - a.x, p.y - a.y);
  // Also bound control-polygon excess to preserve cusps and collinear reversals.
  const excess =
    Math.hypot(b.x - a.x, b.y - a.y) +
    Math.hypot(c.x - b.x, c.y - b.y) +
    Math.hypot(d.x - c.x, d.y - c.y) -
    length;
  if (
    depth >= 16 ||
    (Math.max(distance(b), distance(c)) <= tolerance && excess <= tolerance)
  ) {
    output.push(d);
    return;
  }
  const ab = midpoint(a, b),
    bc = midpoint(b, c),
    cd = midpoint(c, d);
  const abc = midpoint(ab, bc),
    bcd = midpoint(bc, cd),
    center = midpoint(abc, bcd);
  flattenCurve(a, ab, abc, center, tolerance, output, depth + 1);
  flattenCurve(center, bcd, cd, d, tolerance, output, depth + 1);
}

export function flattenPath(path: string, tolerance: number): Shape {
  const commands = new SVGPathData(path)
    .toAbs()
    .normalizeHVZ(false, true, true)
    .normalizeST()
    .qtToC()
    .aToC().commands;
  const rings: Shape = [];
  let ring: Ring = [],
    current = { x: 0, y: 0 };
  const finish = () => {
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };
  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO) {
      finish();
      current = { x: command.x, y: command.y };
      ring.push(current);
    } else if (command.type === SVGPathData.LINE_TO) {
      current = { x: command.x, y: command.y };
      ring.push(current);
    } else if (command.type === SVGPathData.CURVE_TO) {
      const end = { x: command.x, y: command.y };
      flattenCurve(
        current,
        { x: command.x1, y: command.y1 },
        { x: command.x2, y: command.y2 },
        end,
        tolerance,
        ring,
      );
      current = end;
    } else if (command.type === SVGPathData.CLOSE_PATH) {
      finish();
    } else {
      throw new Error("Unsupported tracer path command.");
    }
  }
  finish();
  return rings;
}

// Only consumes SVG emitted by the bundled tracers, never user-supplied SVG.
// Those emit path elements, RGB/hex fills and (VTracer) translate transforms.
export function shapesFromSvg(
  svg: string,
  threshold: number,
  tolerance: number,
): Shape[] {
  const shapes: Shape[] = [];
  for (const match of svg.matchAll(/<path\b([^>]+)>/g)) {
    const attrs = Object.fromEntries(
      Array.from(match[1].matchAll(/([\w-]+)="([^"]*)"/g), (m) => [m[1], m[2]]),
    );
    if (!attrs.d || attrs.fill === "none") continue;
    const color = attrs.fill ?? "#000000";
    const rgb = color.startsWith("#")
      ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
      : (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    if (rgb.length !== 3 || rgb.some((v) => !Number.isFinite(v)))
      throw new Error("Unsupported tracer color.");
    if (luminance(rgb[0], rgb[1], rgb[2]) >= threshold) continue;
    const offset = attrs.transform?.match(
      /^translate\(([-\d.e+]+)[ ,]+([-\d.e+]+)\)$/i,
    );
    if (attrs.transform && !offset)
      throw new Error("Unsupported tracer transform.");
    const rings = flattenPath(attrs.d, tolerance).map((ring) =>
      ring.map((p) => ({
        x: p.x + Number(offset?.[1] ?? 0),
        y: p.y + Number(offset?.[2] ?? 0),
      })),
    );
    if (rings.length) shapes.push(rings);
  }
  return shapes;
}
