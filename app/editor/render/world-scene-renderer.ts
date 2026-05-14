import type { LgrAssets } from "~/components/lgr-assets";
import type { WorldRenderScene } from "~/editor/render/world-scene";
import { WebGLWorldSceneRenderer } from "./webgl-world-scene-renderer";

export type WorldSceneRendererBackend = "webgl";

export interface WorldSceneRenderer {
  readonly backend: WorldSceneRendererBackend;
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
    case "webgl":
      return new WebGLWorldSceneRenderer(canvas, lgrAssets);
    default: {
      const exhaustivenessCheck: never = backend;
      throw new Error(`Unsupported renderer backend: ${exhaustivenessCheck}`);
    }
  }
}
