import { referenceImagePoint } from "../reference-images";
import type { LgrAssets } from "~/components/lgr-assets";
import { colors } from "~/editor/constants";
import { WebGLOverlayDrawer } from "~/editor/render/webgl-overlay-drawer";
import { WebGLPolygonDrawer } from "~/editor/render/webgl-polygon-drawer";
import { WebGLRenderContext } from "~/editor/render/webgl-render-context";
import { WebGLWorldItemDrawer } from "~/editor/render/webgl-world-item-drawer";
import type { WorldRenderScene } from "~/editor/render/world-scene";
import type { WorldSceneRenderer } from "~/editor/render/world-scene-renderer";

export class WebGLWorldSceneRenderer implements WorldSceneRenderer {
  readonly backend = "webgl" as const;

  private referenceBitmaps = new Set<ImageBitmap>();
  private renderContext: WebGLRenderContext;
  private polygonDrawer: WebGLPolygonDrawer;
  private overlayDrawer: WebGLOverlayDrawer;
  private worldItemDrawer: WebGLWorldItemDrawer;

  constructor(
    canvas: HTMLCanvasElement,
    private lgrAssets: LgrAssets | null,
  ) {
    this.renderContext = new WebGLRenderContext(canvas);
    this.polygonDrawer = new WebGLPolygonDrawer(
      this.renderContext,
      this.lgrAssets,
    );
    this.overlayDrawer = new WebGLOverlayDrawer(this.renderContext);
    this.worldItemDrawer = new WebGLWorldItemDrawer(
      this.renderContext,
      this.lgrAssets,
    );
  }

  setLgrAssets(lgrAssets: LgrAssets | null) {
    this.lgrAssets = lgrAssets;
    this.polygonDrawer.setLgrAssets(lgrAssets);
    this.worldItemDrawer.setLgrAssets(lgrAssets);
  }

  resize({
    width,
    height,
    devicePixelRatio = 1,
  }: {
    width: number;
    height: number;
    devicePixelRatio?: number;
  }) {
    this.renderContext.resize({ width, height, devicePixelRatio });
  }

  render(scene: WorldRenderScene) {
    this.renderContext.clear(scene.clearColor);

    this.polygonDrawer.drawWorldFill(
      scene,
      scene.ground,
      this.lgrAssets,
      colors.ground,
    );
    this.polygonDrawer.writeSkyStencil(scene);
    this.worldItemDrawer.drawQueuedItems(scene, "ground");

    if (scene.visibility.showPolygons) {
      this.polygonDrawer.drawSkyFillFromStencil(
        scene,
        scene.sky,
        this.lgrAssets,
        colors.sky,
      );
      this.polygonDrawer.drawGrassPolygons(scene);
    }

    this.drawReferenceImages(scene);
    this.polygonDrawer.drawPolygonEdges(scene);
    this.worldItemDrawer.drawQueuedItems(scene, "rest");
    this.worldItemDrawer.drawQueuedItemBounds(scene);
    this.overlayDrawer.draw(scene);
  }

  private drawReferenceImages(scene: WorldRenderScene) {
    const images = scene.referenceImages ?? [];
    const current = new Set(images.map((image) => image.bitmap));
    for (const bitmap of this.referenceBitmaps) {
      if (!current.has(bitmap)) this.renderContext.releaseTexture(bitmap);
    }
    this.referenceBitmaps = current;
    for (const image of images) {
      if (!image.visible) continue;
      const corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, y]) =>
        referenceImagePoint(
          image,
          (x * image.width) / 2,
          (y * image.height) / 2,
        ),
      );
      const vertices = [0, 1, 2, 0, 2, 3].flatMap((index) => [
        corners[index].x,
        corners[index].y,
        index === 1 || index === 2 ? 1 : 0,
        index >= 2 ? 1 : 0,
      ]);
      this.renderContext.drawVertices({
        vertices,
        scene,
        color: [1, 1, 1, image.opacity],
        texture: this.renderContext.getTexture(image.bitmap),
      });
    }
  }

  destroy() {
    this.renderContext.destroy();
  }
}
