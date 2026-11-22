import type { EditorLevel } from "~/editor/elma-types";
import { getBuiltinLevel } from "~/editor/helpers/level-parser";
import type { Demo, DemoCommand } from "./commands";

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
        vertices: polygon.vertices,
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
