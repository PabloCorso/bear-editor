import type { EditorLevel } from "~/editor/elma-types";
import { getBuiltinLevel } from "~/editor/helpers/level-parser";
import type { Demo, DemoCommand } from "./commands";
import type { Position } from "~/editor/elma-types";

function fromBottomLeft(vertices: Position[]): Position[] {
  const minX = Math.min(...vertices.map((vertex) => vertex.x));
  const maxX = Math.max(...vertices.map((vertex) => vertex.x));
  const leftEdge = minX + (maxX - minX) * 0.01;
  // Start at the lower-left corner and trace the playable floor left to right.
  const index = vertices.reduce(
    (best, vertex, index) =>
      vertex.x <= leftEdge &&
      (vertices[best].x > leftEdge || vertex.y > vertices[best].y)
        ? index
        : best,
    0,
  );
  const next = vertices[(index + 1) % vertices.length];
  const previous = vertices[(index - 1 + vertices.length) % vertices.length];
  const direction = next.x >= previous.x ? 1 : -1;
  return vertices.map(
    (_, step) =>
      vertices[(index + step * direction + vertices.length) % vertices.length],
  );
}

export async function loadQwquu001Demo(): Promise<Demo> {
  const target = await getBuiltinLevel("QWQUU001.lev");
  // Start with empty terrain and the two required objects, ready to move.
  const initial: EditorLevel = {
    ...target,
    levelName: "Untitled",
    top10: undefined,
    polygons: [],
    apples: [],
    killers: [],
    pictures: [],
    start: { x: target.start.x + 2, y: target.start.y - 2 },
    flowers: target.flowers.map(({ x, y }) => ({ x: x + 2, y: y - 2 })),
  };
  const commands: DemoCommand[] = [
    ...target.polygons
      .filter((polygon) => !polygon.grass)
      .map((polygon) => ({
        type: "polygon" as const,
        vertices: fromBottomLeft(polygon.vertices),
      })),
    { type: "moveStart", to: target.start },
    ...target.flowers.map((to, index) => ({
      type: "moveFlower" as const,
      index,
      to,
    })),
    ...target.apples.map((apple) => ({ type: "apple" as const, apple })),
    { type: "autoGrass" },
    ...target.pictures.map((picture) => ({
      type: "picture" as const,
      picture,
    })),
    { type: "title", title: target.levelName },
    { type: "playtest", duration: 3500 },
    { type: "preview" },
  ];
  return { initial, target, commands };
}
