import type { LgrAssets } from "~/components/lgr-assets";
import { Clip, Gravity } from "~/editor/elma-types";
import type { LevelData, GameObject } from "~/editor/play-mode/engine/level";
import { PLAY_MODE_PIXELS_PER_METER } from "~/editor/play-mode/play-settings";
import { getPictureWorldDimensions } from "~/editor/render/picture-metrics";
import { DEFAULT_OBJECT_RENDER_DISTANCE } from "~/editor/render/render-constants";
import { getPolygonBounds } from "~/editor/render/world-derived-data-cache";
import type {
  WorldPoint,
  WorldRenderObjectItem,
  WorldRenderPictureItem,
} from "~/editor/render/world-scene";

const PPM = PLAY_MODE_PIXELS_PER_METER;

export const GRASS_DISTANCE = 600;

const gravityByProperty = {
  none: Gravity.None,
  gravity_up: Gravity.Up,
  gravity_down: Gravity.Down,
  gravity_left: Gravity.Left,
  gravity_right: Gravity.Right,
};

export function getPlayfield(level: LevelData, assets: LgrAssets) {
  let minX = Infinity;
  let maxY = -Infinity;
  const polygonFans: number[] = [];
  const grassPolygons: WorldPoint[][] = [];

  for (const polygon of level.polygons) {
    const { vertices } = polygon;
    if (vertices.length < 3) continue;
    if (polygon.isGrass) {
      grassPolygons.push(vertices);
      continue;
    }

    const bounds = getPolygonBounds(vertices);
    minX = Math.min(minX, bounds.minX);
    maxY = Math.max(maxY, bounds.maxY);
    // Inverting the stencil gives even-odd coverage across concave and nested polygons.
    const first = vertices[0];
    for (let i = 1; i < vertices.length - 1; i++) {
      const a = vertices[i];
      const b = vertices[i + 1];
      polygonFans.push(first.x, first.y, 0, 0, a.x, a.y, 0, 0, b.x, b.y, 0, 0);
    }
  }

  // Classic's canvas starts at the bottom left of the ground bounds, with margins.
  const canvasCorner = {
    x: (Number.isFinite(minX) ? minX : 0) - 10_000 / PPM,
    y: (Number.isFinite(maxY) ? maxY : 0) + 1_000 / PPM,
  };
  const pictures = level.sprites.flatMap((sprite) => {
    const clip = sprite.clipping;
    if (clip !== Clip.Unclipped && clip !== Clip.Sky && clip !== Clip.Ground)
      return [];
    const item: WorldRenderPictureItem = {
      type: "picture",
      name: sprite.pictureName || undefined,
      mask: sprite.maskName || undefined,
      texture: sprite.textureName || undefined,
      clip,
      distance: sprite.distance,
      position: sprite.r,
    };
    const hasPicture = item.name && !item.mask && !item.texture;
    const hasMask = !item.name && item.mask && item.texture;
    if (!hasPicture && !hasMask) return [];
    if (item.texture && !assets.getSprite(item.texture)) return [];
    const size = getPictureWorldDimensions(item, assets);
    return size ? [{ item, size }] : [];
  });

  // The closest visible pixel wins. At equal distance Classic keeps the first
  // painted pixel, with ground/sky pictures painted before unclipped pictures.
  pictures.reverse();
  pictures.sort(
    (a, b) =>
      b.item.distance - a.item.distance ||
      Number(a.item.clip !== Clip.Unclipped) -
        Number(b.item.clip !== Clip.Unclipped),
  );
  const front = pictures.findIndex(
    ({ item }) => item.distance < DEFAULT_OBJECT_RENDER_DISTANCE,
  );
  return {
    polygonFans: new Float32Array(polygonFans),
    grassPolygons,
    canvasCorner,
    backPictures: front < 0 ? pictures : pictures.slice(0, front),
    frontPictures: front < 0 ? [] : pictures.slice(front),
  };
}

export function getPlayObjects(objects: GameObject[]) {
  return objects.flatMap((object) => {
    if (object.type === "start") return [];
    const item: WorldRenderObjectItem = {
      type: "object",
      objectKind: object.type,
      animation: object.animation,
      gravity: gravityByProperty[object.property],
      clip: Clip.Unclipped,
      distance: DEFAULT_OBJECT_RENDER_DISTANCE,
      position: { x: object.r.x, y: -object.r.y },
    };
    return [{ object, item }];
  });
}

export function snapCanvasOrigin(corner: WorldPoint, ppm: number): WorldPoint {
  return {
    x: (Math.trunc(corner.x * ppm) + 0.5) / ppm,
    y: -(Math.trunc(-corner.y * ppm) + 0.5) / ppm,
  };
}
