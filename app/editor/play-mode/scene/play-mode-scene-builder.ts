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
  isPointVisible,
} from "~/editor/render/world-derived-data-cache";
import type {
  PlayModeRenderVisibility,
  PlayModeScene,
  PlayModeSceneDrawItem,
  PlayModeSceneObjectItem,
  PlayModeScenePictureItem,
  PlayModeViewport,
} from "./play-mode-scene";

type LevelRenderCache = {
  polygons: Array<{
    bounds: WorldRect;
    item: {
      vertices: Polygon["vertices"];
      isGrass: boolean;
      grassEdgeIndices: number[];
    };
  }>;
  staticDrawItems: Array<
    | PlayModeScenePictureItem
    | {
        type: "object";
        source: LevelData["objects"][number];
        item: PlayModeSceneObjectItem;
      }
  >;
};

const levelRenderCache = new WeakMap<LevelData, LevelRenderCache>();
const pictureBoundsCache = new WeakMap<object, WorldRect>();
const VOLT_ARM_ANIMATION_FRAMES = 28;
const VOLT_ARM_ANIMATION_DURATION =
  VOLT_ARM_ANIMATION_FRAMES * FRAME_INDEX_TO_TIME;
const TURN_ANIMATION_WALL_SECONDS = 0.55;
const TURN_ANIMATION_DURATION =
  TURN_ANIMATION_WALL_SECONDS * 30 * FRAME_INDEX_TO_TIME;

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
  const viewportRect = getViewportWorldRectFromCenter(viewport, 0);
  const worldRect = getViewportWorldRectFromCenter(viewport);
  const cache = getLevelRenderCache(state.level);
  const polygons = cache.polygons
    .filter((entry) => rectIntersects(entry.bounds, worldRect))
    .map((entry) => entry.item);

  return {
    clearColor: "#1a1a2e",
    ground: state.level.foregroundName,
    sky: state.level.backgroundName,
    animateSprites: true,
    groundClipMode: "always",
    level: state.level,
    viewport: {
      width: viewport.width,
      height: viewport.height,
      center: {
        x: viewport.centerX,
        y: viewport.centerY,
      },
      rect: viewportRect,
      zoom: viewport.zoom,
    },
    visibility,
    polygons,
    drawItems: getDrawItemQueue(
      state,
      cache,
      visibility,
      worldRect,
      resolvePictureDimensions,
    ),
  };
}

function getDrawItemQueue(
  state: GameState,
  cache: LevelRenderCache,
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
  const drawItems: PlayModeSceneDrawItem[] = [];
  const bikeItem = buildBikeSceneItem(state);
  let bikeInserted = false;

  for (const item of cache.staticDrawItems) {
    if (getStaticDrawItemDistance(item) < bikeItem.distance && !bikeInserted) {
      drawItems.push(bikeItem);
      bikeInserted = true;
    }

    if (item.type === "picture") {
      const shouldShowPicture =
        item.texture && item.mask
          ? visibility.showTextures
          : visibility.showPictures;
      if (!shouldShowPicture) continue;
      const bounds = getCachedPictureBounds(item, resolvePictureDimensions);
      if (bounds && !rectIntersects(bounds, worldRect)) continue;
      drawItems.push(item);
      continue;
    }

    if (!visibility.showObjects) continue;
    if (!item.source.active) continue;
    if (!isPointVisible(item.item.position, worldRect)) continue;
    drawItems.push(item.item);
  }

  if (!bikeInserted) {
    drawItems.push(bikeItem);
  }

  return drawItems;
}

function buildBikeSceneItem(state: GameState): PlayModeSceneDrawItem {
  const motor = state.motor;
  const rawVoltProgress =
    state.lastVoltDirection == null
      ? 0
      : (state.gameTime - state.lastVoltTime) / VOLT_ARM_ANIMATION_DURATION;
  const voltProgress = Math.max(0, Math.min(rawVoltProgress, 1));
  const rawTurnProgress =
    state.lastTurnTime <= -100
      ? 1
      : (state.gameTime - state.lastTurnTime) / TURN_ANIMATION_DURATION;
  const turnProgress = Math.max(0, Math.min(rawTurnProgress, 1));

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
      turnProgress,
      voltDirection: voltProgress > 0 ? state.lastVoltDirection : null,
      voltProgress,
    },
  };
}

function gravityFromProperty(
  property: LevelData["objects"][number]["property"],
) {
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
    polygons: level.polygons.map((polygon) => {
      const derived = getCachedPolygonDerivedData(polygon);
      return {
        bounds: derived.bounds,
        item: {
          vertices: polygon.vertices,
          isGrass: Boolean(polygon.isGrass),
          grassEdgeIndices: derived.grassEdgeIndices,
        },
      };
    }),
    staticDrawItems: [
      ...level.sprites.map(
        (sprite): PlayModeScenePictureItem => ({
          type: "picture",
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
        }),
      ),
      ...level.objects
        .filter((obj) => obj.type !== "start")
        .map((obj) => ({
          type: "object" as const,
          source: obj,
          item: {
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
          },
        })),
    ].sort(
      (a, b) => getStaticDrawItemDistance(b) - getStaticDrawItemDistance(a),
    ),
  };
  levelRenderCache.set(level, cache);
  return cache;
}

function getStaticDrawItemDistance(
  item: LevelRenderCache["staticDrawItems"][number],
) {
  return item.type === "picture" ? item.distance : item.item.distance;
}

function rectIntersects(a: WorldRect, b: WorldRect) {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  );
}

function getCachedPictureBounds(
  item: PlayModeScenePictureItem,
  resolvePictureDimensions?: (picture: {
    name?: string;
    texture?: string;
    mask?: string;
  }) => { width: number; height: number } | null,
) {
  const cacheKey = item.cacheKey;
  if (!cacheKey) return null;

  const cached = pictureBoundsCache.get(cacheKey);
  if (cached) return cached;

  const dimensions = resolvePictureDimensions?.(item);
  if (!dimensions) return null;

  const bounds = {
    minX: item.position.x,
    minY: item.position.y,
    maxX: item.position.x + dimensions.width,
    maxY: item.position.y + dimensions.height,
  };
  pictureBoundsCache.set(cacheKey, bounds);
  return bounds;
}
