import type { LgrAssets } from "~/components/lgr-assets";
import type { WorldRenderScene } from "~/editor/render/world-scene";

export type CanvasWorldRenderContext = {
  ctx: CanvasRenderingContext2D;
  scene: WorldRenderScene;
  lgrAssets: LgrAssets | null;
};
