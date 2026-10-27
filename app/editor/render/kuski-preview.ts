import type { LgrAssets } from "~/components/lgr-assets";
import { standardSprites } from "~/components/standard-sprites";
import { getKuskiSelectionCircles } from "~/editor/kuski-geometry";
import { defaultLevelVisibility } from "~/editor/level-visibility";
import { WebGLRenderContext } from "./webgl-render-context";
import { WebGLWorldItemDrawer } from "./webgl-world-item-drawer";
import type { WorldRenderScene } from "./world-scene";

const previews = new WeakMap<LgrAssets, Map<string, string>>();
const PREVIEW_SIZE = 96;

export function getKuskiPreview(lgr: LgrAssets, color: string) {
  const cached = previews.get(lgr)?.get(color);
  if (cached) return cached;
  if (!standardSprites.kuski.every((name) => lgr.getSprite(name))) return;

  const start = { x: 0, y: 0 };
  const circles = getKuskiSelectionCircles({ start });
  const minX = Math.min(...circles.map((circle) => circle.x - circle.radius));
  const maxX = Math.max(...circles.map((circle) => circle.x + circle.radius));
  const minY = Math.min(...circles.map((circle) => circle.y - circle.radius));
  const maxY = Math.max(...circles.map((circle) => circle.y + circle.radius));
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const side = Math.max(maxX - minX, maxY - minY) * 1.08;
  const canvas = document.createElement("canvas");
  const context = new WebGLRenderContext(canvas, { alpha: true });
  try {
    context.resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE });
    context.clear("#000000", 0);
    const scene: WorldRenderScene = {
      clearColor: "#000000",
      ground: "",
      sky: "",
      animateSprites: false,
      groundClipMode: "when-polygons-visible",
      viewport: {
        width: PREVIEW_SIZE,
        height: PREVIEW_SIZE,
        center,
        zoom: PREVIEW_SIZE / side,
        rect: {
          minX: center.x - side / 2,
          maxX: center.x + side / 2,
          minY: center.y - side / 2,
          maxY: center.y + side / 2,
        },
      },
      visibility: defaultLevelVisibility,
      polygons: [],
      drawItems: [
        { type: "start", position: start, color, distance: 0, clip: 0 },
      ],
    };
    new WebGLWorldItemDrawer(context, lgr).drawQueuedItems(scene, "rest");
    const src = canvas.toDataURL();
    const cache = previews.get(lgr) ?? new Map<string, string>();
    cache.set(color, src);
    previews.set(lgr, cache);
    return src;
  } finally {
    context.destroy();
    context.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
