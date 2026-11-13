import type { LgrAssets } from "~/components/lgr-assets";
import type { WorldRenderScene } from "~/editor/render/world-scene";
import { RectoolsWorldSceneRenderer } from "./rectools-world-scene-renderer";

export interface WorldSceneRenderer {
  setLgrAssets(lgrAssets: LgrAssets | null): void;
  resize(options: {
    width: number;
    height: number;
    devicePixelRatio?: number;
  }): void;
  render(scene: WorldRenderScene): void;
  destroy(): void;
}

export function createWorldSceneRenderer({
  canvas,
  lgrAssets,
}: {
  canvas: HTMLCanvasElement;
  lgrAssets: LgrAssets | null;
}): WorldSceneRenderer {
  return new RectoolsWorldSceneRenderer(canvas, lgrAssets);
}
