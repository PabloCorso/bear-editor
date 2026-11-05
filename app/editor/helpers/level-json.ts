import {
  Clip,
  Gravity,
  type Apple,
  type AppleAnimation,
  type EditorLevel,
  type LevelTop10,
  type Picture,
  type Position,
} from "../elma-types";
import { EOL_LEVEL_LIMITS as limits } from "./level-limits";

export type LevelSelection = Pick<
  EditorLevel,
  "polygons" | "apples" | "killers" | "flowers" | "pictures"
>;
export type JsonImport =
  | { kind: "selection"; data: LevelSelection }
  | { kind: "level"; data: EditorLevel };
type Coordinate = [number, number];
type JsonPolygon = { vertices: Coordinate[]; grass?: boolean };
type JsonApple = {
  position: Coordinate;
  animation?: number;
  gravity?: Gravity;
};
export type LevelJson = {
  level?: {
    name?: string;
    lgr?: string;
    ground?: string;
    sky?: string;
    top10?: Partial<LevelTop10>;
  };
  start?: Coordinate;
  polygons?: JsonPolygon[];
  apples?: JsonApple[];
  killers?: Coordinate[];
  flowers?: Coordinate[];
  pictures?: {
    position: Coordinate;
    name?: string;
    texture?: string;
    mask?: string;
    distance?: number;
    clip?: Clip;
  }[];
};

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}
function record(
  value: unknown,
  keys: string[],
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "expected an object");
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result))
    if (!keys.includes(key)) fail(`${path}.${key}`, "unsupported property");
  return result;
}
function number(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(path, "expected a finite number");
  return value;
}
function integer(
  value: unknown,
  min: number,
  max: number,
  path: string,
): number {
  const n = number(value, path);
  if (!Number.isInteger(n) || n < min || n > max)
    fail(path, `expected an integer from ${min} to ${max}`);
  return n;
}
function text(
  value: unknown,
  fallback: string,
  max: number,
  path: string,
): string {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[^\x20-\x7e]/.test(value)
  )
    fail(path, `expected text up to ${max} characters`);
  return value;
}
function position(value: unknown, path: string): Position {
  if (!Array.isArray(value) || value.length !== 2) fail(path, "expected [x,y]");
  return {
    x: number(value[0], `${path}[0]`),
    y: number(value[1], `${path}[1]`),
  };
}
function array<T>(
  value: unknown,
  parse: (item: unknown, path: string) => T,
  path: string,
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value.map((item, i) => parse(item, `${path}[${i}]`));
}

export function assertLevelLimits(data: LevelSelection, hasStart = true): void {
  const checks: [number, number, string][] = [
    [data.polygons.length, limits.polygons, "polygons"],
    [
      data.polygons.reduce((n, p) => n + p.vertices.length, 0),
      limits.vertices,
      "vertices",
    ],
    [
      data.apples.length +
        data.killers.length +
        data.flowers.length +
        Number(hasStart),
      limits.objects,
      "objects",
    ],
    [data.pictures.length, limits.pictures, "pictures"],
  ];
  for (const [count, max, name] of checks)
    if (count > max) fail(name, `Elma limit is ${max} (received ${count})`);
  for (const p of data.polygons)
    if (p.vertices.length > limits.verticesPerPolygon)
      fail("polygon", `maximum ${limits.verticesPerPolygon} vertices`);
}

export function parseLevelJson(source: string): JsonImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(
      "Invalid JSON. Check commas, brackets and quotation marks.",
    );
  }
  const root = record(
    parsed,
    ["level", "start", "polygons", "apples", "killers", "flowers", "pictures"],
    "JSON",
  );
  const data: LevelSelection = {
    polygons: array(
      root.polygons,
      (item, path) => {
        const polygon = record(item, ["vertices", "grass"], path);
        if (polygon.grass !== undefined && typeof polygon.grass !== "boolean")
          fail(path, "grass must be boolean");
        if (!Array.isArray(polygon.vertices))
          fail(path, "vertices are required");
        const vertices = array(polygon.vertices, position, `${path}.vertices`);
        if (vertices.length < (polygon.grass ? 2 : 3))
          fail(path, `requires at least ${polygon.grass ? 2 : 3} vertices`);
        return { vertices, grass: polygon.grass === true };
      },
      "polygons",
    ),
    apples: array(
      root.apples,
      (item, path): Apple => {
        const a = record(item, ["position", "animation", "gravity"], path);
        return {
          position: position(a.position, `${path}.position`),
          animation: integer(
            a.animation === undefined ? 1 : a.animation,
            1,
            9,
            `${path}.animation`,
          ) as AppleAnimation,
          gravity: integer(
            a.gravity === undefined ? 0 : a.gravity,
            0,
            4,
            `${path}.gravity`,
          ),
        };
      },
      "apples",
    ),
    killers: array(root.killers, position, "killers"),
    flowers: array(root.flowers, position, "flowers"),
    pictures: array(
      root.pictures,
      (item, path): Picture => {
        const p = record(
          item,
          ["position", "name", "texture", "mask", "distance", "clip"],
          path,
        );
        return {
          position: position(p.position, `${path}.position`),
          name: text(p.name, "", 10, `${path}.name`),
          texture: text(p.texture, "", 10, `${path}.texture`),
          mask: text(p.mask, "", 10, `${path}.mask`),
          distance: integer(
            p.distance === undefined ? 999 : p.distance,
            -2147483648,
            2147483647,
            `${path}.distance`,
          ),
          clip: integer(
            p.clip === undefined ? Clip.Sky : p.clip,
            0,
            2,
            `${path}.clip`,
          ),
        };
      },
      "pictures",
    ),
  };
  assertLevelLimits(data, root.level !== undefined);
  if (root.level === undefined) {
    if (root.start !== undefined)
      fail(
        "start",
        "requires level metadata; selections cannot replace the start",
      );
    if (!Object.values(data).some((items) => items.length))
      fail("JSON", "selection is empty");
    return { kind: "selection", data };
  }
  const metadata = record(
    root.level,
    ["name", "lgr", "ground", "sky", "top10"],
    "level",
  );
  let top10: LevelTop10 | undefined;
  if (metadata.top10 !== undefined) {
    const times = record(metadata.top10, ["single", "multi"], "level.top10");
    const entries = (value: unknown, path: string) => {
      const result = array(
        value,
        (item, entryPath) => {
          const e = record(item, ["name1", "name2", "time"], entryPath);
          return {
            name1: text(e.name1, "", 15, `${entryPath}.name1`),
            name2: text(e.name2, "", 15, `${entryPath}.name2`),
            time: integer(e.time, 0, 2147483647, `${entryPath}.time`),
          };
        },
        path,
      );
      if (result.length > 10) fail(path, "maximum 10 entries");
      return result;
    };
    top10 = {
      single: entries(times.single, "top10.single"),
      multi: entries(times.multi, "top10.multi"),
    };
  }
  return {
    kind: "level",
    data: {
      ...data,
      start: position(root.start, "start"),
      levelName: text(metadata.name, "", 51, "level.name"),
      lgr: text(metadata.lgr, "default", 16, "level.lgr"),
      ground: text(metadata.ground, "ground", 10, "level.ground"),
      sky: text(metadata.sky, "sky", 10, "level.sky"),
      ...(top10 ? { top10 } : {}),
    },
  };
}

const coordinate = ({ x, y }: Position): Coordinate => [x, y];
export function serializeLevelJson(data: LevelSelection | EditorLevel): string {
  const json: LevelJson = {};
  if ("start" in data) {
    json.level = {};
    if (data.levelName) json.level.name = data.levelName;
    if (data.lgr !== "default") json.level.lgr = data.lgr;
    if (data.ground !== "ground") json.level.ground = data.ground;
    if (data.sky !== "sky") json.level.sky = data.sky;
    if (data.top10 && (data.top10.single.length || data.top10.multi.length))
      json.level.top10 = {
        ...(data.top10.single.length ? { single: data.top10.single } : {}),
        ...(data.top10.multi.length ? { multi: data.top10.multi } : {}),
      };
    json.start = coordinate(data.start);
  }
  if (data.polygons.length)
    json.polygons = data.polygons.map((p) => ({
      vertices: p.vertices.map(coordinate),
      ...(p.grass ? { grass: true } : {}),
    }));
  if (data.apples.length)
    json.apples = data.apples.map((a) => ({
      position: coordinate(a.position),
      ...(a.animation !== 1 ? { animation: a.animation } : {}),
      ...(a.gravity !== Gravity.None ? { gravity: a.gravity } : {}),
    }));
  if (data.killers.length) json.killers = data.killers.map(coordinate);
  if (data.flowers.length) json.flowers = data.flowers.map(coordinate);
  if (data.pictures.length)
    json.pictures = data.pictures.map((p) => ({
      position: coordinate(p.position),
      ...(p.name ? { name: p.name } : {}),
      ...(p.texture ? { texture: p.texture } : {}),
      ...(p.mask ? { mask: p.mask } : {}),
      ...(p.distance !== 999 ? { distance: p.distance } : {}),
      ...(p.clip !== Clip.Sky ? { clip: p.clip } : {}),
    }));
  return JSON.stringify(json);
}
