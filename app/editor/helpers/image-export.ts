import type { LgrAssets } from "~/components/lgr-assets";
import type { WorldRenderScene } from "~/editor/render/world-scene";
import { createWorldSceneRenderer } from "~/editor/render/world-scene-renderer";

export type ImageExportOptions = {
  appearance: "shown" | "game";
  area: "view" | "level";
  scale: number;
};

/** A snapshot of the canvas when the export dialog opens. */
export class ImageExport {
  constructor(
    private assets: LgrAssets | null,
    private getScene: (options: ImageExportOptions) => WorldRenderScene,
  ) {}

  dimensions(options: ImageExportOptions) {
    const { width, height } = this.getScene(options).viewport;
    return {
      width: Math.round(width * options.scale),
      height: Math.round(height * options.scale),
    };
  }

  private render(options: ImageExportOptions, preview: boolean) {
    const size = this.dimensions(options);
    const ratio = preview
      ? Math.min(1, 640 / size.width, 400 / size.height)
      : 1;
    const width = Math.max(1, Math.round(size.width * ratio));
    const height = Math.max(1, Math.round(size.height * ratio));
    // Bound allocations before creating a potentially very large WebGL canvas.
    if (
      !preview &&
      (width > 16384 || height > 16384 || width * height > 64_000_000)
    ) {
      throw new Error(
        "This image is too large. Choose a lower resolution (maximum 64 megapixels and 16,384 pixels per side).",
      );
    }
    const canvas = document.createElement("canvas");
    const renderer = createWorldSceneRenderer({
      canvas,
      lgrAssets: this.assets,
    });
    try {
      const gl = canvas.getContext("webgl")!;
      const limit = Math.min(
        gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        gl.getParameter(gl.MAX_TEXTURE_SIZE),
      );
      if (width > limit || height > limit)
        throw new Error(
          "This resolution exceeds your browser’s graphics limit. Choose a lower resolution.",
        );
      renderer.resize({ width, height });
      const scene = this.getScene(options);
      renderer.render({
        ...scene,
        viewport: {
          ...scene.viewport,
          width,
          height,
          zoom: (scene.viewport.zoom * width) / scene.viewport.width,
        },
      });
      return {
        canvas,
        dispose: () => {
          renderer.destroy();
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        },
      };
    } catch (error) {
      renderer.destroy();
      canvas
        .getContext("webgl")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext();
      throw error;
    }
  }

  preview(options: ImageExportOptions) {
    const { canvas, dispose } = this.render(options, true);
    try {
      return canvas.toDataURL("image/png");
    } finally {
      dispose();
    }
  }

  async toBlob(options: ImageExportOptions): Promise<Blob> {
    const { canvas, dispose } = this.render(options, false);
    try {
      // Snapshot before WebGL's drawing buffer is discarded by compositing.
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to export image. Please try again."));
        }, "image/png"),
      );
    } finally {
      dispose();
    }
  }
}
