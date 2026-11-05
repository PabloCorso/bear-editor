/**
 * Converts an elmajs Level instance to the game engine's LevelData format.
 */
import {
  ObjectType,
  Gravity,
  type Polygon,
  type LevelObject,
  type Picture,
} from "../elma-types";
type Level = {
  name: string;
  lgr: string;
  ground: string;
  sky: string;
  polygons: Polygon[];
  objects: LevelObject[];
  pictures: Picture[];
};
import { Vec2 } from "./engine/core/vec2";
import type {
  LevelData,
  ObjectType as GameObjectType,
  ObjectProperty,
} from "./engine/level";

function convertObjectType(type: ObjectType): GameObjectType {
  switch (type) {
    case ObjectType.Exit:
      return "exit";
    case ObjectType.Apple:
      return "food";
    case ObjectType.Killer:
      return "killer";
    case ObjectType.Start:
      return "start";
    default:
      return "start";
  }
}

function convertGravity(gravity: Gravity): ObjectProperty {
  switch (gravity) {
    case Gravity.None:
      return "none";
    case Gravity.Up:
      return "gravity_up";
    case Gravity.Down:
      return "gravity_down";
    case Gravity.Left:
      return "gravity_left";
    case Gravity.Right:
      return "gravity_right";
    default:
      return "none";
  }
}

export function convertLevelToGameData(level: Level): LevelData {
  return {
    levelId: 0,
    levelName: level.name ?? "Untitled",
    lgrName: level.lgr ?? "default",
    foregroundName: level.ground ?? "ground",
    backgroundName: level.sky ?? "sky",
    polygons: level.polygons.map((poly) => ({
      vertices: poly.vertices.map((v) => new Vec2(v.x, v.y)),
      isGrass: poly.grass,
    })),
    objects: level.objects.map((obj) => ({
      r: new Vec2(obj.position.x, obj.position.y),
      type: convertObjectType(obj.type),
      property: convertGravity(obj.gravity),
      animation: obj.animation,
      active: true,
      floatingPhase: 0,
    })),
    sprites: level.pictures.map((pic) => ({
      r: new Vec2(pic.position.x, pic.position.y),
      pictureName: pic.name,
      maskName: pic.mask ?? "",
      textureName: pic.texture ?? "",
      clipping: pic.clip,
      distance: pic.distance,
    })),
    topTens: {
      single: { timesCount: 0, times: [], names1: [], names2: [] },
      multi: { timesCount: 0, times: [], names1: [], names2: [] },
    },
    topologyErrors: false,
  };
}
