import type { LgrAssets } from "~/components/lgr-assets";
import { colors, ELMA_PIXEL_SCALE } from "~/editor/constants";
import {
  composeGrassTexture,
  pixelsToWorldUnits,
} from "~/editor/render/grass-renderer";
import { PICTURE_SCALE } from "~/editor/render/picture-metrics";
import { type WebGLRenderContext } from "~/editor/render/webgl-render-context";
import { getSimpleGrassFillQuads } from "~/editor/render/webgl-geometry";
import { WebGLShapeDrawer } from "~/editor/render/webgl-shape-drawer";
import type { WorldRenderScene } from "~/editor/render/world-scene";

const MIN_ZOOM_EPSILON = 0.0001;

export class WebGLPolygonDrawer {
  private shapes: WebGLShapeDrawer;

  constructor(
    private context: WebGLRenderContext,
    private lgrAssets: LgrAssets | null,
  ) {
    this.shapes = new WebGLShapeDrawer(context);
  }

  setLgrAssets(lgrAssets: LgrAssets | null) {
    this.lgrAssets = lgrAssets;
  }

  drawWorldFill(
    scene: WorldRenderScene,
    textureName: string,
    lgrAssets: LgrAssets | null,
    fallbackColor: string,
  ) {
    const textureSprite =
      scene.visibility.useGroundSkyTextures && lgrAssets
        ? lgrAssets.getSprite(textureName)
        : null;

    if (!textureSprite) {
      this.shapes.drawRect(
        scene.viewport.rect.minX,
        scene.viewport.rect.minY,
        scene.viewport.rect.maxX - scene.viewport.rect.minX,
        scene.viewport.rect.maxY - scene.viewport.rect.minY,
        colors[textureName as keyof typeof colors] ?? fallbackColor,
        scene,
      );
      return;
    }

    const rect = scene.viewport.rect;
    const { tileWidth, tileHeight } = getTextureTileSize(textureSprite, scene);
    const texture = this.context.getTexture(textureSprite);
    const points = [
      {
        x: rect.minX,
        y: rect.minY,
        u: rect.minX / tileWidth,
        v: rect.minY / tileHeight,
      },
      {
        x: rect.maxX,
        y: rect.minY,
        u: rect.maxX / tileWidth,
        v: rect.minY / tileHeight,
      },
      {
        x: rect.minX,
        y: rect.maxY,
        u: rect.minX / tileWidth,
        v: rect.maxY / tileHeight,
      },
      {
        x: rect.minX,
        y: rect.maxY,
        u: rect.minX / tileWidth,
        v: rect.maxY / tileHeight,
      },
      {
        x: rect.maxX,
        y: rect.minY,
        u: rect.maxX / tileWidth,
        v: rect.minY / tileHeight,
      },
      {
        x: rect.maxX,
        y: rect.maxY,
        u: rect.maxX / tileWidth,
        v: rect.maxY / tileHeight,
      },
    ];

    this.context.drawVertices({
      vertices: points.flatMap((point) => [point.x, point.y, point.u, point.v]),
      color: [1, 1, 1, 1],
      texture,
      scene,
      repeatTexture: true,
    });
  }

  writeSkyStencil(scene: WorldRenderScene) {
    const gl = this.context.gl;
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST);
    gl.colorMask(false, false, false, false);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);

    for (const polygon of scene.polygons) {
      if (polygon.vertices.length < 3 || polygon.isGrass) continue;
      this.shapes.drawPolygon(polygon.vertices, "#ffffff", scene);
    }

    gl.colorMask(true, true, true, true);
    gl.stencilMask(0x00);
    gl.disable(gl.STENCIL_TEST);
  }

  drawSkyFillFromStencil(
    scene: WorldRenderScene,
    textureName: string,
    lgrAssets: LgrAssets | null,
    fallbackColor: string,
  ) {
    const gl = this.context.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
    this.drawWorldFill(scene, textureName, lgrAssets, fallbackColor);
    gl.disable(gl.STENCIL_TEST);
  }

  drawGrassPolygons(scene: WorldRenderScene) {
    for (const polygon of scene.polygons) {
      if (!polygon.isGrass || polygon.vertices.length < 3) continue;
      this.drawGrassPolygon(polygon, scene);
    }
  }

  drawPolygonEdges(scene: WorldRenderScene) {
    if (
      !scene.visibility.showGroundBounds &&
      !scene.visibility.showGrassBounds
    ) {
      return;
    }

    for (const polygon of scene.polygons) {
      if (polygon.vertices.length < 2) continue;

      const lineWidth = 1 / Math.max(scene.viewport.zoom, 1);
      if (polygon.isGrass) {
        if (!scene.visibility.showGrassBounds) continue;

        for (const index of polygon.grassEdgeIndices) {
          const from = polygon.vertices[index]!;
          const to = polygon.vertices[(index + 1) % polygon.vertices.length]!;
          this.shapes.drawLine(from, to, lineWidth, colors.grass, scene);
        }
        continue;
      }

      if (!scene.visibility.showGroundBounds) continue;

      for (let index = 0; index < polygon.vertices.length; index += 1) {
        const from = polygon.vertices[index]!;
        const to = polygon.vertices[(index + 1) % polygon.vertices.length]!;
        this.shapes.drawLine(from, to, lineWidth, colors.edges, scene);
      }
    }
  }

  private drawGrassPolygon(
    polygon: WorldRenderScene["polygons"][number],
    scene: WorldRenderScene,
  ) {
    const gl = this.context.gl;
    const grassTexture =
      scene.visibility.useGrassTextures && this.lgrAssets
        ? composeGrassTexture({
            lgrAssets: this.lgrAssets,
            vertices: polygon.vertices,
          })
        : null;

    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);

    if (grassTexture) {
      this.drawGrassTexture(grassTexture, scene);
      gl.disable(gl.STENCIL_TEST);
      return;
    }

    for (const [from, to, innerTo, innerFrom] of getSimpleGrassFillQuads({
      vertices: polygon.vertices,
      grassEdgeIndices: polygon.grassEdgeIndices,
      zoom: scene.viewport.zoom,
      depth: 20 * ELMA_PIXEL_SCALE,
    })) {
      this.shapes.drawQuad(
        [
          from.x,
          from.y,
          to.x,
          to.y,
          innerTo.x,
          innerTo.y,
          innerFrom.x,
          innerFrom.y,
        ],
        colors.grass,
        scene,
      );
    }

    gl.disable(gl.STENCIL_TEST);
  }

  private drawGrassTexture(
    composed: {
      canvas: HTMLCanvasElement;
      minXPx: number;
      minYPx: number;
    },
    scene: WorldRenderScene,
  ) {
    const texture = this.context.getTexture(composed.canvas);
    const minX = pixelsToWorldUnits(composed.minXPx);
    const minY = pixelsToWorldUnits(composed.minYPx);
    const width = pixelsToWorldUnits(composed.canvas.width);
    const height = pixelsToWorldUnits(composed.canvas.height);

    this.context.drawVertices({
      vertices: [
        minX,
        minY,
        0,
        0,
        minX + width,
        minY,
        1,
        0,
        minX,
        minY + height,
        0,
        1,
        minX,
        minY + height,
        0,
        1,
        minX + width,
        minY,
        1,
        0,
        minX + width,
        minY + height,
        1,
        1,
      ],
      color: [1, 1, 1, 1],
      texture,
      scene,
    });
  }
}

function getTextureTileSize(
  sprite: ImageBitmap | HTMLCanvasElement,
  scene: WorldRenderScene,
) {
  if (scene.visibility.zoomTextures) {
    return {
      tileWidth: sprite.width * PICTURE_SCALE || 1,
      tileHeight: sprite.height * PICTURE_SCALE || 1,
    };
  }

  return {
    tileWidth: sprite.width / Math.max(scene.viewport.zoom, MIN_ZOOM_EPSILON),
    tileHeight: sprite.height / Math.max(scene.viewport.zoom, MIN_ZOOM_EPSILON),
  };
}
