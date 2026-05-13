import type { LgrAssets } from "~/components/lgr-assets";
import type { WorldRenderScene } from "~/editor/render/world-scene";
import { CanvasWorldSceneRenderer } from "./canvas-world-scene-renderer";

export type WorldSceneRendererBackend = "canvas" | "webgl";

export interface WorldSceneRenderer {
  readonly backend: WorldSceneRendererBackend;
  getContext(): CanvasRenderingContext2D | null;
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
  backend = "canvas",
}: {
  canvas: HTMLCanvasElement;
  lgrAssets: LgrAssets | null;
  backend?: WorldSceneRendererBackend;
}): WorldSceneRenderer {
  switch (backend) {
    case "canvas":
      return new CanvasWorldSceneRenderer(canvas, lgrAssets);
    case "webgl":
      throw new Error("WebGL world renderer is not implemented yet");
    default: {
      const exhaustivenessCheck: never = backend;
      throw new Error(`Unsupported renderer backend: ${exhaustivenessCheck}`);
    }
  }
}
