import type { LgrAssets } from "~/components/lgr-assets";
import type { WorldRenderScene } from "~/editor/render/world-scene";
import { RectoolsWorldSceneRenderer } from "./rectools-world-scene-renderer";
import { WebGLWorldSceneRenderer } from "./webgl-world-scene-renderer";

export type WorldSceneRendererBackend = "webgl" | "rectools";

export interface WorldSceneRenderer {
  readonly backend: WorldSceneRendererBackend;
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
  backend = "webgl",
}: {
  canvas: HTMLCanvasElement;
  lgrAssets: LgrAssets | null;
  backend?: WorldSceneRendererBackend;
}): WorldSceneRenderer {
  switch (backend) {
    case "rectools":
      return new RectoolsWorldSceneRenderer(canvas, lgrAssets);
    case "webgl":
      return new WebGLWorldSceneRenderer(canvas, lgrAssets);
    default: {
      const exhaustivenessCheck: never = backend;
      throw new Error(`Unsupported renderer backend: ${exhaustivenessCheck}`);
    }
  }
}
