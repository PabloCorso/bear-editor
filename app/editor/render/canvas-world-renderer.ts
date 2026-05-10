import type { LgrAssets } from "~/components/lgr-assets";
import { drawGroundFillPass } from "~/editor/render/canvas-passes/background-pass";
import { drawQueuedItemsPass } from "~/editor/render/canvas-passes/item-pass";
import { drawPolygonPass } from "~/editor/render/canvas-passes/polygon-pass";
import type { WorldRenderScene } from "~/editor/render/world-scene";
import {
  buildGroundPath,
  buildPolygonPath,
  buildViewportPathFromRect,
} from "~/editor/render/world-geometry";

export function renderCanvasWorldScene({
  ctx,
  scene,
  lgrAssets,
}: {
  ctx: CanvasRenderingContext2D;
  scene: WorldRenderScene;
  lgrAssets: LgrAssets | null;
}) {
  const skyPath = buildPolygonPath(scene.polygons);
  const viewportPath = buildViewportPathFromRect(scene.viewport.rect);
  const shouldClipGroundToSky =
    scene.groundClipMode === "always" || scene.visibility.showPolygons;
  const groundPath = shouldClipGroundToSky
    ? buildGroundPath(viewportPath, skyPath)
    : viewportPath;

  drawGroundFillPass({ ctx, scene, lgrAssets, groundPath });
  drawQueuedItemsPass({
    ctx,
    scene,
    lgrAssets,
    skyPath,
    groundPath,
    phase: "ground",
  });
  drawPolygonPass({
    ctx,
    scene,
    lgrAssets,
    skyPath,
    groundPath,
  });
  drawQueuedItemsPass({
    ctx,
    scene,
    lgrAssets,
    skyPath,
    groundPath,
    phase: "rest",
  });
}
