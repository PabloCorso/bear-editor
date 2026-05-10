import { Clip, Gravity } from "~/editor/elma-types";
import { FRAME_INDEX_TO_TIME } from "~/editor/play-mode/engine/core/constants";
import type { GameState } from "~/editor/play-mode/engine/game/game-loop";
import type { LevelData, Polygon } from "~/editor/play-mode/engine/level";
import { DEFAULT_OBJECT_RENDER_DISTANCE } from "~/editor/render/render-constants";
import {
  getViewportWorldRectFromCenter,
  type WorldRect,
} from "~/editor/render/world-geometry";
import {
  getCachedPolygonDerivedData,
  isPolygonVisible,
  isPictureVisible,
  isPointVisible,
} from "~/editor/render/world-derived-data-cache";
import type {
  PlayModeRenderVisibility,
  PlayModeScene,
  PlayModeSceneDrawItem,
  PlayModeViewport,
} from "./play-mode-scene";

type LevelRenderCache = {
  polygons: Array<{
    polygon: Polygon;
  }>;
};

const levelRenderCache = new WeakMap<LevelData, LevelRenderCache>();
const VOLT_ARM_ANIMATION_FRAMES = 28;
const VOLT_ARM_ANIMATION_DURATION =
  VOLT_ARM_ANIMATION_FRAMES * FRAME_INDEX_TO_TIME;

export function buildPlayModeScene({
  state,
  viewport,
  visibility,
  resolvePictureDimensions,
}: {
  state: GameState;
  viewport: PlayModeViewport;
  visibility: PlayModeRenderVisibility;
  resolvePictureDimensions?: (picture: {
    name?: string;
    texture?: string;
    mask?: string;
  }) => { width: number; height: number } | null;
}): PlayModeScene {
  const worldRect = getViewportWorldRectFromCenter(viewport);
  const cache = getLevelRenderCache(state.level);
  const polygons = cache.polygons
    .filter((entry) => isPolygonVisible(entry.polygon, worldRect))
    .map(({ polygon }) => {
      const { grassEdgeIndices } = getCachedPolygonDerivedData(polygon);
      return {
      vertices: polygon.vertices,
      isGrass: Boolean(polygon.isGrass),
      grassEdgeIndices,
      };
    });

  return {
    clearColor: "#1a1a2e",
    ground: state.level.foregroundName,
    sky: state.level.backgroundName,
    animateSprites: true,
    groundClipMode: "always",
    level: state.level,
    viewport: {
      rect: worldRect,
      zoom: viewport.zoom,
    },
    visibility,
    polygons,
    drawItems: getDrawItemQueue(
      state,
      visibility,
      worldRect,
      resolvePictureDimensions,
    ),
  };
}

function getDrawItemQueue(
  state: GameState,
  visibility: Pick<
    PlayModeRenderVisibility,
    "showObjects" | "showPictures" | "showTextures" | "showObjectAnimations"
  >,
  worldRect: WorldRect,
  resolvePictureDimensions?: (picture: {
    name?: string;
    texture?: string;
    mask?: string;
  }) => { width: number; height: number } | null,
): PlayModeSceneDrawItem[] {
  const pictures =
    visibility.showPictures || visibility.showTextures
      ? state.level.sprites
          .filter((sprite) =>
            sprite.textureName && sprite.maskName
              ? visibility.showTextures
              : visibility.showPictures,
          )
          .filter((sprite) =>
            isSpriteVisible(sprite, worldRect, resolvePictureDimensions),
          )
          .map((sprite) => ({
            type: "picture" as const,
            cacheKey: sprite,
            name: sprite.pictureName || undefined,
            mask: sprite.maskName || undefined,
            texture: sprite.textureName || undefined,
            clip: sprite.clipping,
            distance: sprite.distance,
            position: {
              x: sprite.r.x,
              y: sprite.r.y,
            },
          }))
      : [];

  const objects = visibility.showObjects
    ? state.level.objects
        .filter((obj) => obj.active)
        .filter((obj) => obj.type !== "start")
        .filter((obj) => isPointVisible({ x: obj.r.x, y: -obj.r.y }, worldRect))
        .map((obj) => ({
          type: "object" as const,
          objectKind: obj.type as "food" | "killer" | "exit",
          gravity: gravityFromProperty(obj.property),
          animation: obj.animation,
          clip: Clip.Unclipped,
          distance: DEFAULT_OBJECT_RENDER_DISTANCE,
          position: {
            x: obj.r.x,
            y: -obj.r.y,
          },
        }))
    : [];

  return [...pictures, ...objects, buildBikeSceneItem(state)].sort(
    (a, b) => b.distance - a.distance,
  );
}

function buildBikeSceneItem(state: GameState): PlayModeSceneDrawItem {
  const motor = state.motor;
  const rawVoltProgress =
    state.lastVoltDirection == null
      ? 0
      : (state.gameTime - state.lastVoltTime) / VOLT_ARM_ANIMATION_DURATION;
  const voltProgress = Math.max(0, Math.min(rawVoltProgress, 1));

  return {
    fallback: {
      bike: {
        x: motor.bike.r.x,
        y: -motor.bike.r.y,
      },
      leftWheel: {
        x: motor.leftWheel.r.x,
        y: -motor.leftWheel.r.y,
      },
      rightWheel: {
        x: motor.rightWheel.r.x,
        y: -motor.rightWheel.r.y,
      },
      head: {
        x: motor.headR.x,
        y: -motor.headR.y,
      },
      flipped: motor.flippedBike,
      rotation: motor.bike.rotation,
    },
    type: "bike",
    distance: DEFAULT_OBJECT_RENDER_DISTANCE,
    start: {
      x: motor.leftWheel.r.x,
      y: -motor.leftWheel.r.y,
    },
    coords: {
      bikeR: (motor.bike.rotation * 10000) / (Math.PI * 2),
      turn: motor.flippedBike ? 1 : 0,
      leftX: (motor.leftWheel.r.x - motor.bike.r.x) * 1000,
      leftY: (motor.leftWheel.r.y - motor.bike.r.y) * 1000,
      leftR: (motor.leftWheel.rotation * 250) / (Math.PI * 2),
      rightX: (motor.rightWheel.r.x - motor.bike.r.x) * 1000,
      rightY: (motor.rightWheel.r.y - motor.bike.r.y) * 1000,
      rightR: (motor.rightWheel.rotation * 250) / (Math.PI * 2),
      // The original replay renderer's head coords are the rider anchor
      // near the torso/neck, not the physics head collision center.
      headX: (motor.bodyR.x - motor.bike.r.x) * 1000,
      headY: (motor.bodyR.y - motor.bike.r.y) * 1000,
      voltDirection: voltProgress > 0 ? state.lastVoltDirection : null,
      voltProgress,
    },
  };
}

function gravityFromProperty(property: LevelData["objects"][number]["property"]) {
  switch (property) {
    case "gravity_up":
      return Gravity.Up;
    case "gravity_down":
      return Gravity.Down;
    case "gravity_left":
      return Gravity.Left;
    case "gravity_right":
      return Gravity.Right;
    default:
      return undefined;
  }
}

function getLevelRenderCache(level: LevelData): LevelRenderCache {
  const cached = levelRenderCache.get(level);
  if (cached) return cached;

  const cache: LevelRenderCache = {
    polygons: level.polygons.map((polygon) => ({ polygon })),
  };
  levelRenderCache.set(level, cache);
  return cache;
}

function isSpriteVisible(
  sprite: LevelData["sprites"][number],
  worldRect: WorldRect,
  resolvePictureDimensions?: (picture: {
    name?: string;
    texture?: string;
    mask?: string;
  }) => { width: number; height: number } | null,
) {
  return isPictureVisible(
    {
      position: { x: sprite.r.x, y: sprite.r.y },
      name: sprite.pictureName,
      texture: sprite.textureName,
      mask: sprite.maskName,
    },
    worldRect,
    ({ name, texture, mask }) =>
      resolvePictureDimensions?.({
        name,
        texture,
        mask,
      }) ?? null,
  );
}
