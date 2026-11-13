import type { LgrAssets } from "~/components/lgr-assets";
import type { WorldBridge } from "./rectools-world-bridge";
import { WebGLWorldSceneRenderer } from "./webgl-world-scene-renderer";
import type { WorldRenderScene } from "./world-scene";
import type { WorldSceneRenderer } from "./world-scene-renderer";

type Size = Parameters<WorldSceneRenderer["resize"]>[0];

export class RectoolsWorldSceneRenderer implements WorldSceneRenderer {
  private readonly worldCanvas = document.createElement("canvas");
  private readonly overlay: WebGLWorldSceneRenderer;
  private size: Size;
  private bridge: WorldBridge | null = null;
  private lastScene: WorldRenderScene | null = null;
  private disposed = false;
  private failed = false;
  private rejectedLgr: ArrayBuffer | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private lgr: LgrAssets | null,
  ) {
    this.overlay = new WebGLWorldSceneRenderer(canvas, lgr, { alpha: true });
    this.size = { width: canvas.width, height: canvas.height };
    this.worldCanvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    this.worldCanvas.hidden = true;
    this.worldCanvas.setAttribute("aria-hidden", "true");
    this.canvas.before(this.worldCanvas);
    this.worldCanvas.addEventListener(
      "webglcontextlost",
      this.handleContextLoss,
    );
    this.canvas.dataset.renderer = "rectools-loading";
    void this.initialize();
  }

  private async initialize() {
    try {
      const { createWorldBridge } = await import("./rectools-world-bridge");
      if (this.disposed || this.failed) return;
      const bridge = await createWorldBridge(this.worldCanvas);
      if (this.disposed || this.failed) {
        bridge.destroy();
        return;
      }
      this.bridge = bridge;
      if (this.lastScene) this.render(this.lastScene);
    } catch (cause) {
      if (!this.disposed) this.fail(cause);
    }
  }

  private handleContextLoss = () =>
    this.fail(new Error("Rectools WebGL context lost"));

  private fail(cause: unknown) {
    if (this.failed || this.disposed) return;
    this.failed = true;
    this.bridge?.destroy();
    this.bridge = null;
    this.worldCanvas.hidden = true;
    this.canvas.dataset.renderer = "webgl-fallback";
    console.warn("Rectools experiment fell back to WebGL 2.", cause);
    if (this.lastScene) this.overlay.render(this.lastScene);
  }

  setLgrAssets(lgr: LgrAssets | null) {
    this.lgr = lgr;
    this.overlay.setLgrAssets(lgr);
  }

  resize(size: Size) {
    this.size = size;
    this.overlay.resize(size);
  }

  render(scene: WorldRenderScene) {
    this.lastScene = scene;
    const bytes = this.lgr?.getSourceBytes();
    if (
      this.bridge &&
      bytes &&
      bytes !== this.rejectedLgr &&
      scene.visibility.showPolygons
    ) {
      try {
        const editorItems = this.bridge.draw(
          scene,
          bytes,
          this.size.devicePixelRatio ?? 1,
        );
        if (editorItems) {
          this.overlay.renderOverRectools(scene, editorItems);
          this.worldCanvas.hidden = false;
          this.canvas.dataset.renderer = "rectools";
          return;
        }
      } catch (cause) {
        this.rejectedLgr = bytes;
        console.warn(
          "Rectools could not render this LGR. Using WebGL 2.",
          cause,
        );
      }
    }
    this.worldCanvas.hidden = true;
    this.canvas.dataset.renderer =
      this.failed || this.bridge ? "webgl-fallback" : "rectools-loading";
    this.overlay.render(scene);
  }

  destroy() {
    this.disposed = true;
    this.lastScene = null;
    this.worldCanvas.removeEventListener(
      "webglcontextlost",
      this.handleContextLoss,
    );
    this.bridge?.destroy();
    this.worldCanvas.remove();
    this.overlay.destroy();
    delete this.canvas.dataset.renderer;
  }
}
