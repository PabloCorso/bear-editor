import { colors } from "~/editor/constants";
import { drawGrassPolygon } from "~/editor/render/grass-renderer";
import { PICTURE_SCALE } from "~/editor/render/picture-metrics";
import type { CanvasWorldRenderContext } from "./canvas-render-context";

export function drawPolygonPass({
  ctx,
  scene,
  lgrAssets,
  skyPath,
  groundPath,
}: CanvasWorldRenderContext & {
  skyPath: Path2D;
  groundPath: Path2D;
}) {
  if (!scene.visibility.showPolygons && !scene.visibility.showPolygonBounds) {
    return;
  }

  const skyFill = scene.visibility.useGroundSkyTextures
    ? getTexturePattern(ctx, lgrAssets, scene.sky)
    : null;
  const skyColor = getFlatTextureColor(scene.sky, colors.sky);

  if (scene.visibility.showPolygons) {
    ctx.save();
    ctx.fillStyle = skyFill ?? skyColor;
    ctx.fill(skyPath, "evenodd");
    ctx.restore();
  }

  for (const polygon of scene.polygons) {
    if (polygon.vertices.length < 3) continue;

    if (polygon.isGrass) {
      if (scene.visibility.showPolygons) {
        drawGrassPolygon({
          ctx,
          lgrAssets,
          vertices: polygon.vertices,
          groundPath,
          useGrassAssets: scene.visibility.useGroundSkyTextures,
        });
      }
      if (!scene.visibility.showPolygonBounds) continue;
      ctx.strokeStyle = colors.grass;
      ctx.lineWidth = 1 / scene.viewport.zoom;
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      ctx.beginPath();
      for (const index of polygon.grassEdgeIndices) {
        const from = polygon.vertices[index]!;
        const to = polygon.vertices[(index + 1) % polygon.vertices.length]!;
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
      ctx.stroke();
      continue;
    }

    if (!scene.visibility.showPolygonBounds) continue;
    ctx.strokeStyle = colors.edges;
    ctx.lineWidth = 1 / scene.viewport.zoom;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(polygon.vertices[0]!.x, polygon.vertices[0]!.y);
    for (let i = 1; i < polygon.vertices.length; i += 1) {
      ctx.lineTo(polygon.vertices[i]!.x, polygon.vertices[i]!.y);
    }
    ctx.lineTo(polygon.vertices[0]!.x, polygon.vertices[0]!.y);
    ctx.stroke();
  }
}

function getTexturePattern(
  ctx: CanvasRenderingContext2D,
  lgrAssets: CanvasWorldRenderContext["lgrAssets"],
  textureName: string,
) {
  if (!lgrAssets) return null;

  const textureSprite = lgrAssets.getSprite(textureName);
  if (!textureSprite) return null;

  const pattern = ctx.createPattern(textureSprite, "repeat");
  if (!pattern) return null;

  pattern.setTransform(new DOMMatrix().scale(PICTURE_SCALE, PICTURE_SCALE));
  return pattern;
}

function getFlatTextureColor(textureName: string, fallback: string) {
  const textureColor = colors[textureName as keyof typeof colors];
  return textureColor ?? fallback;
}
